import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logger } from "../logger.js";
import {
  accounts,
  identityMail,
  identityRecovery,
  journeyCapabilities,
  journeyCreationReceipts,
  journeyMemberships,
  journeys,
  user,
} from "./schema.js";

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
    select credential_recovery, first_verified_at, onboarding_step, onboarding_intent from ${accounts} limit 0;
    select epoch_digest from ${identityRecovery} limit 0;
    select state from ${identityMail} limit 0
  `);
}

export async function checkJourneyReadiness(db: Database) {
  await db.execute(sql`
    select time_zone, intended_start_local, intended_start_at, start_offset,
      intended_end_local, intended_end_at, end_offset from ${journeys} limit 0;
    select revoked_at from ${journeyMemberships} limit 0;
    select capability from ${journeyCapabilities} limit 0;
    select payload_digest from ${journeyCreationReceipts} limit 0
  `);
  const result = await db.execute<{ allowed: boolean }>(sql`
    select has_function_privilege(
      'kairn.create_private_journey(uuid,text,text,text,text,timestamptz,text,text,timestamptz,text)',
      'EXECUTE'
    ) as allowed
  `);
  if (!result.rows[0]?.allowed)
    throw new Error("Journey creation is unavailable.");
}

export type Database = ReturnType<typeof openDatabase>["db"];
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
