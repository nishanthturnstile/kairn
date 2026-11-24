import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "../../apps/server/src/app";
import { createJourneyOperations } from "../../apps/server/src/journey-operations";
import {
  createAuth,
  initializeLocalIdentity,
  localRecoveryEpoch,
  openDatabase,
  openJobQueue,
  openObjectStore,
  registerRecordingWorkers,
  replayIdentityRestrictions,
} from "../../packages/backend/src/index";
import {
  type RestrictionJournal,
  restrictionDigest,
} from "../../packages/backend/src/modules/lifecycle/restriction-journal";
import { recordingInspectionQueue } from "../../packages/backend/src/modules/recordings/job-queue";
import { reconcileRecordingStaging } from "../../packages/backend/src/modules/recordings/worker";
import {
  type BeginRecordingUpload,
  type CommitRecordingImport,
  gpxLimits,
  ownerRecordingPage,
  recordingBatch,
  recordingBatchOverlay,
  recordingBatchReview,
  recordingCommit,
  recordingImport,
  recordingUpload,
} from "../../packages/contracts/src/recordings";
import { largeTrack } from "../fixtures/gpx/generated";

const runtimeUrl =
  process.env.KAIRN_TEST_DATABASE_URL ??
  "postgresql://kairn_runtime:local-runtime-only@127.0.0.1:55432/kairn";
const migrationUrl =
  process.env.KAIRN_TEST_MIGRATION_DATABASE_URL ??
  "postgresql://kairn_migrator:local-migrator-only@127.0.0.1:55432/kairn";
const origin = "http://kairn.test";
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const fixture = new URL("../fixtures/gpx/two-runs.gpx", import.meta.url);

describe.runIf(process.env.KAIRN_INTEGRATION === "1")(
  "private GPX transfer and processing",
  () => {
    const runtime = openDatabase(runtimeUrl);
    const owner = openDatabase(migrationUrl);
    const boss = openJobQueue(runtimeUrl, true);
    const store = openObjectStore({
      endpoint: process.env.KAIRN_TEST_S3_ENDPOINT ?? "http://127.0.0.1:58333",
      bucket: process.env.KAIRN_S3_BUCKET ?? "kairn-private",
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.KAIRN_S3_ACCESS_KEY ?? "kairn-local",
        secretAccessKey:
          process.env.KAIRN_S3_SECRET_KEY ?? "local-storage-only",
      },
    });
    const config = {
      baseURL: origin,
      secret: randomBytes(32).toString("hex"),
      mailKey: randomBytes(32).toString("hex"),
      epoch: localRecoveryEpoch,
      boss,
      recordingStore: store,
    };
    function application(
      options: typeof config & {
        journal?: RestrictionJournal;
        recordingDeletionEnabled?: boolean;
      } = config,
      db = runtime.db,
    ) {
      const auth = createAuth(db, options);
      return createApp({
        authHandler: auth.handler,
        checkReadiness: async () => {},
        journeys: createJourneyOperations(auth, options),
      });
    }
    const app = application();
    const objects = new Set<string>();
    let requestNumber = 0;
    let stopReclaim: (() => Promise<void>) | undefined;
    type Account = { id: string; cookie: string; email: string };
    let alice: Account;
    let bob: Account;

    const password = "Synthetic-recording-password";
    function identity(path: string, body: object, target = app) {
      return target.request(`${origin}/api/auth/${path}/email`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-Forwarded-For": `198.51.100.${++requestNumber}`,
        },
        body: JSON.stringify(body),
      });
    }

    async function signIn(id: string, email: string, target = app) {
      const signedIn = await identity("sign-in", { email, password }, target);
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers
        .getSetCookie()
        .find((value) => value.includes("session_token="))
        ?.split(";")[0];
      if (!cookie) throw new Error("Missing test session");
      return { id, cookie, email };
    }

    async function member() {
      const email = `gpx-${randomUUID()}@example.test`;
      const send = vi
        .spyOn(boss, "send")
        .mockImplementationOnce(
          async (_queue, _data, options) => options?.id ?? null,
        );
      const signedUp = await identity("sign-up", {
        email,
        password,
        name: "GPX test account",
      }).finally(() => send.mockRestore());
      expect(signedUp.status).toBe(200);
      const { user } = await signedUp.json();
      await owner.pool.query(
        'update kairn_auth."user" set email_verified = true where id = $1',
        [user.id],
      );
      return signIn(String(user.id), email);
    }

    function request(
      account: Account,
      path: string,
      init?: RequestInit,
      target = app,
    ) {
      const headers = new Headers(init?.headers);
      headers.set("Cookie", account.cookie);
      if (!headers.has("X-Expected-Account"))
        headers.set("X-Expected-Account", account.id);
      if (!headers.has("Origin")) headers.set("Origin", origin);
      return target.request(`/api/v1${path}`, { ...init, headers });
    }

    const input = (bytes: Uint8Array): BeginRecordingUpload => ({
      protocolVersion: 1,
      deviceId: randomUUID(),
      commandId: randomUUID(),
      kind: "gpx",
      fileName: "Morning hike.gpx",
      byteLength: bytes.length,
      sha256: digest(bytes),
    });

    async function begin(account: Account, data: BeginRecordingUpload) {
      const response = await request(account, "/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      const receipt = recordingUpload.parse(await response.json());
      objects.add(receipt.id);
      return receipt;
    }

    const sendPart = (
      account: Account,
      id: string,
      part: number,
      bytes: Buffer,
      sha256 = digest(bytes),
    ) =>
      request(account, `/uploads/${id}/parts/${part}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytes.length),
          "X-Part-Sha256": sha256,
        },
        body: bytes,
      });

    const complete = (account: Account, id: string) =>
      request(account, `/uploads/${id}/complete`, { method: "POST" });

    beforeAll(async () => {
      await initializeLocalIdentity(runtime.db, localRecoveryEpoch);
      await boss.start();
      alice = await member();
      bob = await member();
    }, 15_000);

    afterAll(async () => {
      await stopReclaim?.();
      await boss.stop({ graceful: true, timeout: 5_000 });
      for (const id of objects) {
        for await (const { key } of store.list(`recordings/${id}/`))
          await store.remove(key);
      }
      store.close();
      await Promise.all([runtime.pool.end(), owner.pool.end()]);
    });

    it("replays the verified receipt after a failed database commit and parses on worker startup", async () => {
      const bytes = await readFile(fixture);
      const command = input(bytes);
      const { id } = await begin(alice, command);
      expect((await begin(alice, command)).id).toBe(id);
      expect((await request(bob, `/uploads/${id}`)).status).toBe(404);
      expect(
        (
          await request(alice, `/uploads/${id}`, {
            headers: { "X-Expected-Account": bob.id },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(alice, `/uploads/${id}`, {
            method: "DELETE",
            headers: { Origin: "https://foreign.test" },
          })
        ).status,
      ).toBe(403);
      expect((await complete(alice, id)).status).toBe(409);
      expect((await sendPart(alice, id, 1, bytes, "a".repeat(64))).status).toBe(
        400,
      );
      expect((await sendPart(bob, id, 1, bytes)).status).toBe(404);
      expect((await sendPart(alice, id, 1, bytes)).status).toBe(200);
      expect((await sendPart(alice, id, 1, bytes)).status).toBe(200);
      expect(
        (await sendPart(alice, id, 1, Buffer.alloc(bytes.length))).status,
      ).toBe(409);

      const enqueue = boss.send.bind(boss);
      const rejected = vi
        .spyOn(boss, "send")
        .mockImplementation(async (queue, data, options) => {
          if (queue === recordingInspectionQueue)
            throw new Error("Synthetic database failure");
          return enqueue(queue, data, options);
        });
      try {
        expect((await complete(alice, id)).status).toBe(503);
        expect(await store.head(`recordings/${id}/original`)).toMatchObject({
          size: bytes.length,
        });
        expect((await request(alice, `/imports/${id}`)).status).toBe(404);
      } finally {
        rejected.mockRestore();
      }

      const finalized = await Promise.all([
        complete(alice, id),
        complete(alice, id),
      ]);
      for (const result of finalized) {
        expect(result.status).toBe(200);
        expect(recordingUpload.parse(await result.json())).toMatchObject({
          state: "complete",
          importId: id,
          parts: [{ partNumber: 1 }],
        });
      }
      expect((await sendPart(alice, id, 1, bytes)).status).toBe(200);
      expect(
        (await sendPart(alice, id, 1, Buffer.alloc(bytes.length))).status,
      ).toBe(409);
      const queued = await request(alice, `/imports/${id}`);
      expect(recordingImport.parse(await queued.json()).stage).toBe("queued");

      const idRow = await runtime.pool.connect();
      try {
        await idRow.query("begin");
        await idRow.query(
          "select set_config('kairn.recording_account', $1, true)",
          [alice.id],
        );
        const { rows } = await idRow.query(
          `
          select inspection_job_id from kairn.recording_originals
          where upload_id = $1
        `,
          [id],
        );
        await boss.cancel(recordingInspectionQueue, rows[0].inspection_job_id);
        await idRow.query("commit");
      } finally {
        idRow.release();
      }
      expect(
        recordingImport.parse(
          await (await request(alice, `/imports/${id}`)).json(),
        ).stage,
      ).toBe("failed");
      expect(
        (await request(alice, "/imports").then((result) => result.json()))
          .imports[0].stage,
      ).toBe("failed");
      expect(
        recordingImport.parse(
          await (
            await request(alice, `/imports/${id}/retry`, { method: "POST" })
          ).json(),
        ).stage,
      ).toBe("queued");
      stopReclaim = await registerRecordingWorkers(boss, runtime.db, store);
      await expect
        .poll(
          async () => {
            const status = await request(alice, `/imports/${id}`);
            return recordingImport.parse(await status.json()).stage;
          },
          { timeout: 12_000 },
        )
        .toBe("ready");

      const sections = await request(alice, `/imports/${id}/segments`).then(
        (result) => result.json(),
      );
      expect(sections.sections).toHaveLength(2);
      expect(sections.sections[0]).toMatchObject({
        ordinal: 0,
        segmentIndex: 0,
        included: true,
        trackName: "Sentier d’été & forêt",
        measurements: { elapsedSeconds: 600 },
      });
      expect(sections.sections[0]).not.toHaveProperty("samples");
      expect(
        (
          await request(alice, `/imports/${id}/segments/0/samples`).then(
            (result) => result.json(),
          )
        ).samples,
      ).toHaveLength(2);
      expect((await request(bob, `/imports/${id}`)).status).toBe(404);
      expect((await request(bob, `/imports/${id}/segments`)).status).toBe(404);
      expect(
        (await request(bob, `/imports/${id}/segments/0/samples`)).status,
      ).toBe(404);
      expect(
        await request(bob, "/imports").then((result) => result.json()),
      ).toEqual({ imports: [], nextCursor: null });
      await expect
        .poll(() => store.head(`recordings/${id}/parts/1`), { timeout: 12_000 })
        .toBeNull();
      expect(await store.head(`recordings/${id}/original`)).toMatchObject({
        size: bytes.length,
      });
    }, 25_000);

    it("accepts out-of-order parts, verifies the full object and reuses owner content only", async () => {
      const base = await readFile(fixture, "utf8");
      const bytes = Buffer.from(
        base.replace(
          "</g:gpx>",
          `${"<!-- padding -->".repeat(550_000)}</g:gpx>`,
        ),
      );
      expect(bytes.length).toBeGreaterThan(gpxLimits.partBytes);
      const first = bytes.subarray(0, gpxLimits.partBytes);
      const second = bytes.subarray(gpxLimits.partBytes);
      const { id } = await begin(alice, input(bytes));
      expect((await sendPart(alice, id, 2, second)).status).toBe(200);
      const partial = await request(alice, `/uploads/${id}`).then((response) =>
        response.json(),
      );
      expect(
        partial.parts.map((part: { partNumber: number }) => part.partNumber),
      ).toEqual([2]);
      expect((await complete(alice, id)).status).toBe(409);
      expect((await sendPart(alice, id, 1, first)).status).toBe(200);
      expect((await complete(alice, id)).status).toBe(200);

      const same = await begin(alice, {
        ...input(bytes),
        fileName: "Repeat.gpx",
      });
      expect((await sendPart(alice, same.id, 1, first)).status).toBe(200);
      expect((await sendPart(alice, same.id, 2, second)).status).toBe(200);
      expect((await complete(alice, same.id)).status).toBe(200);
      await expect
        .poll(() => store.head(`recordings/${same.id}/original`), {
          timeout: 12_000,
        })
        .toBeNull();
      await expect
        .poll(
          async () => {
            const result = await request(alice, `/imports/${same.id}`);
            return recordingImport.parse(await result.json()).stage;
          },
          { timeout: 12_000 },
        )
        .toBe("ready");

      const other = await begin(bob, input(bytes));
      expect((await sendPart(bob, other.id, 1, first)).status).toBe(200);
      expect((await sendPart(bob, other.id, 2, second)).status).toBe(200);
      expect((await complete(bob, other.id)).status).toBe(200);
      expect(await store.head(`recordings/${other.id}/original`)).toMatchObject(
        { size: bytes.length },
      );
    }, 35_000);

    it("keeps a batch private and reclaims its originals only after the last draft is removed", async () => {
      const bytes = Buffer.concat([
        await readFile(fixture),
        Buffer.from(`\n<!-- ${randomUUID()} -->\n`),
      ]);
      const batch = randomUUID();
      const reusedBatch = randomUUID();
      const first = await begin(alice, {
        ...input(bytes),
        batch: { id: batch, position: 0 },
      });
      const second = await begin(alice, {
        ...input(bytes),
        batch: { id: reusedBatch, position: 0 },
      });
      const remove = (id: string) =>
        request(alice, `/uploads/${id}`, { method: "DELETE" });
      const batchRoute = `/recording-batches/${batch}`;
      expect((await request(bob, batchRoute)).status).toBe(404);
      expect(
        (await request(bob, `/uploads/${first.id}`, { method: "DELETE" }))
          .status,
      ).toBe(404);
      expect(
        recordingBatch.parse(await (await request(alice, batchRoute)).json())
          .files,
      ).toMatchObject([{ position: 0, upload: { id: first.id } }]);
      for (const { id } of [first, second]) {
        expect((await sendPart(alice, id, 1, bytes)).status).toBe(200);
        expect((await complete(alice, id)).status).toBe(200);
      }
      await expect
        .poll(
          async () =>
            recordingImport.parse(
              await (await request(alice, `/imports/${second.id}`)).json(),
            ).stage,
          { timeout: 12_000 },
        )
        .toBe("ready");
      expect(
        (await request(alice, "/imports").then((response) => response.json()))
          .imports,
      ).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: second.id })]),
      );
      const names = ownerRecordingPage.parse(
        await (await request(alice, "/account/recordings")).json(),
      ).recordings;
      expect(names.some((entry) => entry.byteLength === bytes.length)).toBe(
        false,
      );

      expect((await remove(first.id)).status).toBe(200);
      expect((await remove(first.id)).status).toBe(200);
      expect((await request(alice, `/imports/${first.id}`)).status).toBe(404);
      expect(
        (await request(alice, `/imports/${second.id}/segments`)).status,
      ).toBe(200);
      expect(
        await store.head(`recordings/${first.id}/original`),
      ).not.toBeNull();
      expect((await remove(second.id)).status).toBe(200);
      expect(
        recordingBatch.parse(await (await request(alice, batchRoute)).json())
          .files,
      ).toEqual([]);
      await expect
        .poll(() => store.head(`recordings/${first.id}/original`), {
          timeout: 12_000,
        })
        .toBeNull();

      const again = await begin(alice, {
        ...input(bytes),
        batch: { id: batch, position: 0 },
      });
      expect((await sendPart(alice, again.id, 1, bytes)).status).toBe(200);
      expect((await complete(alice, again.id)).status).toBe(200);
      expect((await remove(again.id)).status).toBe(200);
    }, 30_000);

    it("expires staged objects and releases the reservation while preserving retained originals", async () => {
      const original = await readFile(fixture);
      const batchId = randomUUID();
      const temporary = Buffer.concat([
        original,
        Buffer.from(`\n<!-- ${randomUUID()} -->\n`),
      ]);
      const retained = await begin(alice, input(original));
      const shared = await begin(alice, {
        ...input(original),
        batch: { id: batchId, position: 0 },
      });
      const staged = await begin(alice, {
        ...input(temporary),
        batch: { id: batchId, position: 1 },
      });
      for (const [file, bytes] of [
        [retained, original],
        [shared, original],
        [staged, temporary],
      ] as const) {
        expect((await sendPart(alice, file.id, 1, bytes)).status).toBe(200);
        expect((await complete(alice, file.id)).status).toBe(200);
      }
      const session = await runtime.pool.connect();
      try {
        await session.query("begin");
        await session.query(
          "select set_config('kairn.recording_account', $1, true)",
          [alice.id],
        );
        await session.query(
          "update kairn.recording_batches set expires_at = now() - interval '1 hour' where id = $1",
          [batchId],
        );
        await session.query(
          "update kairn.recording_uploads set expires_at = now() - interval '1 hour' where batch_id = $1",
          [batchId],
        );
        await session.query("commit");
        expect(
          (await request(alice, `/recording-batches/${batchId}`)).status,
        ).toBe(404);
        const due = await runtime.pool.query(
          "select * from kairn.recording_batch_expired_files()",
        );
        expect(due.rows).toEqual(
          expect.arrayContaining([{ id: staged.id, ownerId: alice.id }]),
        );
        await reconcileRecordingStaging(runtime.db, boss, store);
        await expect
          .poll(() => store.head(`recordings/${staged.id}/original`), {
            timeout: 25_000,
          })
          .toBeNull();
        const listed = ownerRecordingPage.parse(
          await (await request(alice, "/account/recordings")).json(),
        ).recordings;
        const stillRetained = listed.find(
          (item) => item.byteLength === original.length,
        );
        expect(stillRetained).toBeDefined();
        expect(
          (
            await request(
              alice,
              `/account/recordings/${stillRetained?.id}/original`,
            )
          ).status,
        ).toBe(200);
        await session.query("begin");
        await session.query(
          "select set_config('kairn.recording_account', $1, true)",
          [alice.id],
        );
        await expect
          .poll(
            async () => {
              const { rows } = await session.query(
                "select count(*)::integer as held from kairn.recording_uploads where batch_id = $1 and cleaned_at is null",
                [batchId],
              );
              return rows[0].held;
            },
            { timeout: 12_000 },
          )
          .toBe(0);
      } finally {
        await session.query("rollback");
        session.release();
      }
    }, 45_000);

    it("closes a batch slot even when a part completion races removal", async () => {
      const bytes = Buffer.concat([
        await readFile(fixture),
        Buffer.from(`\n<!-- ${randomUUID()} -->\n`),
      ]);
      const draft = {
        ...input(bytes),
        batch: { id: randomUUID(), position: 0 },
      };
      const { id } = await begin(alice, draft);
      expect((await sendPart(alice, id, 1, bytes)).status).toBe(200);
      const [, removal] = await Promise.all([
        complete(alice, id),
        request(alice, `/uploads/${id}`, { method: "DELETE" }),
      ]);
      expect(removal.status).toBe(200);
      expect((await begin(alice, draft)).state).toBe("aborted");
      expect((await request(alice, `/imports/${id}`)).status).toBe(404);
      await expect
        .poll(() => store.head(`recordings/${id}/parts/1`), { timeout: 12_000 })
        .toBeNull();
      expect(await store.head(`recordings/${id}/original`)).toBeNull();
    }, 20_000);

    it("keeps ascent across GPX gaps and restores it for a legacy staged recording", async () => {
      const base = await readFile(fixture, "utf8");
      const bytes = Buffer.from(
        base
          .replace("<g:ele>-4</g:ele>", "<g:ele>12</g:ele>")
          .replace(
            "<g:time>2026-06-12T15:40",
            "<g:ele>200</g:ele><g:time>2026-06-12T15:40",
          )
          .replace(
            "<g:time>2026-06-12T15:50",
            "<g:ele>215</g:ele><g:time>2026-06-12T15:50",
          ),
      );
      const batch = randomUUID();
      const transfer = await begin(alice, {
        ...input(bytes),
        batch: { id: batch, position: 0 },
      });
      expect((await sendPart(alice, transfer.id, 1, bytes)).status).toBe(200);
      expect((await complete(alice, transfer.id)).status).toBe(200);
      const review = async () =>
        recordingBatchReview.parse(
          await (
            await request(alice, `/recording-batches/${batch}/review`)
          ).json(),
        );
      await expect
        .poll(async () => (await review()).complete, { timeout: 25_000 })
        .toBe(true);
      const measurements = await review();
      expect(measurements.measurements).toMatchObject({
        elevationGainMetres: 25,
        elevationMinMetres: 2,
        elevationMaxMetres: 215,
        elapsedSeconds: 1200,
      });

      const connection = await owner.pool.connect();
      try {
        await connection.query("begin");
        await connection.query(
          "select set_config('kairn.recording_account', $1, true)",
          [alice.id],
        );
        const result = await connection.query(
          `update kairn.recording_sections
           set summary = summary #- '{measurements,elevationGainMetres}'
           where original_id = (select original_id from kairn.recording_imports where id = $1)`,
          [transfer.id],
        );
        expect(result.rowCount).toBe(2);
        await connection.query("commit");
      } finally {
        await connection.query("rollback");
        connection.release();
      }
      expect((await review()).measurements).toEqual(measurements.measurements);
      const duplicate = await begin(alice, {
        ...input(bytes),
        batch: { id: batch, position: 1 },
      });
      expect((await sendPart(alice, duplicate.id, 1, bytes)).status).toBe(200);
      expect((await complete(alice, duplicate.id)).status).toBe(200);
      await expect
        .poll(async () => (await review()).files.length, { timeout: 25_000 })
        .toBe(2);
      expect((await review()).measurements).toEqual(measurements.measurements);
    }, 60_000);

    for (const timed of [true, false]) {
      it(`saves one ${timed ? "dated" : "undated"} private journey from a reviewed batch`, async () => {
        const base = await readFile(fixture, "utf8");
        const first = Buffer.from(
          base
            .replace(
              "  <g:wpt",
              "  <g:metadata><g:name>Coast walk</g:name></g:metadata>\n  <g:wpt",
            )
            .replace(
              "<g:trkseg>",
              '<g:trkseg><g:trkpt lat="1" lon="1"/></g:trkseg>'.repeat(8) +
                "<g:trkseg>",
            ),
        );
        const second = Buffer.from(
          timed
            ? base
                .replace("T08:00", "T08:30")
                .replace("T08:10", "T08:40")
                .replaceAll("T15:", "T14:")
            : base.replaceAll(/<g:time>[^<]+<\/g:time>/g, ""),
        );
        const batch = randomUUID();
        const batchRoute = `/recording-batches/${batch}`;
        const uploads = await Promise.all(
          [first, second].map((bytes, position) =>
            begin(alice, { ...input(bytes), batch: { id: batch, position } }),
          ),
        );
        for (const [index, bytes] of [first, second].entries()) {
          const { id } = uploads[index];
          expect((await sendPart(alice, id, 1, bytes)).status).toBe(200);
          expect((await complete(alice, id)).status).toBe(200);
        }
        const review = async () =>
          recordingBatchReview.parse(
            await (await request(alice, `${batchRoute}/review`)).json(),
          );
        await expect
          .poll(async () => (await review()).complete, { timeout: 25_000 })
          .toBe(true);
        const summary = await review();
        expect(summary.title).toBe("Coast walk");
        expect(summary.measurements).toMatchObject({
          elapsedSeconds: timed ? 2400 : null,
          elevationGainMetres: null,
          elevationMinMetres: -4,
          elevationMaxMetres: 2,
        });
        expect(summary.recordedWindow).toEqual(
          timed
            ? { start: "2026-06-12T08:00:00Z", end: "2026-06-12T10:20:00Z" }
            : null,
        );
        const overlay = recordingBatchOverlay.parse(
          await (await request(alice, `${batchRoute}/overlay`)).json(),
        );
        expect(overlay.files).toEqual(
          summary.files.map(({ id, revision }) => ({ id, revision })),
        );
        expect(new Set(overlay.paths.map((path) => path.series))).toEqual(
          new Set([0, 1]),
        );
        expect((await request(bob, `${batchRoute}/overlay`)).status).toBe(404);

        const files = summary.files.map(({ id, revision }) => ({
          id,
          revision,
        }));
        const commit = (body: unknown, account = alice) =>
          request(account, `${batchRoute}/commit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        if (timed) {
          const duplicate = await begin(alice, {
            ...input(first),
            batch: { id: batch, position: 2 },
          });
          expect((await sendPart(alice, duplicate.id, 1, first)).status).toBe(
            200,
          );
          expect((await complete(alice, duplicate.id)).status).toBe(200);
          const change = await request(
            alice,
            `/imports/${duplicate.id}/review`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                revision: 1,
                selection: { excluded: [8], splits: [] },
              }),
            },
          );
          expect(change.status).toBe(200);
          const conflict = await review();
          expect(conflict).toMatchObject({
            complete: false,
            duplicateReviewConflict: true,
          });
          expect(
            (
              await commit({
                files: conflict.files.map(({ id, revision }) => ({
                  id,
                  revision,
                })),
              })
            ).status,
          ).toBe(409);
          expect(
            (
              await request(alice, `/uploads/${duplicate.id}`, {
                method: "DELETE",
              })
            ).status,
          ).toBe(200);
        }
        expect(
          (
            await commit({
              files: [
                { ...files[0], revision: files[0].revision + 1 },
                files[1],
              ],
            })
          ).status,
        ).toBe(412);
        expect((await commit({ files }, bob)).status).toBe(404);
        const [saved, replay] = await Promise.all([
          commit({ files }),
          // Native supplies the account and session without a browser Origin.
          app.request(`/api/v1${batchRoute}/commit`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: alice.cookie,
              "X-Expected-Account": alice.id,
            },
            body: JSON.stringify({ files }),
          }),
        ]);
        expect(saved.status).toBe(200);
        expect(replay.status).toBe(200);
        const journey = await saved.json();
        expect(await replay.json()).toEqual(journey);
        expect((await commit({ files, title: "Different title" })).status).toBe(
          409,
        );
        expect(
          (
            await request(alice, `/uploads/${uploads[0].id}`, {
              method: "DELETE",
            })
          ).status,
        ).toBe(409);
        const detail = await (
          await request(alice, `/journeys/${journey.id}`)
        ).json();
        expect(detail).toMatchObject({
          title: "Coast walk",
          schedule: timed ? { timeZone: "UTC" } : null,
        });
        expect((await request(bob, `/journeys/${journey.id}`)).status).toBe(
          404,
        );
        const attachments = await (
          await request(alice, `/journeys/${journey.id}/recordings`)
        ).json();
        expect(attachments.recordings).toHaveLength(2);
        expect(
          attachments.recordings.every(
            (item: { scope: string }) => item.scope === "only_me",
          ),
        ).toBe(true);
        const overviewPath = `/journeys/${journey.id}/recordings/overview`;
        const overview = await request(alice, overviewPath);
        expect(overview.status).toBe(200);
        const route = await overview.json();
        expect(route).toMatchObject({ version: 1, limited: false });
        expect(
          new Set(route.paths.map(({ series }: { series: number }) => series)),
        ).toEqual(new Set([0, 1]));
        expect((await request(bob, overviewPath)).status).toBe(404);
        if (!timed) {
          const journeyPath = `/journeys/${journey.id}`;
          expect(
            (await request(alice, journeyPath, { method: "DELETE" })).status,
          ).toBe(202);
          expect((await request(alice, journeyPath)).status).toBe(404);
          expect((await commit({ files })).status).toBe(404);
          const originals = ownerRecordingPage.parse(
            await (await request(alice, "/account/recordings")).json(),
          );
          const recording = originals.recordings.find(
            ({ byteLength }) => byteLength === first.byteLength,
          );
          expect(recording).toBeDefined();
          const source = await request(
            alice,
            `/account/recordings/${recording?.id}/original`,
          );
          expect(source.status).toBe(200);
          expect(Buffer.from(await source.arrayBuffer())).toEqual(first);
        }
      }, 45_000);
    }

    it("never creates an import when the whole-file digest is wrong or the upload is aborted", async () => {
      const bytes = await readFile(fixture);
      const wrong = await begin(alice, {
        ...input(bytes),
        sha256: "a".repeat(64),
      });
      expect((await sendPart(alice, wrong.id, 1, bytes)).status).toBe(200);
      expect(
        recordingUpload.parse(await (await complete(alice, wrong.id)).json()),
      ).toMatchObject({
        state: "rejected",
        importId: null,
      });
      expect((await request(alice, `/imports/${wrong.id}`)).status).toBe(404);
      const pending = await begin(alice, input(bytes));
      expect((await sendPart(alice, pending.id, 1, bytes)).status).toBe(200);
      expect(
        recordingUpload.parse(
          await (
            await request(alice, `/uploads/${pending.id}`, { method: "DELETE" })
          ).json(),
        ),
      ).toMatchObject({
        state: "aborted",
        importId: null,
      });
      expect((await complete(alice, pending.id)).status).toBe(409);
      await expect
        .poll(() => store.head(`recordings/${pending.id}/parts/1`), {
          timeout: 12_000,
        })
        .toBeNull();
    }, 20_000);

    async function readyImport(account: Account, bytes: Buffer) {
      const { id } = await begin(account, input(bytes));
      expect((await sendPart(account, id, 1, bytes)).status).toBe(200);
      expect((await complete(account, id)).status).toBe(200);
      await expect
        .poll(
          async () => {
            const response = await request(account, `/imports/${id}`);
            return recordingImport.parse(await response.json()).stage;
          },
          { timeout: 12_000 },
        )
        .toBe("ready");
      return id;
    }

    function bodyRequest(
      account: Account,
      path: string,
      method: "POST" | "PATCH" | "DELETE",
      payload: object,
    ) {
      return request(account, path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    const journey = {
      title: "Hike and train",
      intendedStart: "2026-06-11T07:00",
      intendedEnd: "2026-06-14T08:00",
      timeZone: "Asia/Kolkata",
    };

    function commitCommand(
      destination: CommitRecordingImport["destination"],
      revision = 1,
    ): CommitRecordingImport {
      return {
        protocolVersion: 1,
        deviceId: randomUUID(),
        commandId: randomUUID(),
        reviewRevision: revision,
        destination,
        scope: "only_me",
        placeInDraft: false,
      };
    }

    it("pins review edits, creates a complete itinerary and replays the same receipt", async () => {
      const bytes = await readFile(fixture);
      const id = await readyImport(alice, bytes);
      const rejected = await bodyRequest(
        alice,
        `/imports/${id}/review`,
        "PATCH",
        {
          revision: 1,
          selection: { excluded: [0, 1], splits: [] },
        },
      );
      expect(rejected.status).toBe(400);
      const review = await bodyRequest(
        alice,
        `/imports/${id}/review`,
        "PATCH",
        {
          revision: 1,
          selection: {
            excluded: [],
            splits: [{ section: 0, beforePoint: 1 }],
            clock: { shiftMinutes: 60, displayTimeZone: "Europe/London" },
          },
        },
      );
      expect(review.status).toBe(200);
      expect(await review.json()).toMatchObject({
        revision: 2,
        summary: { recordedWindow: { start: "2026-06-12T11:10:00Z" } },
      });
      const preview = await request(alice, `/imports/${id}/segments`).then(
        (response) => response.json(),
      );
      expect(preview.sections[0].splitRuns).toHaveLength(2);
      expect(preview.sections[0].splitRuns[1]).toMatchObject({
        breakBefore: "user_split",
        measurements: {
          distanceMetres: null,
          firstInstant: "2026-06-12T09:10:00Z",
        },
      });
      expect(preview.sections[0].displayTimeZone).toBe("Europe/London");
      const raw = await request(
        alice,
        `/imports/${id}/segments/0/samples`,
      ).then((response) => response.json());
      expect(raw.samples[1].instant).toBe("2026-06-12T08:10:00Z");
      const map = await request(alice, `/imports/${id}/overlay?through=1`);
      expect(map.status).toBe(200);
      expect(await map.json()).toMatchObject({
        paths: [
          {
            section: 1,
            coordinates: [
              [1, 0],
              [1.01, 0],
            ],
          },
        ],
      });
      const command = commitCommand({ kind: "new", journey }, 2);
      expect(
        (
          await bodyRequest(alice, `/imports/${id}/commit`, "POST", {
            ...command,
            reviewRevision: 1,
          })
        ).status,
      ).toBe(412);

      const attempts = await Promise.all(
        Array.from({ length: 2 }, () =>
          bodyRequest(alice, `/imports/${id}/commit`, "POST", command),
        ),
      );
      expect(attempts.map(({ status }) => status)).toEqual([200, 200]);
      const [result, replay] = await Promise.all(
        attempts.map((attempt) => attempt.json()),
      );
      expect(result).toEqual(replay);
      expect(result).toMatchObject({
        outcome: "created",
        scope: "only_me",
        placedInDraft: false,
      });
      expect(
        (
          await bodyRequest(alice, `/imports/${id}/commit`, "POST", {
            ...command,
            scope: "journey_review",
          })
        ).status,
      ).toBe(409);
      const saved = await request(alice, `/journeys/${result.journeyId}`).then(
        (response) => response.json(),
      );
      expect(saved.schedule).toMatchObject({
        intendedStart: { local: journey.intendedStart },
        intendedEnd: { local: journey.intendedEnd },
        timeZone: journey.timeZone,
      });
      const list = await request(
        alice,
        `/journeys/${result.journeyId}/recordings`,
      ).then((response) => response.json());
      expect(list.recordings).toMatchObject([
        { scope: "only_me", owned: true },
      ]);
      await owner.pool.query(
        `insert into kairn.journey_memberships (journey_id, account_id) values ($1,$2)`,
        [result.journeyId, bob.id],
      );
      await owner.pool.query(
        `insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1,$2,'coauthor')`,
        [result.journeyId, bob.id],
      );
      expect(
        await request(bob, `/journeys/${result.journeyId}/recordings`).then(
          (response) => response.json(),
        ),
      ).toEqual({ recordings: [], nextCursor: null });
      expect(
        (
          await request(
            bob,
            `/journeys/${result.journeyId}/recordings/${result.associationId}/segments`,
          )
        ).status,
      ).toBe(404);

      const original = await request(
        alice,
        `/account/recordings/${result.recordingId}/original`,
        { headers: { Range: "bytes=0-11" } },
      );
      expect(original.status).toBe(206);
      expect(original.headers.get("Content-Range")).toBe(
        `bytes 0-11/${bytes.length}`,
      );
      expect(Buffer.from(await original.arrayBuffer())).toEqual(
        bytes.subarray(0, 12),
      );
      expect(
        (
          await request(
            bob,
            `/account/recordings/${result.recordingId}/original`,
            { headers: { Range: "bytes=0-11" } },
          )
        ).status,
      ).toBe(404);
    }, 20_000);

    it("rechecks membership, pins a contribution and hides it after withdrawal", async () => {
      const created = await bodyRequest(bob, "/journeys", "POST", journey);
      // Manual creation requires its existing idempotency header.
      expect(created.status).toBe(400);
      const result = await request(bob, "/journeys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(journey),
      });
      expect(result.status).toBe(201);
      const { id: journeyId } = await result.json();
      await owner.pool.query(
        `insert into kairn.journey_memberships (journey_id, account_id) values ($1,$2)`,
        [journeyId, alice.id],
      );
      const eligibility = (account: Account) =>
        request(
          account,
          `/recording-attachment-destinations/${journeyId}`,
        ).then((response) => response.json());
      const destination = await eligibility(alice);
      expect(destination).toMatchObject({
        canPlace: false,
        title: journey.title,
      });
      const id = await readyImport(alice, await readFile(fixture));
      const existing = {
        kind: "existing" as const,
        journeyId,
        membershipGeneration: destination.membershipGeneration,
        grantRevision: 0,
      };
      const command = {
        ...commitCommand(existing),
        scope: "journey_review" as const,
      };
      expect(
        (
          await bodyRequest(alice, `/imports/${id}/commit`, "POST", {
            ...command,
            placeInDraft: true,
          })
        ).status,
      ).toBe(412);
      await owner.pool.query(
        `update kairn.journey_memberships set generation = gen_random_uuid() where journey_id = $1 and account_id = $2`,
        [journeyId, alice.id],
      );
      expect(
        (await bodyRequest(alice, `/imports/${id}/commit`, "POST", command))
          .status,
      ).toBe(412);
      const current = await eligibility(alice);
      const accepted = {
        ...command,
        destination: {
          ...existing,
          membershipGeneration: current.membershipGeneration,
        },
      };
      const response = await bodyRequest(
        alice,
        `/imports/${id}/commit`,
        "POST",
        accepted,
      );
      expect(response.status).toBe(200);
      const receipt = await response.json();
      expect(receipt).toMatchObject({
        outcome: "added",
        scope: "journey_review",
        journeyId,
      });
      const list = (account: Account) =>
        request(account, `/journeys/${journeyId}/recordings`).then((response) =>
          response.json(),
        );
      const ownerView = (await list(alice)).recordings[0];
      expect((await list(bob)).recordings).toMatchObject([
        { owned: false, sourceId: null, scope: "journey_review" },
      ]);
      const sections = await request(
        bob,
        `/journeys/${journeyId}/recordings/${receipt.associationId}/segments`,
      );
      expect(sections.status).toBe(200);
      expect((await sections.json()).sections).toHaveLength(2);
      const route = (account: Account) =>
        request(account, `/journeys/${journeyId}/recordings/overview`).then(
          (response) => response.json(),
        );
      expect((await route(bob)).paths).toHaveLength(2);
      const withdrawal = await bodyRequest(
        alice,
        `/journeys/${journeyId}/sources/${ownerView.sourceId}/review`,
        "POST",
        {
          expectedRevision: 1,
          action: "withdraw",
        },
      );
      expect(withdrawal.status).toBe(202);
      expect((await list(bob)).recordings).toEqual([]);
      expect(await route(bob)).toMatchObject({ paths: [], bounds: null });
      expect((await route(alice)).paths).toHaveLength(2);
      expect(
        (
          await bodyRequest(
            alice,
            `/imports/${id}/commit`,
            "POST",
            accepted,
          ).then((r) => r.json())
        ).scope,
      ).toBe("only_me");
      await owner.pool.query(
        `update kairn.journey_memberships set revoked_at = now() where journey_id = $1 and account_id = $2`,
        [journeyId, alice.id],
      );
      expect(
        await bodyRequest(
          alice,
          `/imports/${id}/commit`,
          "POST",
          accepted,
        ).then((r) => r.json()),
      ).toMatchObject({
        journeyId: null,
        recordingId: receipt.recordingId,
        scope: "only_me",
      });
      const owned = await request(
        alice,
        `/account/recordings/${receipt.recordingId}`,
      ).then((r) => r.json());
      expect(owned).not.toHaveProperty("journeyId");
      expect(owned.id).toBe(receipt.recordingId);
    }, 20_000);

    it("checks coauthor placement rights, then detaches and reattaches under the current grant revision", async () => {
      const bytes = await readFile(fixture);
      const id = await readyImport(alice, bytes);
      const placed = await bodyRequest(alice, `/imports/${id}/commit`, "POST", {
        ...commitCommand({ kind: "new", journey }),
        scope: "journey_review",
        placeInDraft: true,
      });
      expect(placed.status).toBe(200);
      const saved = recordingCommit.parse(await placed.json());
      const path = `/journeys/${saved.journeyId}/recordings`;
      const association = `${path}/${saved.associationId}`;
      await owner.pool.query(
        "insert into kairn.journey_memberships (journey_id, account_id) values ($1,$2)",
        [saved.journeyId, bob.id],
      );
      const grant = { expectedGrantRevision: 1 };
      expect(
        (await bodyRequest(bob, `${association}/placement`, "DELETE", grant))
          .status,
      ).toBe(404);
      await owner.pool.query(
        "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1,$2,'coauthor')",
        [saved.journeyId, bob.id],
      );
      expect(
        (
          await bodyRequest(bob, `${association}/placement`, "DELETE", {
            expectedGrantRevision: 2,
          })
        ).status,
      ).toBe(412);
      expect(
        (
          await bodyRequest(bob, `${association}/placement`, "DELETE", {
            expectedGrantRevision: 2_147_483_648,
          })
        ).status,
      ).toBe(400);
      expect(
        (await bodyRequest(bob, `${association}/placement`, "DELETE", grant))
          .status,
      ).toBe(200);
      expect(await (await request(bob, path)).json()).toMatchObject({
        recordings: [
          {
            id: saved.associationId,
            scope: "journey_review",
            placedInDraft: false,
            placementRevision: null,
          },
        ],
      });
      expect(
        (await bodyRequest(alice, association, "DELETE", grant)).status,
      ).toBe(202);
      expect(await (await request(bob, path)).json()).toMatchObject({
        recordings: [],
      });
      const next = await readyImport(alice, bytes);
      const eligibility = await (
        await request(
          alice,
          `/recording-attachment-destinations/${saved.journeyId}?importId=${next}`,
        )
      ).json();
      expect(eligibility.grantRevision).toBe(2);
      if (!saved.journeyId) throw new Error("Missing journey");
      const command = commitCommand({
        kind: "existing",
        journeyId: saved.journeyId,
        membershipGeneration: eligibility.membershipGeneration,
        grantRevision: 2,
      });
      const attached = await bodyRequest(
        alice,
        `/imports/${next}/commit`,
        "POST",
        command,
      );
      expect(attached.status).toBe(200);
      const receipt = recordingCommit.parse(await attached.json());
      expect(receipt).toMatchObject({
        recordingId: saved.recordingId,
        scope: "only_me",
      });
      expect(receipt.associationId).not.toBe(saved.associationId);
    }, 25_000);

    it("keeps existing journey pins until a coauthor accepts a current owner correction", async () => {
      const bytes = Buffer.concat([
        await readFile(fixture),
        Buffer.from("<!-- correction fixture -->"),
      ]);
      const firstImport = await readyImport(alice, bytes);
      const secondImport = await readyImport(alice, bytes);
      const edit = (
        id: string,
        revision: number,
        excluded: number[],
        shiftMinutes: number,
      ) =>
        bodyRequest(alice, `/imports/${id}/review`, "PATCH", {
          revision,
          selection: {
            excluded,
            splits: [],
            clock: { shiftMinutes, displayTimeZone: "UTC" },
          },
        });
      expect((await edit(firstImport, 1, [0], 0)).status).toBe(200);
      async function place(id: string, revision: number, title: string) {
        const response = await bodyRequest(
          alice,
          `/imports/${id}/commit`,
          "POST",
          {
            ...commitCommand(
              { kind: "new", journey: { ...journey, title } },
              revision,
            ),
            scope: "journey_review",
            placeInDraft: true,
          },
        );
        expect(response.status).toBe(200);
        return recordingCommit.parse(await response.json());
      }
      const first = await place(firstImport, 2, "Pinned section selection");
      const second = await place(secondImport, 1, "Independent placement");
      expect(first.recordingId).toBe(second.recordingId);
      for (const { journeyId } of [first, second])
        await owner.pool.query(
          "insert into kairn.journey_memberships (journey_id, account_id) values ($1,$2)",
          [journeyId, bob.id],
        );
      const firstPath = `/journeys/${first.journeyId}/recordings/${first.associationId}`;
      const secondPath = `/journeys/${second.journeyId}/recordings/${second.associationId}`;
      const revisionPath = `${firstPath}/placement/review`;
      expect((await request(bob, revisionPath)).status).toBe(404);
      for (const { journeyId } of [first, second])
        await owner.pool.query(
          "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1,$2,'coauthor')",
          [journeyId, bob.id],
        );
      expect(await (await request(bob, revisionPath)).json()).toEqual({
        review: null,
      });
      expect(
        await (await request(bob, `${secondPath}/placement/review`)).json(),
      ).toEqual({ review: null });
      const sections = async (path: string) =>
        (await (await request(bob, `${path}/segments`)).json()).sections;
      const otherBefore = await sections(secondPath);
      expect(otherBefore).toMatchObject([
        { ordinal: 0, measurements: { firstInstant: "2026-06-12T08:00:00Z" } },
        { ordinal: 1, measurements: { firstInstant: "2026-06-12T10:10:00Z" } },
      ]);
      expect((await edit(firstImport, 2, [], 60)).status).toBe(200);
      const stale = await (await request(bob, revisionPath)).json();
      expect(stale.review).toMatchObject({
        sectionCount: 1,
        clock: { shiftMinutes: 60 },
      });
      expect((await edit(firstImport, 3, [], 90)).status).toBe(200);
      expect(
        (
          await bodyRequest(bob, revisionPath, "PATCH", {
            token: stale.review.token,
          })
        ).status,
      ).toBe(412);
      expect(await sections(firstPath)).toMatchObject([
        { ordinal: 1, measurements: { firstInstant: "2026-06-12T10:10:00Z" } },
      ]);
      expect(await sections(secondPath)).toEqual(otherBefore);
      const current = await (await request(bob, revisionPath)).json();
      expect(
        (
          await bodyRequest(bob, revisionPath, "PATCH", {
            token: current.review.token,
          })
        ).status,
      ).toBe(200);
      expect(await sections(firstPath)).toMatchObject([
        { ordinal: 1, measurements: { firstInstant: "2026-06-12T11:40:00Z" } },
      ]);
      expect(await sections(secondPath)).toEqual(otherBefore);
      expect(
        await (
          await request(alice, `/account/recordings/${first.recordingId}`)
        ).json(),
      ).toMatchObject({ reviewImportId: firstImport });
    }, 25_000);

    it.runIf(process.env.KAIRN_PROFILE_GPX === "1")(
      "qualifies bounded response sizes for a maximum-point recording",
      async () => {
        const bytes = Buffer.from(
          [...largeTrack(gpxLimits.points, true)].join(""),
        );
        const { id, partSize } = await begin(alice, input(bytes));
        for (
          let offset = 0, part = 1;
          offset < bytes.length;
          offset += partSize, part++
        ) {
          expect(
            (
              await sendPart(
                alice,
                id,
                part,
                bytes.subarray(offset, offset + partSize),
              )
            ).status,
          ).toBe(200);
        }
        expect((await complete(alice, id)).status).toBe(200);
        await expect
          .poll(
            async () => {
              const response = await request(alice, `/imports/${id}`);
              return recordingImport.parse(await response.json()).stage;
            },
            { timeout: 30_000 },
          )
          .toBe("ready");
        const sizes: Record<string, number> = {};
        for (const path of ["review", "segments", "overlay?through=0"]) {
          const response = await request(alice, `/imports/${id}/${path}`);
          expect(response.status).toBe(200);
          sizes[path] = (await response.arrayBuffer()).byteLength;
          expect(sizes[path]).toBeLessThan(24_000);
        }
        console.info("Maximum GPX fixture response bytes", sizes);
      },
      60_000,
    );

    const container = process.env.KAIRN_TEST_POSTGRES_CONTAINER;
    it.runIf(Boolean(container))(
      "replays deletion over a restored checkpoint with an original and a second upload",
      async () => {
        if (!container)
          throw new Error("Missing isolated PostgreSQL container");
        const account = await member();
        const bytes = await readFile(fixture);
        const id = await readyImport(account, bytes);
        const originals = ownerRecordingPage.parse(
          await (await request(account, "/account/recordings")).json(),
        );
        expect(originals.recordings).toHaveLength(1);
        const { id: originalId } = originals.recordings[0];
        const pending = await begin(account, input(bytes));
        expect((await sendPart(account, pending.id, 1, bytes)).status).toBe(
          200,
        );
        const sharedBytes = Buffer.concat([
          bytes,
          Buffer.from("<!-- shared fixture -->"),
        ]);
        const shared = [];
        for (const title of [
          "First attached journey",
          "Second attached journey",
        ]) {
          const importId = await readyImport(account, sharedBytes);
          const response = await bodyRequest(
            account,
            `/imports/${importId}/commit`,
            "POST",
            {
              ...commitCommand({ kind: "new", journey: { ...journey, title } }),
              scope: "journey_review",
              placeInDraft: true,
            },
          );
          expect(response.status).toBe(200);
          const result = await response.json();
          expect(result).toMatchObject({
            outcome: "created",
            placedInDraft: true,
          });
          shared.push(result);
        }
        const sharedRoute = `/account/recordings/${shared[0].recordingId}`;
        const route = `/account/recordings/${originalId}`;
        const range = { headers: { Range: "bytes=0-11" } };
        const priorRange = await request(account, `${route}/original`, range);
        expect(priorRange.status).toBe(206);
        expect(Buffer.from(await priorRange.arrayBuffer())).toEqual(
          bytes.subarray(0, 12),
        );
        expect(
          (await request(account, route, { method: "DELETE" })).status,
        ).toBe(503);
        const stagedBatch = randomUUID();
        const stagedBytes = Buffer.concat([
          bytes,
          Buffer.from("<!-- checkpoint batch -->"),
        ]);
        const staged = await begin(account, {
          ...input(stagedBytes),
          batch: { id: stagedBatch, position: 0 },
        });
        expect(
          (await sendPart(account, staged.id, 1, stagedBytes)).status,
        ).toBe(200);
        expect((await complete(account, staged.id)).status).toBe(200);
        const stagedReview = `/recording-batches/${stagedBatch}/review`;
        await expect
          .poll(
            async () =>
              recordingBatchReview.parse(
                await (await request(account, stagedReview)).json(),
              ).complete,
            { timeout: 15_000 },
          )
          .toBe(true);
        const saveBatch = (owner: Account, target = app) =>
          request(
            owner,
            `/recording-batches/${stagedBatch}/commit`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ files: [{ id: staged.id, revision: 1 }] }),
            },
            target,
          );

        const database = `gpx_restore_${randomUUID().replaceAll("-", "")}`;
        const archive = `/tmp/${database}.dump`;
        const run = promisify(execFile);
        const postgres = (command: string, ...args: string[]) =>
          run("docker", [
            "exec",
            "-e",
            "PGPASSWORD=temporary-bootstrap-admin",
            container,
            command,
            "-h",
            "127.0.0.1",
            "-U",
            "kairn_admin",
            ...args,
          ]);
        const checkpointOwnerUrl = new URL(migrationUrl);
        checkpointOwnerUrl.pathname = `/${database}`;
        const checkpointRuntimeUrl = new URL(runtimeUrl);
        checkpointRuntimeUrl.pathname = `/${database}`;
        const checkpointOwner = openDatabase(checkpointOwnerUrl.toString());
        const checkpointRuntime = openDatabase(checkpointRuntimeUrl.toString());
        const checkpointBoss = openJobQueue(
          checkpointRuntimeUrl.toString(),
          true,
        );
        let stopCheckpointWorkers: (() => Promise<void>) | undefined;
        const records: Awaited<ReturnType<RestrictionJournal["read"]>>[] = [];
        let unavailable = true;
        const journal: RestrictionJournal = {
          async append(event) {
            if (unavailable)
              throw new Error("Synthetic independent journal timeout");
            const existing = records.find((item) => item.event.id === event.id);
            if (existing) return existing.receipt;
            const receipt = {
              eventId: event.id,
              sequence: records.length + 1,
              digest: restrictionDigest(event),
              receipt: `fixture/${event.id}`,
            };
            records.push({ event, receipt });
            return receipt;
          },
          async head() {
            return records.length;
          },
          async read(sequence) {
            const record = records[sequence - 1];
            if (!record)
              throw new Error("Synthetic journal record unavailable");
            return record;
          },
        };
        const activeConfig = {
          ...config,
          journal,
          recordingDeletionEnabled: true,
        };
        const active = application(activeConfig);
        try {
          await postgres("pg_dump", "-Fc", "-f", archive, "-d", "kairn");
          const pendingDeletion = await request(
            account,
            route,
            { method: "DELETE" },
            active,
          );
          expect(pendingDeletion.status).toBe(202);
          expect(await pendingDeletion.json()).toMatchObject({
            id: originalId,
            confirmation: "pending",
          });
          expect(
            (await request(account, `${route}/original`, range, active)).status,
          ).toBe(404);
          expect((await complete(account, pending.id)).status).toBe(404);
          expect((await sendPart(account, pending.id, 1, bytes)).status).toBe(
            404,
          );
          unavailable = false;
          const confirmed = await request(
            account,
            route,
            { method: "DELETE" },
            active,
          );
          expect(confirmed.status).toBe(200);
          const removedJourney = `/journeys/${shared[0].journeyId}`;
          expect(
            (
              await request(
                account,
                removedJourney,
                { method: "DELETE" },
                active,
              )
            ).status,
          ).toBe(200);
          expect((await request(account, removedJourney)).status).toBe(404);
          expect(
            (await request(account, `${sharedRoute}/original`, range)).status,
          ).toBe(206);
          expect(
            (
              await request(
                account,
                `/journeys/${shared[1].journeyId}/recordings`,
              )
            ).status,
          ).toBe(200);
          expect(
            (await request(account, sharedRoute, { method: "DELETE" }, active))
              .status,
          ).toBe(200);
          // Use a distinct staged batch recording, so the source-deletion
          // events above cannot account for this command being unavailable.
          const savedDuringGap = await saveBatch(account, active);
          expect(savedDuringGap.status).toBe(200);
          const savedAfterCheckpoint = await savedDuringGap.json();
          expect(
            (
              await request(
                account,
                `/journeys/${savedAfterCheckpoint.id}`,
                { method: "DELETE" },
                active,
              )
            ).status,
          ).toBe(200);
          expect(records.map(({ event }) => event)).toMatchObject([
            {
              accountId: account.id,
              assetId: originalId,
              operation: "source_deletion",
            },
            {
              accountId: account.id,
              journeyId: shared[0].journeyId,
              operation: "journey_deletion",
            },
            {
              accountId: account.id,
              assetId: shared[0].recordingId,
              operation: "source_deletion",
            },
            {
              accountId: account.id,
              journeyId: savedAfterCheckpoint.id,
              operation: "journey_deletion",
            },
          ]);

          await postgres("createdb", "--template=template0", database);
          await postgres(
            "pg_restore",
            "--exit-on-error",
            "--single-transaction",
            "-d",
            database,
            archive,
          );
          const epoch = "synthetic-restored-gpx-epoch-with-never-shared-data";
          const restored = application(
            { ...activeConfig, boss: checkpointBoss, epoch },
            checkpointRuntime.db,
          );
          expect(
            (await request(account, route, undefined, restored)).status,
          ).toBe(503);
          await replayIdentityRestrictions(
            checkpointOwner.db,
            journal,
            epoch,
            records[3].receipt,
          );
          expect(
            (await request(account, route, undefined, restored)).status,
          ).toBe(401);
          const signedIn = await signIn(account.id, account.email, restored);
          expect((await saveBatch(signedIn, restored)).status).toBe(404);
          expect(
            (await request(signedIn, removedJourney, undefined, restored))
              .status,
          ).toBe(404);
          for (const path of [
            route,
            `${route}/segments`,
            `/imports/${id}`,
            `/imports/${id}/segments`,
            `/imports/${id}/overlay?through=1`,
            `/uploads/${pending.id}`,
          ]) {
            expect(
              (await request(signedIn, path, undefined, restored)).status,
              path,
            ).toBe(404);
          }
          expect(
            (await request(signedIn, `${route}/original`, range, restored))
              .status,
          ).toBe(404);
          expect(
            (
              await request(
                signedIn,
                `/uploads/${pending.id}/complete`,
                { method: "POST" },
                restored,
              )
            ).status,
          ).toBe(404);
          expect(
            (
              await request(
                signedIn,
                "/uploads",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(input(bytes)),
                },
                restored,
              )
            ).status,
          ).toBe(409);
          expect(await store.head(`recordings/${id}/original`)).toMatchObject({
            size: bytes.length,
          });
          for (const { journeyId, associationId } of shared.slice(1)) {
            const path = `/journeys/${journeyId}/recordings`;
            const list = await request(signedIn, path, undefined, restored);
            expect(await list.json()).toMatchObject({ recordings: [] });
            expect(
              (
                await request(
                  signedIn,
                  `${path}/${associationId}/segments`,
                  undefined,
                  restored,
                )
              ).status,
            ).toBe(404);
            expect(
              (
                await request(
                  signedIn,
                  `${path}/${associationId}/overlay?through=1`,
                  undefined,
                  restored,
                )
              ).status,
            ).toBe(404);
          }

          await checkpointOwner.pool.query(
            "update kairn.recording_deletions set purge_after = now() where asset_id = $1",
            [originalId],
          );
          await checkpointBoss.start();
          const staleJob = await checkpointBoss.send(recordingInspectionQueue, {
            id: originalId,
            ownerId: account.id,
          });
          expect(staleJob).toBeTruthy();
          const stale = await checkpointRuntime.pool.connect();
          try {
            await stale.query("begin");
            await stale.query(
              "select set_config('kairn.recording_account', $1, true)",
              [account.id],
            );
            await stale.query(
              "update kairn.recording_originals set stage='queued', inspection_job_id=$2 where id=$1",
              [originalId, staleJob],
            );
            await stale.query("commit");
          } finally {
            await stale.query("rollback").finally(() => stale.release());
          }
          stopCheckpointWorkers = await registerRecordingWorkers(
            checkpointBoss,
            checkpointRuntime.db,
            store,
          );
          await expect
            .poll(
              async () => {
                const job = await checkpointBoss.getJobById(
                  recordingInspectionQueue,
                  String(staleJob),
                );
                return job?.state;
              },
              { timeout: 10_000 },
            )
            .toBe("completed");
          await expect
            .poll(
              async () => {
                const { rows } = await checkpointOwner.pool.query(
                  "select purged_at from kairn.recording_deletions where asset_id = $1",
                  [originalId],
                );
                return rows[0]?.purged_at;
              },
              { timeout: 10_000 },
            )
            .toBeInstanceOf(Date);
          expect(await store.head(`recordings/${id}/original`)).toBeNull();
          const client = await checkpointRuntime.pool.connect();
          try {
            await client.query("begin");
            await client.query(
              "select set_config('kairn.recording_account', $1, true)",
              [account.id],
            );
            const { rows } = await client.query(
              `select kairn.recording_retains_storage($1) as retained,
                exists (select 1 from kairn.recording_sample_pages where original_id=$1) as has_samples`,
              [originalId],
            );
            expect(rows).toEqual([{ retained: false, has_samples: false }]);
          } finally {
            await client.query("rollback").finally(() => client.release());
          }
        } finally {
          await stopCheckpointWorkers?.();
          await checkpointBoss.stop({ graceful: true, timeout: 5_000 });
          await Promise.all([
            checkpointOwner.pool.end(),
            checkpointRuntime.pool.end(),
          ]);
          await postgres("dropdb", "--if-exists", database);
          await run("docker", ["exec", container, "rm", "-f", archive]);
        }
      },
      45_000,
    );
  },
);
