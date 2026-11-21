import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
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
        .notNull()
        .unique()
        .references(() => journeys.id, { onDelete: "cascade" }),
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
    ],
  )
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
