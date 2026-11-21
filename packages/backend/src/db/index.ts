import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logger } from "../logger.js";
import {
  accounts,
  companionSetups,
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
    select credential_recovery, first_verified_at, onboarding_step, onboarding_intent, invite_discoverable from ${accounts} limit 0;
    select account_id, state, expires_at, selected_journey_id from ${companionSetups} limit 0;
    select epoch_digest from ${identityRecovery} limit 0;
    select state from ${identityMail} limit 0
  `);
}

export async function checkJourneyReadiness(
  db: Database | DatabaseTransaction,
) {
  await db.execute(sql`
    select time_zone, intended_start_local, intended_start_at, start_offset,
      intended_end_local, intended_end_at, end_offset from ${journeys} limit 0;
    select revoked_at, generation from ${journeyMemberships} limit 0;
    select capability from ${journeyCapabilities} limit 0;
    select payload_digest from ${journeyCreationReceipts} limit 0
  `);
  const result = await db.execute<{
    canCreate: boolean;
    canReadPeople: boolean;
    canUseInvitations: boolean;
    canRestrictMembership: boolean;
  }>(sql`
    select has_function_privilege(
      'kairn.create_private_journey(uuid,text,text,text,text,timestamptz,text,text,timestamptz,text)',
      'EXECUTE'
    ) as "canCreate", has_function_privilege(
      'kairn.read_journey_people(uuid,uuid)',
      'EXECUTE'
    ) as "canReadPeople", (
      select bool_and(coalesce(has_function_privilege(to_regprocedure(signature), 'EXECUTE'), false))
      from (values
        ('kairn.read_journey_invitations(uuid,uuid,text)'),
        ('kairn.manage_journey_invitees(uuid,uuid,text,uuid,text,text,jsonb)'),
        ('kairn.find_journey_invitees(uuid,text,boolean)'),
        ('kairn.resolve_journey_invitation(text,text)'),
        ('kairn.review_journey_invitation(uuid,text)'),
        ('kairn.accept_journey_invitation(uuid,uuid,text,timestamptz)'),
        ('kairn.read_journey_invitation_acceptance(uuid,text)')
      ) as routines(signature)
    ) as "canUseInvitations", (
      select bool_and(coalesce(has_function_privilege(to_regprocedure(signature), 'EXECUTE'), false))
      from (values
        ('kairn.restrict_journey_member(uuid,uuid,uuid,uuid)'),
        ('kairn.read_membership_restriction(uuid)'),
        ('kairn.confirm_membership_restriction(uuid,text,bigint,text)')
      ) as routines(signature)
    ) as "canRestrictMembership"
  `);
  if (!result.rows[0]?.canCreate)
    throw new Error("Journey creation is unavailable.");
  if (!result.rows[0].canReadPeople)
    throw new Error("Journey People is unavailable.");
  if (!result.rows[0].canUseInvitations)
    throw new Error("Journey invitations are unavailable.");
  if (!result.rows[0].canRestrictMembership)
    throw new Error("Journey membership restrictions are unavailable.");
}

export type Database = ReturnType<typeof openDatabase>["db"];
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
