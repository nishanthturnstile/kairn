import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { kairn } from "../../db/namespaces.js";
import { accounts } from "../identity/schema.js";
import { journeyMemberships, journeys } from "../journeys/schema.js";

export const sourceScope = kairn.enum("source_scope", [
  "journey_review",
  "publication_reuse",
]);

export const originalExportDecision = kairn.enum("original_export_decision", [
  "pending",
  "approved",
  "declined",
]);

export const sources = kairn
  .table(
    "sources",
    {
      id: uuid("id").primaryKey(),
      ownerId: uuid("owner_id")
        .notNull()
        .references(() => accounts.id),
      deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (source) => [
      unique("sources_id_owner_unique").on(source.id, source.ownerId),
      index("sources_owner_idx").on(source.ownerId),
    ],
  )
  .enableRLS();

export const sourceAssets = kairn
  .table(
    "source_assets",
    {
      id: uuid("id").primaryKey(),
      sourceId: uuid("source_id")
        .notNull()
        .references(() => sources.id),
      deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (asset) => [
      unique("source_assets_source_id_unique").on(asset.sourceId, asset.id),
    ],
  )
  .enableRLS();

export const sourceGrants = kairn
  .table(
    "source_grants",
    {
      journeyId: uuid("journey_id")
        .notNull()
        .references(() => journeys.id),
      sourceId: uuid("source_id").notNull(),
      ownerId: uuid("owner_id").notNull(),
      scope: sourceScope("scope").notNull(),
      publicationConsent: text("publication_consent"),
      revision: integer("revision").default(1).notNull(),
      withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    },
    (grant) => [
      primaryKey({ columns: [grant.journeyId, grant.sourceId] }),
      unique("source_grants_journey_source_owner_unique").on(
        grant.journeyId,
        grant.sourceId,
        grant.ownerId,
      ),
      foreignKey({
        name: "source_grants_owner_fk",
        columns: [grant.sourceId, grant.ownerId],
        foreignColumns: [sources.id, sources.ownerId],
      }),
      index("source_grants_source_idx").on(grant.sourceId, grant.ownerId),
      check("source_grants_revision_positive", sql`${grant.revision} > 0`),
      check(
        "source_grants_publication_consent",
        sql`${grant.publicationConsent} IS NULL OR (${grant.scope} = 'publication_reuse' AND ${grant.withdrawnAt} IS NULL AND ${grant.publicationConsent} = 'members_unlisted_public_v1')`,
      ),
    ],
  )
  .enableRLS();

export const originalExportGrants = kairn
  .table(
    "original_export_grants",
    {
      id: uuid("id").primaryKey(),
      journeyId: uuid("journey_id").notNull(),
      ownerId: uuid("owner_id")
        .notNull()
        .references(() => accounts.id),
      recipientId: uuid("recipient_id").notNull(),
      recipientMembershipGeneration: uuid("recipient_membership_generation"),
      requestKey: uuid("request_key"),
      decision: originalExportDecision("decision")
        .default("approved")
        .notNull(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      revokedAt: timestamp("revoked_at", { withTimezone: true }),
    },
    (grant) => [
      unique("original_export_grants_id_journey_owner_unique").on(
        grant.id,
        grant.journeyId,
        grant.ownerId,
      ),
      unique("original_export_grants_request_key_unique").on(
        grant.journeyId,
        grant.recipientId,
        grant.requestKey,
      ),
      foreignKey({
        name: "original_export_grants_recipient_fk",
        columns: [grant.journeyId, grant.recipientId],
        foreignColumns: [
          journeyMemberships.journeyId,
          journeyMemberships.accountId,
        ],
      }),
      index("original_export_grants_recipient_idx").on(
        grant.journeyId,
        grant.recipientId,
      ),
      index("original_export_grants_owner_idx").on(grant.ownerId),
      check(
        "original_export_grants_distinct_recipient",
        sql`${grant.ownerId} <> ${grant.recipientId}`,
      ),
      check(
        "original_export_grants_expiry_order",
        sql`${grant.expiresAt} > ${grant.createdAt}`,
      ),
      check(
        "original_export_grants_request_scope",
        sql`(${grant.requestKey} IS NULL) = (${grant.recipientMembershipGeneration} IS NULL) AND (${grant.requestKey} IS NOT NULL OR ${grant.decision} = 'approved')`,
      ),
    ],
  )
  .enableRLS();

export const exportGrantAssets = kairn
  .table(
    "export_grant_assets",
    {
      grantId: uuid("grant_id").notNull(),
      assetId: uuid("asset_id").notNull(),
      journeyId: uuid("journey_id").notNull(),
      sourceId: uuid("source_id").notNull(),
      ownerId: uuid("owner_id").notNull(),
      sourceGrantRevision: integer("source_grant_revision").notNull(),
    },
    (asset) => [
      primaryKey({ columns: [asset.grantId, asset.assetId] }),
      foreignKey({
        name: "export_grant_assets_export_grant_fk",
        columns: [asset.grantId, asset.journeyId, asset.ownerId],
        foreignColumns: [
          originalExportGrants.id,
          originalExportGrants.journeyId,
          originalExportGrants.ownerId,
        ],
      }).onDelete("cascade"),
      foreignKey({
        name: "export_grant_assets_source_asset_fk",
        columns: [asset.sourceId, asset.assetId],
        foreignColumns: [sourceAssets.sourceId, sourceAssets.id],
      }),
      foreignKey({
        name: "export_grant_assets_source_grant_fk",
        columns: [asset.journeyId, asset.sourceId, asset.ownerId],
        foreignColumns: [
          sourceGrants.journeyId,
          sourceGrants.sourceId,
          sourceGrants.ownerId,
        ],
      }),
      index("export_grant_assets_source_asset_idx").on(
        asset.sourceId,
        asset.assetId,
      ),
      index("export_grant_assets_source_grant_idx").on(
        asset.journeyId,
        asset.sourceId,
        asset.ownerId,
      ),
      check(
        "export_grant_assets_revision_positive",
        sql`${asset.sourceGrantRevision} > 0`,
      ),
    ],
  )
  .enableRLS();
