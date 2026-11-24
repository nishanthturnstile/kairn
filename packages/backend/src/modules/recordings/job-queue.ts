import { sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import type { DatabaseTransaction } from "../../db/index.js";

export const recordingInspectionQueue = "recording.inspect";
export const recordingReclaimQueue = "recording.reclaim";

export async function queueRecordingJob(
  tx: DatabaseTransaction,
  boss: PgBoss,
  queue: typeof recordingInspectionQueue | typeof recordingReclaimQueue,
  data: { ownerId: string; id: string },
  startAfter?: Date,
) {
  const job = await boss.send(queue, data, {
    db: fromDrizzle(tx, sql),
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 180,
    startAfter,
  });
  if (!job) throw new Error("Recording job was not enqueued");
  return job;
}
