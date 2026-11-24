import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../db/index.js";
import {
  recordingBatches,
  recordingCommits,
  recordingImports,
  recordingOriginals,
  recordingUploads,
} from "./schema.js";

export async function scopeRecordings(
  tx: DatabaseTransaction,
  ownerId: string,
) {
  await tx.execute(
    sql`select set_config('kairn.recording_account', ${ownerId}, true)`,
  );
}

export async function lockRecordingAccount(
  tx: DatabaseTransaction,
  ownerId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, 13466))`,
  );
}

export async function readUpload(
  tx: DatabaseTransaction,
  id: string,
  lock = false,
) {
  const query = tx
    .select()
    .from(recordingUploads)
    .where(eq(recordingUploads.id, id));
  const rows = await (lock ? query.for("update") : query);
  return rows[0];
}

export const completedKey = (id: string) => `recordings/${id}/original`;
export const partKey = (id: string, part: number) =>
  `recordings/${id}/parts/${part}`;

export const originalActive = sql`kairn.recording_source_active(${recordingOriginals.sourceId}, ${recordingOriginals.id})`;

const consumed = sql<boolean>`exists (
  select 1 from ${recordingCommits} where ${recordingCommits.importId} = ${recordingImports.id}
)`;
export const unconsumed = sql`not ${consumed}`;

export function selectImports(tx: DatabaseTransaction) {
  return tx
    .select({
      id: recordingImports.id,
      batchId: recordingUploads.batchId,
      batchPosition: recordingUploads.batchPosition,
      documentName: recordingOriginals.documentName,
      sourceId: recordingOriginals.sourceId,
      consumed,
      originalId: recordingOriginals.id,
      stage: recordingOriginals.stage,
      fileName: recordingUploads.fileName,
      byteLength: recordingOriginals.byteLength,
      revision: recordingImports.reviewRevision,
      diagnostics: recordingOriginals.diagnostics,
      issue: recordingOriginals.issue,
      sectionCount: recordingOriginals.sectionCount,
      inspectionVersion: recordingOriginals.inspectionVersion,
      inspectionJobId: recordingOriginals.inspectionJobId,
    })
    .from(recordingImports)
    .innerJoin(
      recordingUploads,
      and(
        eq(recordingUploads.id, recordingImports.id),
        eq(recordingUploads.state, "complete"),
      ),
    )
    .leftJoin(
      recordingBatches,
      eq(recordingBatches.id, recordingUploads.batchId),
    )
    .innerJoin(
      recordingOriginals,
      and(
        eq(recordingOriginals.id, recordingImports.originalId),
        or(
          isNull(recordingUploads.batchId),
          isNotNull(recordingBatches.savedAt),
          sql`${recordingBatches.expiresAt} > now()`,
        ),
      ),
    );
}
