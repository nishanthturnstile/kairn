import {
  commandEnvelope,
  uploadPartAcknowledgement,
} from "@kairn/sync-protocol";
import { z } from "zod";
import { createJourney, privateJourney } from "./journeys.ts";

import { gpxBatchLimits, gpxLimits } from "./recording-limits.ts";

export { gpxInspectionVersion, gpxLimits } from "./recording-limits.ts";

export const gpxIssue = z.enum([
  "unsupported_gpx",
  "unsupported_encoding",
  "malformed_xml",
  "xml_declaration_forbidden",
  "byte_limit",
  "depth_limit",
  "track_limit",
  "segment_limit",
  "section_limit",
  "token_limit",
  "point_limit",
  "no_recorded_path",
]);

export const gpxBreak = z.enum([
  "segment_boundary",
  "invalid_coordinates",
  "clock_reversal",
  "long_pause",
  "implausible_jump",
  "user_split",
]);

export const gpxDiagnostics = z.object({
  tracks: z.int().nonnegative(),
  segments: z.int().nonnegative(),
  trackPoints: z.int().nonnegative(),
  invalidCoordinates: z.int().nonnegative(),
  invalidTimestamps: z.int().nonnegative(),
  invalidElevations: z.int().nonnegative(),
  ignoredRoutes: z.int().nonnegative(),
  ignoredWaypoints: z.int().nonnegative(),
});

const finite = z.number();
const metres = finite.nonnegative();

export const recordingMeasurements = z.object({
  sampleCount: z.int().positive(),
  timedSampleCount: z.int().nonnegative(),
  firstInstant: z.iso.datetime().nullable(),
  lastInstant: z.iso.datetime().nullable(),
  distanceMetres: metres.nullable(),
  elapsedSeconds: finite.nonnegative().nullable(),
  elevationMinMetres: finite.nullable(),
  elevationMaxMetres: finite.nullable(),
  elevationGainMetres: metres.nullable().optional(),
});

export const recordingRunSummary = z.object({
  trackIndex: z.int().nonnegative(),
  segmentIndex: z.int().nonnegative(),
  firstPointIndex: z.int().nonnegative(),
  lastPointIndex: z.int().nonnegative(),
  breakBefore: gpxBreak,
  measurements: recordingMeasurements,
});

export const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const beginRecordingUpload = commandEnvelope
  .extend({
    kind: z.literal("gpx"),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[^\p{Cc}/\\]+$/u),
    byteLength: z.int().min(1).max(gpxLimits.bytes),
    sha256: sha256Hex,
    batch: z
      .object({ id: z.uuid(), position: z.int().min(0).max(2_147_483_647) })
      .strict()
      .optional(),
  })
  .strict();

export const recordingUpload = z.object({
  id: z.uuid(),
  state: z.enum(["uploading", "complete", "aborted", "expired", "rejected"]),
  fileName: z.string(),
  byteLength: z.int().positive(),
  sha256: sha256Hex,
  partSize: z.int().positive(),
  expiresAt: z.iso.datetime(),
  parts: z.array(uploadPartAcknowledgement),
  importId: z.uuid().nullable(),
});

export const recordingBatch = z.object({
  id: z.uuid(),
  expiresAt: z.iso.datetime(),
  files: z.array(
    z.object({
      position: z.int().nonnegative(),
      commandId: z.uuid(),
      upload: recordingUpload,
    }),
  ),
});

const batchReviewedFile = z.object({
  id: z.uuid(),
  revision: z.int().positive(),
});

export const recordingBatchReview = z.object({
  title: z.string().min(1).max(120),
  recordedWindow: z
    .object({ start: z.iso.datetime(), end: z.iso.datetime() })
    .nullable(),
  timeZone: z.literal("UTC"),
  measurements: z
    .object({
      distanceMetres: metres.nullable(),
      elapsedSeconds: finite.nonnegative().nullable(),
      elevationGainMetres: metres.nullable().optional(),
      elevationMinMetres: finite.nullable().optional(),
      elevationMaxMetres: finite.nullable().optional(),
    })
    .optional(),
  duplicateReviewConflict: z.boolean().optional(),
  files: z.array(
    batchReviewedFile.extend({
      fileName: z.string(),
      position: z.int().nonnegative(),
      sectionCount: z.int().nonnegative(),
    }),
  ),
  complete: z.boolean(),
});

export const commitRecordingBatch = z.strictObject({
  title: createJourney.shape.title.optional(),
  files: z.array(batchReviewedFile.strict()).min(1).max(gpxBatchLimits.files),
});

export type RecordingBatchReview = z.infer<typeof recordingBatchReview>;
export type CommitRecordingBatch = z.infer<typeof commitRecordingBatch>;

export type BeginRecordingUpload = z.infer<typeof beginRecordingUpload>;
export type RecordingUpload = z.infer<typeof recordingUpload>;
export type RecordingBatch = z.infer<typeof recordingBatch>;
export type GpxIssue = z.infer<typeof gpxIssue>;
export type GpxDiagnostics = z.infer<typeof gpxDiagnostics>;
export type GpxBreak = z.infer<typeof gpxBreak>;
export type RecordingMeasurements = z.infer<typeof recordingMeasurements>;
export type RecordingRunSummary = z.infer<typeof recordingRunSummary>;

export const importStage = z.enum(["queued", "ready", "rejected", "failed"]);
export const recordingImport = z.object({
  id: z.uuid(),
  stage: importStage,
  consumed: z.boolean(),
  fileName: z.string(),
  byteLength: z.int().positive(),
  revision: z.int().positive(),
  diagnostics: gpxDiagnostics.nullable(),
  issue: gpxIssue.nullable(),
  sectionCount: z.int().nonnegative(),
  inspectionVersion: z.int().positive(),
});

export const recordingImportPage = z.object({
  imports: z.array(recordingImport),
  nextCursor: z.uuid().nullable(),
});

export const recordingSection = recordingRunSummary.extend({
  ordinal: z.int().nonnegative(),
  trackName: z.string().nullable(),
  included: z.boolean(),
  invalidTimestamps: z.int().nonnegative(),
  invalidElevations: z.int().nonnegative(),
  splitRuns: z.array(recordingRunSummary).optional(),
  displayTimeZone: z.string().optional(),
});

export const recordingSectionPage = z.object({
  sections: z.array(recordingSection),
  nextCursor: z.int().nonnegative().nullable(),
});

export const recordingSample = z.object({
  index: z.int().nonnegative(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevationMetres: finite.nullable(),
  timestamp: z.string().nullable(),
  invalidTimestamp: z.boolean(),
  invalidElevation: z.boolean(),
  offset: z.string().nullable(),
  instant: z.iso.datetime().nullable(),
});

export const recordingSamplePage = z.object({
  samples: z.array(recordingSample),
  nextCursor: z.int().nonnegative().nullable(),
});

export type RecordingImport = z.infer<typeof recordingImport>;
export type RecordingSection = z.infer<typeof recordingSection>;

const sectionOrdinal = z
  .int()
  .min(0)
  .max(gpxLimits.sections - 1);
const grantRevision = z.int().nonnegative().max(2_147_483_647);
export const recordingClock = z.strictObject({
  shiftMinutes: z.int().min(-1440).max(1440),
  displayTimeZone: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_+/-]{0,79}$/)
    .refine((timeZone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid IANA time zone."),
});
export const recordingSelection = z.strictObject({
  excluded: z.array(sectionOrdinal).max(gpxLimits.sections),
  splits: z
    .array(
      z.strictObject({
        section: sectionOrdinal,
        beforePoint: z
          .int()
          .min(1)
          .max(gpxLimits.points - 1),
      }),
    )
    .max(128),
  clock: recordingClock.optional(),
});
export const updateImportReview = z.strictObject({
  revision: z.int().positive(),
  selection: recordingSelection,
});
export const importReview = updateImportReview.extend({
  summary: z.object({
    sectionCount: z.int().nonnegative(),
    distanceMetres: z.number().nonnegative().nullable(),
    elapsedSeconds: z.number().nonnegative().nullable(),
    recordedWindow: z
      .object({ start: z.iso.datetime(), end: z.iso.datetime() })
      .nullable(),
  }),
});

export const recordingScope = z.enum(["only_me", "journey_review"]);
export const commitRecordingImport = commandEnvelope
  .extend({
    reviewRevision: z.int().positive(),
    destination: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("new"), journey: createJourney }),
      z.strictObject({
        kind: z.literal("existing"),
        journeyId: z.uuid(),
        membershipGeneration: z.uuid(),
        grantRevision,
      }),
    ]),
    scope: recordingScope,
    placeInDraft: z.boolean(),
  })
  .strict();

export const recordingCommit = z.object({
  outcome: z.enum(["created", "added", "already_added"]),
  associationId: z.uuid(),
  recordingId: z.uuid(),
  journeyId: z.uuid().nullable(),
  scope: recordingScope,
  placedInDraft: z.boolean(),
});
export const recordingDestination = privateJourney
  .pick({ id: true, title: true, schedule: true })
  .extend({
    membershipGeneration: z.uuid(),
    canPlace: z.boolean(),
    grantRevision: z.int().nonnegative().nullable(),
  });
export const recordingDestinationPage = z.object({
  journeys: z.array(recordingDestination),
  nextCursor: z.uuid().nullable(),
});

export const journeyRecording = z.object({
  id: z.uuid(),
  sourceId: z.uuid().nullable(),
  fileName: z.string(),
  sectionCount: z.int().nonnegative(),
  scope: recordingScope,
  reviewVersion: z.string(),
  placedInDraft: z.boolean(),
  placementRevision: z.int().positive().nullable(),
  owned: z.boolean(),
});
export const journeyRecordingPage = z.object({
  recordings: z.array(journeyRecording),
  nextCursor: z.uuid().nullable(),
});

export const acceptRecordingReview = z.strictObject({
  token: z.string().regex(/^[0-9a-f]{64}$/),
});
export const recordingPlacementReview = z.object({
  review: acceptRecordingReview
    .extend({
      sectionCount: z.int().nonnegative(),
      clock: recordingClock.nullable(),
    })
    .nullable(),
});

export type RecordingSelection = z.infer<typeof recordingSelection>;
export type CommitRecordingImport = z.infer<typeof commitRecordingImport>;
export type RecordingCommit = z.infer<typeof recordingCommit>;
export type RecordingDestination = z.infer<typeof recordingDestination>;
export type JourneyRecording = z.infer<typeof journeyRecording>;

export const ownerRecording = z.object({
  id: z.uuid(),
  fileName: z.string(),
  byteLength: z.int().positive(),
  stage: importStage,
  diagnostics: gpxDiagnostics.nullable(),
  issue: gpxIssue.nullable(),
  sectionCount: z.int().nonnegative(),
  deletionAvailable: z.boolean(),
  reviewImportId: z.uuid().optional(),
});
export const ownerRecordingPage = z.object({
  recordings: z.array(ownerRecording),
  nextCursor: z.uuid().nullable(),
});
export type OwnerRecording = z.infer<typeof ownerRecording>;

const position = z.tuple([z.number(), z.number().min(-90).max(90)]);
export const recordingOverlay = z.object({
  version: z.literal(1),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  paths: z.array(
    z.object({
      section: z.int().nonnegative(),
      firstPointIndex: z.int().nonnegative(),
      series: z.int().nonnegative().optional(),
      coordinates: z.array(position).min(2),
    }),
  ),
});
export type RecordingOverlay = z.infer<typeof recordingOverlay>;

export const journeyRecordingOverview = recordingOverlay.extend({
  limited: z.boolean(),
});

export const recordingBatchOverlay = recordingOverlay.extend({
  files: z.array(batchReviewedFile),
});
export type RecordingBatchOverlay = z.infer<typeof recordingBatchOverlay>;

export const removeRecording = z.strictObject({
  expectedGrantRevision: grantRevision,
});
export const removedRecording = z.object({
  id: z.uuid(),
  confirmation: z.enum(["confirmed", "pending"]),
});
