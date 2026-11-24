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
    canManageSourceReview: boolean;
    canManageEditorialCapabilities: boolean;
    canManageOriginalExports: boolean;
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
        ('kairn.find_recording_batch_invitees(uuid,text,boolean)'),
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
    ) as "canRestrictMembership", (
      select bool_and(coalesce(has_function_privilege(to_regprocedure(signature), 'EXECUTE'), false))
      from (values
        ('kairn.read_source_review(uuid,uuid)'),
        ('kairn.set_source_permission(uuid,uuid,integer,text,text)'),
        ('kairn.read_source_withdrawal(uuid)'),
        ('kairn.confirm_source_withdrawal(uuid,text,bigint,text)'),
        ('kairn.read_source_narrowing(uuid)'),
        ('kairn.confirm_source_narrowing(uuid,text,bigint,text)')
      ) as routines(signature)
    ) as "canManageSourceReview", (
      select bool_and(coalesce(has_function_privilege(to_regprocedure(signature), 'EXECUTE'), false))
      from (values
        ('kairn.set_editorial_capability(uuid,uuid,uuid,kairn.journey_capability,integer,boolean)'),
        ('kairn.read_editorial_capability_removal(uuid)'),
        ('kairn.confirm_editorial_capability_removal(uuid,text,bigint,text)')
      ) as routines(signature)
    ) as "canManageEditorialCapabilities", (
      select bool_and(coalesce(has_function_privilege(to_regprocedure(signature), 'EXECUTE'), false))
      from (values
        ('kairn.request_original_export(uuid,uuid,uuid[],timestamptz,uuid)'),
        ('kairn.read_original_export(uuid,uuid)'),
        ('kairn.list_original_exports(uuid,uuid)'),
        ('kairn.decide_original_export(uuid,uuid,boolean,boolean)'),
        ('kairn.authorize_original_export(uuid,uuid)'),
        ('kairn.revoke_original_export(uuid,uuid)'),
        ('kairn.read_original_export_revocation(uuid)'),
        ('kairn.confirm_original_export_revocation(uuid,text,bigint,text)')
      ) as routines(signature)
    ) as "canManageOriginalExports"
  `);
  if (!result.rows[0]?.canCreate)
    throw new Error("Journey creation is unavailable.");
  if (!result.rows[0].canReadPeople)
    throw new Error("Journey People is unavailable.");
  if (!result.rows[0].canUseInvitations)
    throw new Error("Journey invitations are unavailable.");
  if (!result.rows[0].canRestrictMembership)
    throw new Error("Journey membership restrictions are unavailable.");
  if (!result.rows[0].canManageSourceReview)
    throw new Error("Source review permissions are unavailable.");
  if (!result.rows[0].canManageEditorialCapabilities)
    throw new Error("Journey editorial capabilities are unavailable.");
  if (!result.rows[0].canManageOriginalExports)
    throw new Error("Original-file export permissions are unavailable.");
}

export type Database = ReturnType<typeof openDatabase>["db"];
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
