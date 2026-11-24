import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { gpxLimits } from "@kairn/contracts/recording-limits";
import type { GpxDiagnostics, GpxIssue } from "@kairn/contracts/recordings";
import { and, eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import { logger } from "../../logger.js";
import type { openObjectStore } from "../../storage.js";
import {
  completedKey,
  partKey,
  readUpload,
  scopeRecordings,
} from "./access.js";
import { expireBatchFile } from "./batches.js";
import {
  recordingInspectionQueue,
  recordingReclaimQueue,
} from "./job-queue.js";
import {
  recordingOriginals,
  recordingSamplePages,
  recordingSections,
  recordingUploads,
} from "./schema.js";

type Store = ReturnType<typeof openObjectStore>;
const jobPayload = z.object({ ownerId: z.uuid(), id: z.uuid() });
const maxOutputBytes = 160 * 1024 ** 2;
const inspectionTimeoutMs = 60_000;

async function expireRecordingBatches(db: Database, boss: PgBoss) {
  const expired = await db.execute<{ ownerId: string; id: string }>(
    sql`select * from kairn.recording_batch_expired_files()`,
  );
  for (const { ownerId, id } of expired.rows) {
    try {
      await db.transaction(async (tx) => {
        await scopeRecordings(tx, ownerId);
        await expireBatchFile(tx, boss, id);
      });
    } catch {
      logger.warn("Recording batch expiry will retry");
    }
  }
}

async function reclaimUpload(
  db: Database,
  store: Store,
  { ownerId, id }: z.infer<typeof jobPayload>,
) {
  await db.transaction(async (tx) => {
    await scopeRecordings(tx, ownerId);
    const upload = await readUpload(tx, id, true);
    if (
      !upload ||
      upload.cleanedAt ||
      (upload.state === "uploading" && upload.expiresAt > new Date())
    )
      return;
    const [canonical] = await tx
      .select({ id: recordingOriginals.id })
      .from(recordingOriginals)
      .where(eq(recordingOriginals.uploadId, id));
    const partCount = Math.ceil(upload.byteLength / gpxLimits.partBytes);
    for (let part = 1; part <= partCount; part++)
      await store.remove(partKey(id, part));
    if (!canonical) await store.remove(completedKey(id));
    await tx
      .update(recordingUploads)
      .set({
        cleanedAt: new Date(),
        state: upload.state === "uploading" ? "expired" : upload.state,
      })
      .where(eq(recordingUploads.id, id));
  });
}

export async function reconcileRecordingStaging(
  db: Database,
  boss: PgBoss,
  store: Store,
) {
  await expireRecordingBatches(db, boss);
  const { rows } = await db.execute<{ ownerId: string; id: string }>(
    sql`select * from kairn.recording_reclaim_due()`,
  );
  for (const row of rows) {
    try {
      await reclaimUpload(db, store, row);
    } catch {
      logger.warn("Recording staging cleanup will retry");
    }
  }
}

async function runInspection(input: Readable, outputPath: string) {
  const source = import.meta.url.endsWith(".ts");
  const entry = fileURLToPath(
    new URL(
      source ? "./inspection-process.ts" : "./inspection-process.js",
      import.meta.url,
    ),
  );
  // Development needs tsx for source imports. The deployed child runs only the
  // compiled parser with an empty environment and no application credentials.
  const loader = source
    ? [
        "--conditions=development",
        "--import",
        createRequire(import.meta.url).resolve("tsx"),
      ]
    : [];
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=256", ...loader, entry],
    {
      env: {},
      stdio: ["pipe", "pipe", "ignore"],
      signal: AbortSignal.timeout(inspectionTimeoutMs),
      killSignal: "SIGKILL",
    },
  );
  let bytes = 0;
  const bound = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > maxOutputBytes)
        done(new Error("Recording inspection output budget exceeded"));
      else done(null, chunk);
    },
  });
  try {
    const [status] = await Promise.all([
      once(child, "close"),
      pipeline(input, child.stdin).catch((error: NodeJS.ErrnoException) => {
        // Typed early file rejection may close stdin before reaching EOF.
        if (
          error.code !== "EPIPE" &&
          error.code !== "ERR_STREAM_PREMATURE_CLOSE"
        )
          throw error;
      }),
      pipeline(
        child.stdout,
        bound,
        createWriteStream(outputPath, { mode: 0o600 }),
      ),
    ]);
    if (status[0] !== 0) throw new Error("Recording inspection process failed");
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    input.destroy();
  }
}

type InspectionRow =
  | {
      status: "ready";
      sectionCount: number;
      diagnostics: GpxDiagnostics;
      documentName?: string | null;
    }
  | { status: "rejected"; issue: GpxIssue; diagnostics?: GpxDiagnostics }
  | (Omit<
      typeof recordingSections.$inferInsert,
      "ownerId" | "originalId" | "ordinal"
    > & { section: number })
  | Omit<typeof recordingSamplePages.$inferInsert, "ownerId" | "originalId">;

async function persistInspection(
  tx: DatabaseTransaction,
  { ownerId, id }: z.infer<typeof jobPayload>,
  outputPath: string,
  jobId: string,
) {
  await scopeRecordings(tx, ownerId);
  const [current] = await tx
    .select({ stage: recordingOriginals.stage })
    .from(recordingOriginals)
    .where(
      and(
        eq(recordingOriginals.id, id),
        eq(recordingOriginals.inspectionJobId, jobId),
        sql`kairn.recording_source_active(${recordingOriginals.sourceId}, ${recordingOriginals.id})`,
      ),
    )
    .for("update");
  if (current?.stage !== "queued") return;
  const stream = createReadStream(outputPath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const sections: (typeof recordingSections.$inferInsert)[] = [];
  const pages: (typeof recordingSamplePages.$inferInsert)[] = [];
  let result: Extract<InspectionRow, { status: string }> | undefined;
  try {
    for await (const line of lines) {
      if (result)
        throw new Error("Unexpected recording data after inspection result");
      const row = JSON.parse(line) as InspectionRow;
      if ("status" in row) result = row;
      else if ("summary" in row) {
        sections.push({
          ownerId,
          originalId: id,
          ordinal: row.section,
          summary: row.summary,
        });
        if (sections.length >= 100)
          await tx.insert(recordingSections).values(sections.splice(0));
      } else {
        pages.push({ ...row, ownerId, originalId: id });
        if (pages.length >= 32)
          await tx.insert(recordingSamplePages).values(pages.splice(0));
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  if (!result) throw new Error("Missing recording inspection result");
  if (sections.length) await tx.insert(recordingSections).values(sections);
  if (pages.length) await tx.insert(recordingSamplePages).values(pages);
  await tx
    .update(recordingOriginals)
    .set({
      stage: result.status,
      diagnostics: result.diagnostics ?? null,
      ...(result.status === "ready"
        ? {
            sectionCount: result.sectionCount,
            issue: null,
            documentName: result.documentName ?? null,
          }
        : { issue: result.issue }),
    })
    .where(eq(recordingOriginals.id, id));
}

export async function registerRecordingWorkers(
  boss: PgBoss,
  db: Database,
  store: Store,
) {
  await boss.work(
    recordingInspectionQueue,
    { localConcurrency: 1, includeMetadata: true },
    async ([job]) => {
      const { ownerId, id } = jobPayload.parse(job.data);
      try {
        const [original] = await db.transaction(async (tx) => {
          await scopeRecordings(tx, ownerId);
          return tx
            .select({ uploadId: recordingOriginals.uploadId })
            .from(recordingOriginals)
            .where(
              and(
                eq(recordingOriginals.id, id),
                eq(recordingOriginals.inspectionJobId, job.id),
                eq(recordingOriginals.stage, "queued"),
                sql`kairn.recording_source_active(${recordingOriginals.sourceId}, ${recordingOriginals.id})`,
              ),
            );
        });
        if (!original) return;
        const scratch = await mkdtemp(join(tmpdir(), "kairn-gpx-"));
        const output = join(scratch, "inspection.ndjson");
        try {
          const { body } = await store.get(completedKey(original.uploadId));
          await runInspection(body, output);
          await db.transaction((tx) =>
            persistInspection(tx, { ownerId, id }, output, job.id),
          );
        } finally {
          await rm(scratch, { recursive: true, force: true });
        }
      } catch {
        logger.warn("Recording inspection attempt failed");
        if (job.retryCount < job.retryLimit)
          throw new Error("Recording inspection failed");
        await db.transaction(async (tx) => {
          await scopeRecordings(tx, ownerId);
          await tx
            .update(recordingOriginals)
            .set({ stage: "failed" })
            .where(
              and(
                eq(recordingOriginals.id, id),
                eq(recordingOriginals.inspectionJobId, job.id),
                eq(recordingOriginals.stage, "queued"),
              ),
            );
        });
      }
    },
  );

  await boss.work(
    recordingReclaimQueue,
    { localConcurrency: 1, batchSize: 8 },
    async (jobs) => {
      let failed = false;
      for (const job of jobs) {
        try {
          await reclaimUpload(db, store, jobPayload.parse(job.data));
        } catch {
          failed = true;
        }
      }
      if (failed) throw new Error("Recording staging cleanup failed");
    },
  );

  // Reconcile after exhausted cleanup jobs, for example when object storage
  // returns after a prolonged outage.
  let sweep: Promise<void> | undefined;
  function reconcile() {
    sweep ??= (async () => {
      await reconcileRecordingStaging(db, boss, store);
      const purge = await db.execute<{
        ownerId: string;
        originalId: string;
        uploadId: string;
      }>(sql`select * from kairn.recording_purge_due()`);
      for (const item of purge.rows) {
        try {
          await store.remove(completedKey(item.uploadId));
          await db.transaction(async (tx) => {
            await scopeRecordings(tx, item.ownerId);
            await tx
              .delete(recordingSamplePages)
              .where(eq(recordingSamplePages.originalId, item.originalId));
            await tx
              .delete(recordingSections)
              .where(eq(recordingSections.originalId, item.originalId));
            await tx.execute(
              sql`select kairn.recording_purge_result(${item.originalId}::uuid, true)`,
            );
          });
        } catch {
          logger.warn("Recording original purge will retry");
          await db
            .execute(
              sql`select kairn.recording_purge_result(${item.originalId}::uuid, false)`,
            )
            .catch(() =>
              logger.warn("Recording purge retry could not be scheduled"),
            );
        }
      }
    })()
      .catch(() => logger.warn("Recording staging reconciliation failed"))
      .finally(() => {
        sweep = undefined;
      });
  }
  const timer = setInterval(reconcile, 60_000);
  timer.unref();
  reconcile();
  return async () => {
    clearInterval(timer);
    await sweep;
  };
}
