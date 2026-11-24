import { gpxBatchLimits } from "@kairn/contracts/recording-limits";
import { and, eq, ne, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { DatabaseTransaction } from "../../db/index.js";
import { lockRecordingAccount, readUpload } from "./access.js";
import { queueRecordingJob, recordingReclaimQueue } from "./job-queue.js";
import {
  recordingBatches,
  recordingImports,
  recordingOriginals,
  recordingReviews,
  recordingSamplePages,
  recordingSections,
  recordingUploads,
} from "./schema.js";

type Upload = typeof recordingUploads.$inferSelect;

export async function readRecordingBatch(tx: DatabaseTransaction, id: string) {
  const [batch] = await tx
    .select()
    .from(recordingBatches)
    .where(eq(recordingBatches.id, id));
  return batch;
}

export async function reserveBatchFile(
  tx: DatabaseTransaction,
  ownerId: string,
  id: string,
  position: number,
  bytes: number,
  initialExpiry: Date,
) {
  await tx
    .insert(recordingBatches)
    .values({ id, ownerId, expiresAt: initialExpiry })
    .onConflictDoNothing();
  const batch = await readRecordingBatch(tx, id);
  if (!batch || batch.savedAt || batch.expiresAt <= new Date())
    return { status: 409 } as const;
  const [usage] = await tx
    .select({
      files: sql<number>`count(*)`.mapWith(Number),
      bytes:
        sql<number>`coalesce(sum(${recordingUploads.byteLength}), 0)`.mapWith(
          Number,
        ),
      positionTaken: sql<boolean>`coalesce(bool_or(${recordingUploads.batchPosition} = ${position}), false)`,
    })
    .from(recordingUploads)
    .where(
      and(
        eq(recordingUploads.batchId, id),
        ne(recordingUploads.state, "aborted"),
      ),
    );
  if (usage.positionTaken) return { status: 409 } as const;
  if (
    usage.files >= gpxBatchLimits.files ||
    usage.bytes + bytes > gpxBatchLimits.bytes
  )
    return { status: 429 } as const;
  return { status: 200, expiresAt: batch.expiresAt } as const;
}

export async function discardBatchFile(
  tx: DatabaseTransaction,
  boss: PgBoss,
  upload: Upload,
  overdueOnly = false,
) {
  if (!upload.batchId) return undefined;
  if (upload.state === "aborted") return upload;
  await lockRecordingAccount(tx, upload.ownerId);
  const batch = await readRecordingBatch(tx, upload.batchId);
  if (!batch || batch.savedAt || (overdueOnly && batch.expiresAt > new Date()))
    return undefined;

  const [imported] = await tx
    .select({ originalId: recordingImports.originalId })
    .from(recordingImports)
    .where(eq(recordingImports.id, upload.id));
  const reclaim = new Set([upload.id]);
  if (imported) {
    const [original] = await tx
      .select()
      .from(recordingOriginals)
      .where(eq(recordingOriginals.id, imported.originalId))
      .for("update");
    await tx
      .delete(recordingReviews)
      .where(eq(recordingReviews.importId, upload.id));
    await tx.delete(recordingImports).where(eq(recordingImports.id, upload.id));

    const [reference] = await tx
      .select({ id: recordingImports.id })
      .from(recordingImports)
      .where(eq(recordingImports.originalId, imported.originalId))
      .limit(1);
    if (original && !original.retained && !reference) {
      await tx
        .delete(recordingSamplePages)
        .where(eq(recordingSamplePages.originalId, original.id));
      await tx
        .delete(recordingSections)
        .where(eq(recordingSections.originalId, original.id));
      await tx
        .delete(recordingOriginals)
        .where(eq(recordingOriginals.id, original.id));
      reclaim.add(original.uploadId);
    }
  }

  const [aborted] = await tx
    .update(recordingUploads)
    .set({ state: "aborted", cleanedAt: null })
    .where(eq(recordingUploads.id, upload.id))
    .returning();
  for (const id of reclaim) {
    if (id !== upload.id) {
      await tx
        .update(recordingUploads)
        .set({ cleanedAt: null })
        .where(eq(recordingUploads.id, id));
    }
    await queueRecordingJob(tx, boss, recordingReclaimQueue, {
      ownerId: upload.ownerId,
      id,
    });
  }
  return aborted;
}

export async function expireBatchFile(
  tx: DatabaseTransaction,
  boss: PgBoss,
  id: string,
) {
  const upload = await readUpload(tx, id, true);
  if (upload) await discardBatchFile(tx, boss, upload, true);
}
