import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logger } from "../logger.js";
import { accounts, identityMail, identityRecovery, user } from "./schema.js";

export function openDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  pool.on("error", () => logger.error("Idle database connection failed"));

  return { db: drizzle(pool), pool };
}

export async function checkDatabaseReadiness(
  db: Database | DatabaseTransaction,
) {
  await db.execute(sql`
    select 1 from ${user} limit 0;
    select credential_recovery from ${accounts} limit 0;
    select epoch_digest from ${identityRecovery} limit 0;
    select state from ${identityMail} limit 0
  `);
}

export type Database = ReturnType<typeof openDatabase>["db"];
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
