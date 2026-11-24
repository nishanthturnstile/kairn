import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { kairn } from "../../db/namespaces.js";
import { accounts } from "../identity/schema.js";

export const journeyCapability = kairn.enum("journey_capability", [
  "administrator",
  "coauthor",
  "publisher",
]);

export const journeys = kairn
  .table(
    "journeys",
    {
      id: uuid("id").primaryKey(),
      title: text("title").notNull(),
      createdBy: uuid("created_by").references(() => accounts.id, {
        onDelete: "set null",
      }),
      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      archivedAt: timestamp("archived_at", { withTimezone: true }),
      draftGeneration: integer("draft_generation").default(1).notNull(),
      policyGeneration: integer("policy_generation").default(1).notNull(),
      timeZone: text("time_zone"),
      intendedStartLocal: text("intended_start_local"),
      intendedStartAt: timestamp("intended_start_at", { withTimezone: true }),
      startOffset: text("start_offset"),
      intendedEndLocal: text("intended_end_local"),
      intendedEndAt: timestamp("intended_end_at", { withTimezone: true }),
      endOffset: text("end_offset"),
    },
    (journey) => [
      index("journeys_creator_idx").on(journey.createdBy),
      index("journeys_intended_start_idx").on(
        journey.intendedStartAt,
        journey.id,
      ),
      check("journeys_title_present", sql`length(btrim(${journey.title})) > 0`),
      check(
        "journeys_generations_positive",
        sql`${journey.draftGeneration} > 0 AND ${journey.policyGeneration} > 0`,
      ),
      check(
        "journeys_start_schedule_group",
        sql`num_nonnulls(${journey.timeZone}, ${journey.intendedStartLocal}, ${journey.intendedStartAt}, ${journey.startOffset}) IN (0, 4)`,
      ),
      check(
        "journeys_end_schedule_group",
        sql`num_nonnulls(${journey.intendedEndLocal}, ${journey.intendedEndAt}, ${journey.endOffset}) IN (0, 3)`,
      ),
      check(
        "journeys_schedule_range",
        sql`${journey.intendedEndAt} IS NULL OR (${journey.intendedStartAt} IS NOT NULL AND ${journey.intendedEndAt} >= ${journey.intendedStartAt})`,
      ),
    ],
  )
  .enableRLS();

export const journeyCreationReceipts = kairn
  .table(
    "journey_creation_receipts",
    {
      accountId: uuid("account_id")
        .notNull()
        .references(() => accounts.id, { onDelete: "cascade" }),
      key: uuid("key").notNull(),
      journeyId: uuid("journey_id")
        .unique()
        .references(() => journeys.id, { onDelete: "set null" }),
      payloadDigest: text("payload_digest").notNull(),
    },
    (receipt) => [
      primaryKey({ columns: [receipt.accountId, receipt.key] }),
      check(
        "journey_creation_receipts_digest",
        sql`${receipt.payloadDigest} ~ '^[0-9a-f]{64}$'`,
      ),
    ],
  )
  .enableRLS();

export const journeyMemberships = kairn
  .table(
    "journey_memberships",
    {
      journeyId: uuid("journey_id")
        .notNull()
        .references(() => journeys.id),
      accountId: uuid("account_id")
        .notNull()
        .references(() => accounts.id),
      joinedAt: timestamp("joined_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      revokedAt: timestamp("revoked_at", { withTimezone: true }),
      generation: uuid("generation").defaultRandom().notNull(),
      coauthorRevision: integer("coauthor_revision").default(0).notNull(),
      publisherRevision: integer("publisher_revision").default(0).notNull(),
    },
    (membership) => [
      primaryKey({ columns: [membership.journeyId, membership.accountId] }),
      index("journey_memberships_account_idx").on(
        membership.accountId,
        membership.journeyId,
      ),
      check(
        "journey_memberships_revocation_order",
        sql`${membership.revokedAt} >= ${membership.joinedAt}`,
      ),
      check(
        "journey_memberships_editorial_revisions",
        sql`${membership.coauthorRevision} >= 0 AND ${membership.publisherRevision} >= 0`,
      ),
    ],
  )
  .enableRLS();

export const invitationDecision = kairn.enum("journey_invitation_decision", [
  "pending",
  "accepted",
  "cancelled",
  "replaced",
  "expired",
]);

export const invitationDelivery = kairn.enum("journey_invitation_delivery", [
  "queued",
  "sent",
  "failed",
  "expired",
]);

export const journeyInvitations = kairn
  .table(
    "journey_invitations",
    {
      id: uuid("id").primaryKey(),
      journeyId: uuid("journey_id")
        .notNull()
        .references(() => journeys.id),
      issuedBy: uuid("issued_by")
        .notNull()
        .references(() => accounts.id),
      issuerGeneration: uuid("issuer_generation").notNull(),
      recipient: text("recipient").notNull(),
      recipientLabel: text("recipient_label"),
      scope: text("scope").default("participant").notNull(),
      tokenDigest: text("token_digest").unique(),
      epochDigest: text("epoch_digest").notNull(),
      revision: integer("revision").default(1).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      decision: invitationDecision("decision").default("pending").notNull(),
      acceptedBy: uuid("accepted_by").references(() => accounts.id),
      acceptedGeneration: uuid("accepted_generation"),
    },
    (invitation) => [
      uniqueIndex("journey_invitations_pending_recipient_idx")
        .on(invitation.journeyId, invitation.recipient)
        .where(sql`${invitation.decision} = 'pending'`),
      index("journey_invitations_journey_idx").on(
        invitation.journeyId,
        invitation.id,
      ),
      index("journey_invitations_issuer_rate_idx").on(
        invitation.issuedBy,
        invitation.createdAt,
      ),
      index("journey_invitations_journey_rate_idx").on(
        invitation.journeyId,
        invitation.createdAt,
      ),
      index("journey_invitations_recipient_rate_idx").on(
        invitation.recipient,
        invitation.createdAt,
      ),
      check(
        "journey_invitations_participant",
        sql`${invitation.scope} = 'participant'`,
      ),
      check("journey_invitations_revision", sql`${invitation.revision} > 0`),
      check(
        "journey_invitations_expiry",
        sql`${invitation.expiresAt} > ${invitation.createdAt}`,
      ),
      check(
        "journey_invitations_acceptance",
        sql`(
        (${invitation.decision} = 'accepted' AND ${invitation.acceptedBy} IS NOT NULL
          AND ${invitation.acceptedGeneration} IS NOT NULL)
        OR (${invitation.decision} <> 'accepted' AND ${invitation.acceptedBy} IS NULL
          AND ${invitation.acceptedGeneration} IS NULL)
      )`,
      ),
    ],
  )
  .enableRLS();

export const journeyInvitationMail = kairn
  .table(
    "journey_invitation_mail",
    {
      id: uuid("id")
        .primaryKey()
        .references(() => journeyInvitations.id, {
          onDelete: "cascade",
        }),
      ciphertext: text("ciphertext"),
      delivery: invitationDelivery("delivery").default("queued").notNull(),
    },
    (mail) => [
      check(
        "journey_invitation_mail_payload",
        sql`(${mail.delivery} = 'queued') = (${mail.ciphertext} IS NOT NULL)`,
      ),
    ],
  )
  .enableRLS();

export const journeyInvitationAttempts = kairn
  .table(
    "journey_invitation_attempts",
    {
      journeyId: uuid("journey_id")
        .notNull()
        .references(() => journeys.id),
      accountId: uuid("account_id")
        .notNull()
        .references(() => accounts.id),
      key: uuid("key").notNull(),
      epochDigest: text("epoch_digest").notNull(),
      payloadDigest: text("payload_digest").notNull(),
      result: jsonb("result").notNull(),
      recordedAt: timestamp("recorded_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (attempt) => [
      primaryKey({
        columns: [attempt.journeyId, attempt.accountId, attempt.key],
      }),
      index("journey_invitation_attempts_actor_rate_idx").on(
        attempt.accountId,
        attempt.recordedAt,
      ),
      index("journey_invitation_attempts_retention_idx").on(attempt.recordedAt),
    ],
  )
  .enableRLS();

export const journeyInvitationAcceptances = kairn
  .table(
    "journey_invitation_acceptances",
    {
      accountId: uuid("account_id")
        .notNull()
        .references(() => accounts.id),
      operationId: uuid("operation_id").notNull(),
      invitationId: uuid("invitation_id")
        .notNull()
        .unique()
        .references(() => journeyInvitations.id),
      membershipGeneration: uuid("membership_generation").notNull(),
    },
    (acceptance) => [
      primaryKey({ columns: [acceptance.accountId, acceptance.operationId] }),
    ],
  )
  .enableRLS();

export const journeyInviteeSearchWindows = kairn
  .table("journey_invitee_search_windows", {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  })
  .enableRLS();

export const journeyCapabilities = kairn
  .table(
    "journey_capabilities",
    {
      journeyId: uuid("journey_id").notNull(),
      accountId: uuid("account_id").notNull(),
      capability: journeyCapability("capability").notNull(),
    },
    (capability) => [
      primaryKey({
        columns: [
          capability.journeyId,
          capability.accountId,
          capability.capability,
        ],
      }),
      foreignKey({
        name: "journey_capabilities_membership_fk",
        columns: [capability.journeyId, capability.accountId],
        foreignColumns: [
          journeyMemberships.journeyId,
          journeyMemberships.accountId,
        ],
      }).onDelete("cascade"),
    ],
  )
  .enableRLS();
