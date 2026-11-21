import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { kairn } from "../../db/namespaces.js";
import { accounts } from "../identity/schema.js";

export const restrictionOperation = kairn.enum("restriction_operation", [
  "account_restriction",
  "credentials_changed",
  "device_session_revoked",
  "membership_revocation",
  "capability_removal",
  "source_grant_narrowing",
  "source_withdrawal",
  "original_export_revocation",
]);

export const auditTargetKind = kairn.enum("audit_target_kind", [
  "account",
  "journey",
  "membership",
  "journey_invitation",
  "source",
  "original_export_grant",
]);

export const auditEvents = kairn
  .table(
    "audit_events",
    {
      id: uuid("id").primaryKey(),
      actorId: uuid("actor_id").references(() => accounts.id, {
        onDelete: "set null",
      }),
      action: text("action").notNull(),
      targetKind: auditTargetKind("target_kind").notNull(),
      targetId: uuid("target_id").notNull(),
      journeyId: uuid("journey_id"),
      occurredAt: timestamp("occurred_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (event) => [
      index("audit_events_actor_idx").on(event.actorId),
      index("audit_events_target_idx").on(
        event.targetKind,
        event.targetId,
        event.occurredAt,
      ),
      check(
        "audit_events_action_code",
        sql`${event.action} ~ '^[a-z][a-z0-9_]{0,63}$'`,
      ),
    ],
  )
  .enableRLS();

export const restrictionEvents = kairn
  .table(
    "restriction_events",
    {
      id: uuid("id").primaryKey(),
      auditEventId: uuid("audit_event_id")
        .notNull()
        .unique()
        .references(() => auditEvents.id),
      operation: restrictionOperation("operation").notNull(),
      policyGeneration: integer("policy_generation").notNull(),
      affectedSessionId: uuid("affected_session_id"),
      affectedMembershipGeneration: uuid("affected_membership_generation"),
      integrityDigest: text("integrity_digest").notNull(),
      journalSequence: bigint("journal_sequence", { mode: "bigint" }).unique(),
      journalReceipt: text("journal_receipt"),
    },
    (event) => [
      check(
        "restriction_events_generation_positive",
        sql`${event.policyGeneration} > 0`,
      ),
      check(
        "restriction_events_device_scope",
        sql`(${event.operation}::text = 'device_session_revoked') = (${event.affectedSessionId} IS NOT NULL)`,
      ),
      check(
        "restriction_events_membership_scope",
        sql`(${event.operation}::text = 'membership_revocation') = (${event.affectedMembershipGeneration} IS NOT NULL)`,
      ),
      check(
        "restriction_events_digest_sha256",
        sql`${event.integrityDigest} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "restriction_events_receipt_pair",
        sql`(${event.journalSequence} IS NULL) = (${event.journalReceipt} IS NULL)`,
      ),
      check(
        "restriction_events_sequence_positive",
        sql`${event.journalSequence} > 0`,
      ),
      check(
        "restriction_events_receipt_length",
        sql`length(${event.journalReceipt}) BETWEEN 1 AND 2048`,
      ),
    ],
  )
  .enableRLS();

export const membershipRestrictionAttempts = kairn
  .table(
    "membership_restriction_attempts",
    {
      actorId: uuid("actor_id")
        .notNull()
        .references(() => accounts.id),
      key: uuid("key").notNull(),
      eventId: uuid("event_id")
        .notNull()
        .unique()
        .references(() => restrictionEvents.id),
    },
    (attempt) => [primaryKey({ columns: [attempt.actorId, attempt.key] })],
  )
  .enableRLS();
