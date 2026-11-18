import { and, eq, isNull, sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "./db/index.js";
import { workerChecks } from "./db/schema.js";
import { logger } from "./logger.js";

export const workerCheckQueue = "infrastructure.check";

export function openJobQueue(databaseUrl: string, supervise = false) {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 5_000,
    createSchema: false,
    migrate: false,
    supervise,
    schedule: false,
  });
  boss.on("error", () => logger.error("Job queue failed"));
  return boss;
}

export async function enqueueWorkerCheck(
  transaction: DatabaseTransaction,
  boss: PgBoss,
  id: string,
) {
  await transaction.insert(workerChecks).values({ id });
  const jobId = await boss.send(
    workerCheckQueue,
    { id },
    {
      id,
      db: fromDrizzle(transaction, sql),
    },
  );
  if (!jobId) {
    throw new Error("Worker check was not enqueued.");
  }
  return jobId;
}

const workerCheckPayload = z.object({ id: z.uuid() });

export async function registerWorkerChecks(boss: PgBoss, db: Database) {
  await boss.work(workerCheckQueue, { localConcurrency: 1 }, async ([job]) => {
    const { id } = workerCheckPayload.parse(job.data);
    await db
      .update(workerChecks)
      .set({ processedAt: sql`now()` })
      .where(and(eq(workerChecks.id, id), isNull(workerChecks.processedAt)));
  });
}
