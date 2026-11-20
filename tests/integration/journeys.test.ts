import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "../../apps/server/src/app";
import { createJourneyOperations } from "../../apps/server/src/journey-operations";
import {
  checkJourneyReadiness,
  createAuth,
  createOnboardingService,
  createProfileService,
  openDatabase,
  openJobQueue,
} from "../../packages/backend/src/index";
import {
  initializeLocalIdentity,
  localRecoveryEpoch,
} from "../../packages/backend/src/modules/identity/state";
import {
  type CreateJourney,
  journeyHistory,
  type PrivateJourney,
  privateJourney,
} from "../../packages/contracts/src/journeys";

const runtimeUrl =
  process.env.KAIRN_TEST_DATABASE_URL ??
  "postgresql://kairn_runtime:local-runtime-only@127.0.0.1:55432/kairn";
const migrationUrl =
  process.env.KAIRN_TEST_MIGRATION_DATABASE_URL ??
  "postgresql://kairn_migrator:local-migrator-only@127.0.0.1:55432/kairn";
const origin = "http://kairn.test";
const path = "/api/v1/journeys";
const initialTime = "2026-06-12T03:30:00.000Z";
const sample = {
  title: "Coorg",
  intendedStart: "2026-06-13T09:00",
  timeZone: "Asia/Kolkata",
};
const capabilities = ["administrator", "coauthor", "publisher"];
const isolated = process.env.KAIRN_JOURNEY_TEST === "isolated";

interface TestMember {
  id: string;
  cookie: string;
}

describe.runIf(process.env.KAIRN_INTEGRATION === "1")(
  "private journey operations",
  () => {
    const runtime = openDatabase(runtimeUrl);
    const owner = openDatabase(migrationUrl);
    const boss = openJobQueue(runtimeUrl);
    let currentTime = initialTime;
    const config = {
      baseURL: origin,
      secret: randomBytes(32).toString("hex"),
      epoch: localRecoveryEpoch,
      mailKey: randomBytes(32).toString("hex"),
      now: () => new Date(currentTime),
      boss,
    };
    const auth = createAuth(runtime.db, config);
    const operations = createJourneyOperations(auth, config);
    const dependencies = {
      authHandler: auth.handler,
      checkReadiness: () => checkJourneyReadiness(runtime.db),
    };
    const app = createApp({
      ...dependencies,
      journeys: operations,
      workspace: {
        ...operations,
        onboarding: createOnboardingService(auth),
        profile: createProfileService(auth),
      },
    });
    let accountA: TestMember;
    let accountB: TestMember;
    let requestNumber = 0;

    async function member(verify = true) {
      const email = `journey-${randomUUID()}@example.test`;
      const password = "Synthetic-journey-password";
      // The identity suite exercises delivery with its own encryption key.
      const send = vi
        .spyOn(boss, "send")
        .mockImplementationOnce(
          async (_queue, _data, options) => options?.id ?? null,
        );
      const response = await app
        .request(`${origin}/api/auth/sign-up/email`, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            "X-Forwarded-For": `198.51.100.${++requestNumber}`,
          },
          body: JSON.stringify({
            email,
            password,
            name: "Journey test account",
          }),
        })
        .finally(() => send.mockRestore());
      expect(response.status).toBe(200);
      const { user } = await response.json();
      if (verify) {
        await owner.pool.query(
          'update kairn_auth."user" set email_verified = true where id = $1',
          [user.id],
        );
      }
      const signedIn = await app.request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-Forwarded-For": `198.51.100.${++requestNumber}`,
        },
        body: JSON.stringify({ email, password }),
      });
      expect(signedIn.status).toBe(verify ? 200 : 403);
      const cookie = signedIn.headers
        .getSetCookie()
        .find((value) => value.includes("session_token="))
        ?.split(";")[0];
      if (verify) expect(cookie).toBeTruthy();
      return { id: String(user.id), cookie: cookie ?? "" };
    }

    function history(account: TestMember, query = "") {
      return app.request(`${path}${query}`, {
        headers: { Cookie: account.cookie },
      });
    }

    function detail(account: TestMember, id: string) {
      return app.request(`${path}/${id}`, {
        headers: { Cookie: account.cookie },
      });
    }

    function dashboard(account: TestMember) {
      return app.request("/api/v1/dashboard", {
        headers: { Cookie: account.cookie, "X-Expected-Account": account.id },
      });
    }

    function create(
      account: TestMember,
      key: string,
      input: CreateJourney = sample,
      headers: Record<string, string> = {},
    ) {
      return app.request(path, {
        method: "POST",
        headers: {
          Cookie: account.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          ...headers,
        },
        body: JSON.stringify(input),
      });
    }

    async function creationCounts(accountId: string) {
      const { rows } = await owner.pool.query(
        `
      select
        (select count(*)::int from kairn.journeys where created_by = $1) as journeys,
        (select count(*)::int from kairn.journey_creation_receipts where account_id = $1) as receipts,
        (select count(*)::int from kairn.journey_memberships where account_id = $1) as memberships,
        (select count(*)::int from kairn.journey_capabilities where account_id = $1) as capabilities,
        (select count(*)::int from kairn.audit_events where actor_id = $1 and action = 'journey_created') as audits
    `,
        [accountId],
      );
      return rows[0];
    }

    beforeAll(async () => {
      await initializeLocalIdentity(runtime.db, localRecoveryEpoch);
      await boss.start();
      accountA = await member();
      accountB = await member();
    }, 20_000);

    afterAll(async () => {
      await boss.stop();
      await Promise.all([runtime.pool.end(), owner.pool.end()]);
    });

    it("creates one canonical record under concurrent retries and rechecks membership on replay", async () => {
      const key = randomUUID();
      const responses = await Promise.all([
        create(accountA, key, sample, { Origin: origin }),
        create(accountA, key),
      ]);
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
      const bodies = await Promise.all(
        responses.map((response) => response.json()),
      );
      const [{ id }] = bodies;
      expect(bodies).toEqual([{ id }, { id }]);
      expect(
        responses.find(({ status }) => status === 201)?.headers.get("Location"),
      ).toBe(`${path}/${id}`);
      const oneCreation = {
        journeys: 1,
        receipts: 1,
        memberships: 1,
        capabilities: 3,
        audits: 1,
      };
      expect(await creationCounts(accountA.id)).toEqual(oneCreation);
      const audit = await owner.pool.query(
        "select actor_id, target_id, journey_id, target_kind, occurred_at from kairn.audit_events where action = 'journey_created' and journey_id = $1",
        [id],
      );
      expect(audit.rows).toEqual([
        {
          actor_id: accountA.id,
          target_id: id,
          journey_id: id,
          target_kind: "journey",
          occurred_at: expect.any(Date),
        },
      ]);

      // Discard the first confirmation and retry the same submitted form.
      const replay = await create(accountA, key);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual({ id });
      expect(await creationCounts(accountA.id)).toEqual(oneCreation);
      const conflict = await create(accountA, key, {
        ...sample,
        title: "Changed title",
      });
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        code: "idempotency_conflict",
      });
      const newAttempt = await create(accountA, randomUUID());
      expect(newAttempt.status).toBe(201);
      expect((await newAttempt.json()).id).not.toBe(id);

      const ownDetail = privateJourney.parse(
        await (await detail(accountA, id)).json(),
      );
      expect(ownDetail).toMatchObject({
        id,
        title: "Coorg",
        state: "draft",
        capabilities,
        schedule: {
          timeZone: "Asia/Kolkata",
          intendedStart: {
            local: "2026-06-13T09:00",
            instant: "2026-06-13T03:30:00.000Z",
            offset: "+05:30",
          },
          intendedEnd: null,
        },
      });
      const list = await (await history(accountA)).json();
      expect(
        list.upcoming.items.filter(
          (journey: { id: string }) => journey.id === id,
        ),
      ).toEqual([ownDetail]);
      const inaccessible = await detail(accountB, id);
      expect(inaccessible.status).toBe(404);
      expect(await inaccessible.json()).toMatchObject({ code: "not_found" });
      expect((await detail(accountB, randomUUID())).status).toBe(404);

      await owner.pool.query(
        "insert into kairn.journey_memberships (journey_id, account_id) values ($1, $2)",
        [id, accountB.id],
      );
      expect(await (await detail(accountB, id)).json()).toEqual({
        ...ownDetail,
        capabilities: [],
      });
      const joined = await (await history(accountB)).json();
      expect(
        joined.upcoming.items.map((journey: { id: string }) => journey.id),
      ).toEqual([id]);
      await owner.pool.query(
        "update kairn.journey_memberships set revoked_at = now() where journey_id = $1",
        [id],
      );
      expect((await detail(accountB, id)).status).toBe(404);
      expect((await create(accountA, key)).status).toBe(404);
    });

    it("keeps overlapping journeys accessible as they start and end", async () => {
      const account = await member();
      const coonoor = await create(account, randomUUID(), {
        ...sample,
        title: "Coonoor",
        intendedStart: "2026-06-11T07:30",
        intendedEnd: "2026-06-13T12:00",
      });
      expect(coonoor.status).toBe(201);
      const { id: coonoorId } = await coonoor.json();
      const coorg = await create(account, randomUUID());
      expect(coorg.status).toBe(201);
      const { id: coorgId } = await coorg.json();
      expect(coorgId).not.toBe(coonoorId);

      const first = privateJourney.parse(
        await (await detail(account, coonoorId)).json(),
      );
      expect(first).toMatchObject({
        id: coonoorId,
        title: "Coonoor",
        state: "draft",
        capabilities,
        schedule: {
          timeZone: "Asia/Kolkata",
          intendedEnd: {
            local: "2026-06-13T12:00",
            instant: "2026-06-13T06:30:00.000Z",
          },
        },
      });
      const second = privateJourney.parse(
        await (await detail(account, coorgId)).json(),
      );
      expect(second).toMatchObject({
        id: coorgId,
        title: "Coorg",
        state: "draft",
        capabilities,
        schedule: { intendedEnd: null },
      });

      async function expectHistory(
        asOf: string,
        upcoming: PrivateJourney[],
        recent: PrivateJourney[],
      ) {
        currentTime = asOf;
        const response = await history(account);
        expect(response.status).toBe(200);
        expect(journeyHistory.parse(await response.json())).toEqual({
          asOf,
          upcoming: { items: upcoming, nextCursor: null },
          recent: { items: recent, nextCursor: null },
        });
      }

      try {
        await expectHistory(initialTime, [second], [first]);
        await expectHistory("2026-06-13T03:29:59.999Z", [second], [first]);
        await expectHistory("2026-06-13T03:30:00.000Z", [], [second, first]);
        await expectHistory("2026-06-13T06:30:00.001Z", [], [second, first]);
        const ended = await detail(account, coonoorId);
        expect(ended.status).toBe(200);
        expect(privateJourney.parse(await ended.json())).toEqual(first);
      } finally {
        currentTime = initialTime;
      }
    });

    it("pages both sections with one clock, stable ties and account-bound cursors", async () => {
      const account = await member();
      const upcomingIds = Array.from({ length: 26 }, () => randomUUID()).sort();
      const undatedIds = Array.from({ length: 26 }, () => randomUUID());
      const present = await create(account, randomUUID(), {
        ...sample,
        title: "Coonoor",
        intendedStart: "2026-06-12T09:00",
        intendedEnd: "2026-06-12T09:00",
      });
      expect(present.status).toBe(201);
      const { id: startedId } = await present.json();
      await owner.pool.query(
        `
      insert into kairn.journeys
        (id, title, created_by, time_zone, intended_start_local, intended_start_at, start_offset)
      select id, 'Upcoming fixture', $1, 'UTC', '2026-06-13T00:00', '2026-06-13T00:00:00Z', '+00:00'
      from unnest($2::uuid[]) as id
    `,
        [account.id, upcomingIds],
      );
      await owner.pool.query(
        `
      insert into kairn.journeys (id, title, created_by, created_at, archived_at)
      select id, 'Undated fixture', $1, timestamp with time zone '2026-01-01T00:00:00Z' + n * interval '1 microsecond', now()
      from unnest($2::uuid[]) with ordinality as legacy(id, n)
    `,
        [account.id, undatedIds],
      );
      await owner.pool.query(
        `
      insert into kairn.journey_memberships (journey_id, account_id)
      select id, $1 from unnest($2::uuid[]) as id
    `,
        [account.id, [...upcomingIds, ...undatedIds]],
      );

      const result = journeyHistory.parse(
        await (await history(account)).json(),
      );
      if (!("upcoming" in result)) throw new Error("Expected initial history.");
      expect(result.asOf).toBe(initialTime);
      expect(result.upcoming.items.map(({ id }) => id)).toEqual(
        upcomingIds.slice(0, 25),
      );
      expect(result.recent.items[0]).toMatchObject({
        id: startedId,
        state: "draft",
        capabilities,
        schedule: {
          intendedStart: { instant: initialTime },
          intendedEnd: { instant: initialTime },
        },
      });
      expect(result.recent.items[1]).toMatchObject({
        id: undatedIds.at(-1),
        state: "archived",
        schedule: null,
      });
      expect(result.recent.items.map(({ id }) => id)).toEqual([
        startedId,
        ...undatedIds.toReversed().slice(0, 24),
      ]);
      const upcomingCursor = result.upcoming.nextCursor;
      const recentCursor = result.recent.nextCursor;
      const upcomingQuery = `?section=upcoming&cursor=${upcomingCursor}`;
      expect(result.upcoming.nextCursor).toBeTruthy();
      expect(result.recent.nextCursor).toBeTruthy();

      await owner.pool.query(
        "update kairn.journeys set archived_at = now() where id = $1",
        [upcomingIds[0]],
      );
      const overview = await dashboard(account);
      expect(overview.status).toBe(200);
      expect(overview.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await overview.json()).toMatchObject({
        asOf: initialTime,
        journeyCount: 53,
        upcomingCount: 25,
        nextJourney: { id: upcomingIds[1] },
        recentJourneys: [
          { id: startedId },
          { id: undatedIds.at(-1) },
          { id: undatedIds.at(-2) },
        ],
      });
      expect(await (await dashboard(accountB)).json()).toMatchObject({
        journeyCount: 0,
        nextJourney: null,
        recentJourneys: [],
      });

      await owner.pool.query(
        "update kairn.journey_memberships set revoked_at = now() where journey_id = $1",
        [undatedIds[1]],
      );
      expect(await (await dashboard(account)).json()).toMatchObject({
        journeyCount: 52,
        upcomingCount: 25,
      });
      currentTime = "2026-06-14T00:00:00.000Z";
      try {
        expect(
          await (await history(account, upcomingQuery)).json(),
        ).toMatchObject({
          asOf: initialTime,
          section: "upcoming",
          page: { items: [{ id: upcomingIds[25] }], nextCursor: null },
        });
        expect(
          await (
            await history(account, `?section=recent&cursor=${recentCursor}`)
          ).json(),
        ).toMatchObject({
          asOf: initialTime,
          section: "recent",
          page: { items: [{ id: undatedIds[0] }], nextCursor: null },
        });
        for (const response of [
          await history(accountB, upcomingQuery),
          await history(account, `?section=recent&cursor=${upcomingCursor}`),
          await history(account, `${upcomingQuery}x`),
        ]) {
          expect(response.status).toBe(400);
          expect(await response.json()).toMatchObject({
            issues: [{ field: "cursor", code: "invalid_cursor" }],
          });
        }
        expect(await (await history(account)).json()).toMatchObject({
          asOf: currentTime,
          upcoming: { items: [], nextCursor: null },
        });
        expect(await (await detail(account, startedId)).json()).toMatchObject({
          id: startedId,
          state: "draft",
          capabilities,
        });
      } finally {
        currentTime = initialTime;
      }
    });

    it("advances an account checkpoint once and rejects jumps and incompatible accounts", async () => {
      const account = await member();
      await owner.pool.query(
        "update kairn.accounts set onboarding_step = 1 where id = $1",
        [account.id],
      );
      const checkpoint = (
        step: number,
        expectedAccount = account.id,
        writeOrigin = origin,
        intent?: string,
      ) =>
        app.request("/api/v1/onboarding", {
          method: "POST",
          headers: {
            Cookie: account.cookie,
            Origin: writeOrigin,
            "X-Expected-Account": expectedAccount,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ step, intent }),
        });
      expect((await checkpoint(1, accountB.id)).status).toBe(409);
      expect(
        (await checkpoint(1, account.id, "http://other.test")).status,
      ).toBe(403);
      expect(await (await checkpoint(3)).json()).toMatchObject({
        code: "checkpoint_changed",
      });
      expect((await checkpoint(1, account.id, origin, "plan")).status).toBe(
        400,
      );
      const responses = await Promise.all([checkpoint(1), checkpoint(1)]);
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ state: "pending", step: 2 });
      }
      expect(await (await checkpoint(3)).json()).toMatchObject({
        code: "checkpoint_changed",
      });
      expect(
        (await checkpoint(2, account.id, origin, "unexpected")).status,
      ).toBe(400);
      const completed = { state: "completed", intent: "plan" };
      for (const response of await Promise.all([
        checkpoint(2, account.id, origin, "plan"),
        checkpoint(2, account.id, origin, "plan"),
      ]))
        expect(await response.json()).toEqual(completed);
      expect(
        await (await checkpoint(2, account.id, origin, "record")).json(),
      ).toEqual(completed);
      expect(await (await checkpoint(1)).json()).toEqual(completed);

      const priorVersion = await member();
      await owner.pool.query(
        "update kairn.accounts set onboarding_step = 3 where id = $1",
        [priorVersion.id],
      );
      const request = (method: "GET" | "POST", body?: object) =>
        app.request("/api/v1/onboarding", {
          method,
          headers: {
            Cookie: priorVersion.cookie,
            Origin: origin,
            "X-Expected-Account": priorVersion.id,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      expect(await (await request("GET")).json()).toEqual({
        state: "pending",
        step: 2,
      });
      expect(
        await (await request("POST", { step: 2, intent: "record" })).json(),
      ).toEqual({ state: "completed", intent: "record" });
    });

    it("reads and updates the verified account’s display name only", async () => {
      const path = "/api/v1/profile";
      const headers = {
        Cookie: accountA.cookie,
        "X-Expected-Account": accountA.id,
      };
      const update = (body: object, overrides: Record<string, string> = {}) =>
        app.request(path, {
          method: "PATCH",
          headers: {
            ...headers,
            Origin: origin,
            "Content-Type": "application/json",
            ...overrides,
          },
          body: JSON.stringify(body),
        });
      expect((await app.request(path)).status).toBe(401);
      expect(await (await app.request(path, { headers })).json()).toEqual({
        displayName: "Journey test account",
      });
      expect(
        (
          await update(
            { displayName: "Someone else" },
            { "X-Expected-Account": accountB.id },
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await update(
            { displayName: "Invalid origin" },
            { Origin: "http://other.test" },
          )
        ).status,
      ).toBe(403);
      expect((await update({ displayName: "   " })).status).toBe(400);
      expect(
        (await update({ displayName: "New name", email: "other@example.test" }))
          .status,
      ).toBe(400);
      const changed = await update({ displayName: "  ಅನು Rao  " });
      expect(changed.status).toBe(200);
      expect(changed.headers.get("cache-control")).toBe("private, no-store");
      expect(await changed.json()).toEqual({ displayName: "ಅನು Rao" });
      expect(await (await app.request(path, { headers })).json()).toEqual({
        displayName: "ಅನು Rao",
      });
      expect(
        await (
          await app.request(path, {
            headers: {
              Cookie: accountB.cookie,
              "X-Expected-Account": accountB.id,
            },
          })
        ).json(),
      ).toEqual({ displayName: "Journey test account" });
    });

    it("rejects incompatible actors and rechecks the current session inside the operation", async () => {
      expect((await app.request(path)).status).toBe(401);
      const unverified = await member(false);
      expect((await history(unverified)).status).toBe(401);
      const expectedAccount = await create(accountB, randomUUID(), sample, {
        "X-Expected-Account": accountA.id,
      });
      expect(expectedAccount.status).toBe(409);
      expect(await expectedAccount.json()).toMatchObject({
        code: "account_changed",
      });
      expect(
        (
          await create(accountB, randomUUID(), sample, {
            Origin: "http://other.test",
          })
        ).status,
      ).toBe(403);
      expect(await creationCounts(accountB.id)).toMatchObject({
        journeys: 0,
        receipts: 0,
        audits: 0,
      });

      const expired = await member();
      await owner.pool.query(
        "update kairn_auth.session set expires_at = now() - interval '1 minute' where user_id = $1",
        [expired.id],
      );
      expect((await history(expired)).status).toBe(401);
      const restricted = await member();
      await owner.pool.query(
        "update kairn.accounts set restricted_at = now(), credential_recovery = 'required' where id = $1",
        [restricted.id],
      );
      expect((await history(restricted)).status).toBe(401);

      const revoked = await member();
      const revokingApp = createApp({
        ...dependencies,
        journeys: {
          ...operations,
          async verifySession(headers) {
            const verified = await operations.verifySession(headers);
            expect(verified.status).toBe(200);
            await owner.pool.query(
              "delete from kairn_auth.session where user_id = $1",
              [revoked.id],
            );
            return verified;
          },
        },
      });
      expect(
        (
          await revokingApp.request(path, {
            headers: { Cookie: revoked.cookie },
          })
        ).status,
      ).toBe(401);
      const recoveryAuth = createAuth(runtime.db, {
        ...config,
        epoch: "unconfirmed-test-recovery-epoch",
      });
      const recoveryApp = createApp({
        ...dependencies,
        journeys: createJourneyOperations(recoveryAuth, {
          ...config,
          epoch: "unconfirmed-test-recovery-epoch",
        }),
      });
      expect(
        (
          await recoveryApp.request(path, {
            headers: { Cookie: accountA.cookie },
          })
        ).status,
      ).toBe(503);
    }, 30_000);

    it("uses scoped runtime reads and keeps direct grants and unscoped creation closed", async () => {
      const response = await create(accountB, randomUUID());
      expect(response.status).toBe(201);
      const { id } = await response.json();
      const client = await runtime.pool.connect();
      try {
        await client.query("begin");
        await client.query(
          "select set_config('kairn.journey_account', $1, true)",
          [accountB.id],
        );
        expect(
          (await client.query("select id from kairn.journeys")).rows,
        ).toEqual([{ id }]);
        expect(
          (
            await client.query(
              "select journey_id from kairn.journey_creation_receipts",
            )
          ).rows,
        ).toEqual([{ journey_id: id }]);
        await client.query("commit");
        for (const table of [
          "journeys",
          "journey_memberships",
          "journey_capabilities",
          "journey_creation_receipts",
        ]) {
          expect(
            (await client.query(`select * from kairn.${table}`)).rows,
          ).toEqual([]);
        }
        await expect(
          client.query(
            "insert into kairn.journey_memberships (journey_id, account_id) values ($1, $2)",
            [id, accountA.id],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          client.query(
            "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1, $2, 'publisher')",
            [id, accountA.id],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          client.query(
            `
        select kairn.create_private_journey($1::uuid, $2, 'Unscoped', 'UTC',
          '2026-06-14T09:00', '2026-06-14T09:00:00Z', '+00:00', null, null, null)
      `,
            [id, "0".repeat(64)],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.query("rollback");
        client.release();
      }
      expect((await detail(accountA, id)).status).toBe(404);
      const newJourney = await create(accountA, id);
      expect(newJourney.status).toBe(201);
      expect((await newJourney.json()).id).not.toBe(id);
      expect((await detail(accountA, id)).status).toBe(404);
    });

    it.runIf(isolated)(
      "preserves the pre-migration journey, membership and capability",
      async () => {
        const seed = "bc855bfe-2496-44cc-ab12-1a515f4d86f1";
        await expect(
          checkJourneyReadiness(runtime.db),
        ).resolves.toBeUndefined();
        const client = await runtime.pool.connect();
        try {
          await client.query("begin");
          await client.query(
            "select set_config('kairn.journey_account', $1, true)",
            [seed],
          );
          const { rows } = await client.query(`
        select j.id, j.title, j.archived_at is not null as archived, j.intended_start_at,
          j.time_zone, c.capability
        from kairn.journeys j join kairn.journey_capabilities c on c.journey_id = j.id
      `);
          expect(rows).toEqual([
            {
              id: "0eab9ba7-9c9c-48bd-a1d4-cc848725bfaa",
              title: "Synthetic foothills walk",
              archived: true,
              intended_start_at: null,
              time_zone: null,
              capability: "administrator",
            },
          ]);
        } finally {
          await client.query("rollback");
          client.release();
        }
      },
    );

    it.runIf(isolated)(
      "rolls back every write when audit fails and accepts the same key on retry",
      async () => {
        const account = await member();
        const key = randomUUID();
        await owner.pool.query(`
      alter table kairn.audit_events add constraint journey_test_audit_failure
      check (action <> 'journey_created' or actor_id <> '${account.id}'::uuid) not valid
    `);
        try {
          const failure = await create(account, key);
          expect(failure.status).toBe(503);
          expect(await creationCounts(account.id)).toEqual({
            journeys: 0,
            receipts: 0,
            memberships: 0,
            capabilities: 0,
            audits: 0,
          });
        } finally {
          await owner.pool.query(
            "alter table kairn.audit_events drop constraint journey_test_audit_failure",
          );
        }
        expect((await create(account, key)).status).toBe(201);
        expect(await creationCounts(account.id)).toEqual({
          journeys: 1,
          receipts: 1,
          memberships: 1,
          capabilities: 3,
          audits: 1,
        });
      },
    );
  },
);
