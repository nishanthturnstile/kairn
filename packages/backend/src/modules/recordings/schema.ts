import type {
  GpxDiagnostics,
  GpxIssue,
  RecordingCommit,
  RecordingSection,
} from "@kairn/contracts/recordings";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { kairn } from "../../db/namespaces.js";
import { accounts } from "../identity/schema.js";
import { journeys } from "../journeys/schema.js";
import { sourceAssets, sources } from "../sources/schema.js";
import type { GpxSample } from "./measurements.js";
import type { StoredSelection } from "./review.js";

export const uploadState = kairn.enum("recording_upload_state", [
  "uploading",
  "complete",
  "aborted",
  "expired",
  "rejected",
]);
export const processingStage = kairn.enum("recording_processing_stage", [
  "queued",
  "ready",
  "rejected",
  "failed",
]);

export const recordingBatches = kairn
  .table(
    "recording_batches",
    {
      id: uuid("id").primaryKey(),
      ownerId: uuid("owner_id")
        .notNull()
        .references(() => accounts.id),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      savedAt: timestamp("saved_at", { withTimezone: true }),
      journeyId: uuid("journey_id").references(() => journeys.id, {
        onDelete: "set null",
      }),
      saveDigest: text("save_digest"),
    },
    (batch) => [
      unique("recording_batch_id_owner_key").on(batch.id, batch.ownerId),
      index("recording_batch_expiry_idx").on(batch.expiresAt),
      index("recording_batch_journey_idx").on(batch.journeyId),
    ],
  )
  .enableRLS();

export const recordingUploads = kairn
  .table(
    "recording_uploads",
    {
      id: uuid("id").primaryKey(),
      ownerId: uuid("owner_id")
        .notNull()
        .references(() => accounts.id),
      deviceId: uuid("device_id").notNull(),
      commandId: uuid("command_id").notNull(),
      fileName: text("file_name").notNull(),
      sha256: text("sha256").notNull(),
      byteLength: integer("byte_length").notNull(),
      state: uploadState("state").default("uploading").notNull(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
      batchId: uuid("batch_id"),
      batchPosition: integer("batch_position"),
    },
    (upload) => [
      unique("recording_upload_owner_device_command_key").on(
        upload.ownerId,
        upload.deviceId,
        upload.commandId,
      ),
      unique("recording_upload_id_owner_key").on(upload.id, upload.ownerId),
      index("recording_upload_cleanup_idx").on(upload.state, upload.expiresAt),
      index("recording_upload_batch_idx").on(
        upload.batchId,
        upload.batchPosition,
      ),
      foreignKey({
        name: "recording_upload_batch_owner_fk",
        columns: [upload.batchId, upload.ownerId],
        foreignColumns: [recordingBatches.id, recordingBatches.ownerId],
      }),
    ],
  )
  .enableRLS();

export const recordingParts = kairn
  .table(
    "recording_parts",
    {
      uploadId: uuid("upload_id").notNull(),
      ownerId: uuid("owner_id").notNull(),
      partNumber: integer("part_number").notNull(),
      byteLength: integer("byte_length").notNull(),
      sha256: text("sha256").notNull(),
    },
    (part) => [
      primaryKey({ columns: [part.uploadId, part.partNumber] }),
      foreignKey({
        name: "recording_part_upload_owner_fk",
        columns: [part.uploadId, part.ownerId],
        foreignColumns: [recordingUploads.id, recordingUploads.ownerId],
      }),
    ],
  )
  .enableRLS();

export const recordingOriginals = kairn
  .table(
    "recording_originals",
    {
      id: uuid("id").primaryKey(),
      ownerId: uuid("owner_id").notNull(),
      sourceId: uuid("source_id").notNull(),
      uploadId: uuid("upload_id").notNull(),
      sha256: text("sha256").notNull(),
      byteLength: integer("byte_length").notNull(),
      inspectionVersion: integer("inspection_version").notNull(),
      inspectionJobId: uuid("inspection_job_id").notNull(),
      stage: processingStage("stage").default("queued").notNull(),
      diagnostics: jsonb("diagnostics").$type<GpxDiagnostics>(),
      issue: text("issue").$type<GpxIssue>(),
      sectionCount: integer("section_count").default(0).notNull(),
      retained: boolean("retained").default(true).notNull(),
      documentName: text("document_name"),
    },
    (original) => [
      unique("recording_original_owner_file_key").on(
        original.ownerId,
        original.sha256,
        original.byteLength,
      ),
      unique("recording_original_id_owner_key").on(
        original.id,
        original.ownerId,
      ),
      foreignKey({
        name: "recording_original_source_asset_fk",
        columns: [original.sourceId, original.id],
        foreignColumns: [sourceAssets.sourceId, sourceAssets.id],
      }),
      foreignKey({
        name: "recording_original_source_owner_fk",
        columns: [original.sourceId, original.ownerId],
        foreignColumns: [sources.id, sources.ownerId],
      }),
      foreignKey({
        name: "recording_original_upload_owner_fk",
        columns: [original.uploadId, original.ownerId],
        foreignColumns: [recordingUploads.id, recordingUploads.ownerId],
      }),
    ],
  )
  .enableRLS();

export const recordingImports = kairn
  .table(
    "recording_imports",
    {
      // A successful upload always resolves to this same import.
      id: uuid("id").primaryKey(),
      ownerId: uuid("owner_id").notNull(),
      originalId: uuid("original_id").notNull(),
      reviewRevision: integer("review_revision").default(1).notNull(),
    },
    (draft) => [
      index("recording_import_owner_idx").on(draft.ownerId, draft.id),
      unique("recording_import_id_owner_key").on(draft.id, draft.ownerId),
      foreignKey({
        name: "recording_import_upload_owner_fk",
        columns: [draft.id, draft.ownerId],
        foreignColumns: [recordingUploads.id, recordingUploads.ownerId],
      }),
      foreignKey({
        name: "recording_import_original_owner_fk",
        columns: [draft.originalId, draft.ownerId],
        foreignColumns: [recordingOriginals.id, recordingOriginals.ownerId],
      }),
    ],
  )
  .enableRLS();

export const recordingSections = kairn
  .table(
    "recording_sections",
    {
      originalId: uuid("original_id").notNull(),
      ownerId: uuid("owner_id").notNull(),
      ordinal: integer("ordinal").notNull(),
      summary: jsonb("summary")
        .$type<Omit<RecordingSection, "ordinal" | "included">>()
        .notNull(),
    },
    (section) => [
      primaryKey({ columns: [section.originalId, section.ordinal] }),
      foreignKey({
        name: "recording_section_original_owner_fk",
        columns: [section.originalId, section.ownerId],
        foreignColumns: [recordingOriginals.id, recordingOriginals.ownerId],
      }),
    ],
  )
  .enableRLS();

export const recordingSamplePages = kairn
  .table(
    "recording_sample_pages",
    {
      originalId: uuid("original_id").notNull(),
      ownerId: uuid("owner_id").notNull(),
      section: integer("section").notNull(),
      page: integer("page").notNull(),
      samples: jsonb("samples").$type<GpxSample[]>().notNull(),
    },
    (part) => [
      primaryKey({ columns: [part.originalId, part.section, part.page] }),
      foreignKey({
        name: "recording_sample_original_owner_fk",
        columns: [part.originalId, part.ownerId],
        foreignColumns: [recordingOriginals.id, recordingOriginals.ownerId],
      }),
    ],
  )
  .enableRLS();

export const recordingReviews = kairn
  .table(
    "recording_reviews",
    {
      importId: uuid("import_id").notNull(),
      ownerId: uuid("owner_id").notNull(),
      revision: integer("revision").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      selection: jsonb("selection").$type<StoredSelection>().notNull(),
    },
    (review) => [
      primaryKey({ columns: [review.importId, review.revision] }),
      foreignKey({
        name: "recording_review_import_owner_fk",
        columns: [review.importId, review.ownerId],
        foreignColumns: [recordingImports.id, recordingImports.ownerId],
      }),
    ],
  )
  .enableRLS();

export const recordingAttachments = kairn
  .table(
    "recording_attachments",
    {
      id: uuid("id").primaryKey(),
      journeyId: uuid("journey_id")
        .notNull()
        .references(() => journeys.id, { onDelete: "cascade" }),
      importId: uuid("import_id").notNull(),
      originalId: uuid("original_id").notNull(),
      sourceId: uuid("source_id").notNull(),
      ownerId: uuid("owner_id").notNull(),
      membershipGeneration: uuid("membership_generation").notNull(),
      reviewRevision: integer("review_revision").notNull(),
      reviewPinnedAt: timestamp("review_pinned_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      selection: jsonb("selection").$type<StoredSelection>().notNull(),
      fileName: text("file_name").notNull(),
      sectionCount: integer("section_count").notNull(),
      placedInDraft: boolean("placed_in_draft").default(false).notNull(),
      placementGrantRevision: integer("placement_grant_revision"),
      detachedAt: timestamp("detached_at", { withTimezone: true }),
      detachEventId: uuid("detach_event_id"),
    },
    (item) => [
      uniqueIndex("recording_live_attachment_journey_original_key")
        .on(item.journeyId, item.originalId)
        .where(sql`${item.detachedAt} is null`),
      unique("recording_attachment_id_owner_key").on(item.id, item.ownerId),
      index("recording_attachment_journey_idx").on(item.journeyId, item.id),
      foreignKey({
        name: "recording_attachment_import_owner_fk",
        columns: [item.importId, item.ownerId],
        foreignColumns: [recordingImports.id, recordingImports.ownerId],
      }),
      foreignKey({
        name: "recording_attachment_original_owner_fk",
        columns: [item.originalId, item.ownerId],
        foreignColumns: [recordingOriginals.id, recordingOriginals.ownerId],
      }),
      foreignKey({
        name: "recording_attachment_source_asset_fk",
        columns: [item.sourceId, item.originalId],
        foreignColumns: [sourceAssets.sourceId, sourceAssets.id],
      }),
    ],
  )
  .enableRLS();

export const recordingCommits = kairn
  .table(
    "recording_commits",
    {
      importId: uuid("import_id").primaryKey(),
      ownerId: uuid("owner_id").notNull(),
      deviceId: uuid("device_id").notNull(),
      commandId: uuid("command_id").notNull(),
      fingerprint: text("fingerprint").notNull(),
      associationId: uuid("association_id"),
      outcome: text("outcome").$type<RecordingCommit["outcome"]>().notNull(),
    },
    (commit) => [
      unique("recording_commit_owner_command_key").on(
        commit.ownerId,
        commit.deviceId,
        commit.commandId,
      ),
      index("recording_commit_association_idx").on(commit.associationId),
      foreignKey({
        name: "recording_commit_import_owner_fk",
        columns: [commit.importId, commit.ownerId],
        foreignColumns: [recordingImports.id, recordingImports.ownerId],
      }),
      foreignKey({
        name: "recording_commit_attachment_owner_fk",
        columns: [commit.associationId, commit.ownerId],
        foreignColumns: [recordingAttachments.id, recordingAttachments.ownerId],
        // SQL applies SET NULL to association_id only, keeping the owner and receipt.
      }).onDelete("set null"),
    ],
  )
  .enableRLS();

export const recordingDeletions = kairn
  .table("recording_deletions", {
    sourceId: uuid("source_id").primaryKey(),
    assetId: uuid("asset_id").notNull().unique(),
    uploadId: uuid("upload_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    eventId: uuid("event_id").notNull().unique(),
    deletedAtEpoch: bigint("deleted_at_epoch", { mode: "number" }).notNull(),
    purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  })
  .enableRLS();
