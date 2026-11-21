import { z } from "zod";
import { journeyInputIssue } from "./journeys.js";

export {
  commandEnvelope,
  cursorPage,
  cursorQuery,
  revisionConflict,
  revisionedCommand,
  syncProtocolVersion,
  syncTombstone,
  uploadCompletionAcknowledgement,
  uploadPartAcknowledgement,
} from "@kairn/sync-protocol";

export const requestId = z.uuidv4();

export const apiProblemCode = z.enum([
  "invalid_request",
  "unauthorized",
  "origin_rejected",
  "not_found",
  "idempotency_conflict",
  "account_changed",
  "checkpoint_changed",
  "request_too_large",
  "unsupported_media_type",
  "service_unavailable",
  "internal_error",
]);

export const apiProblem = z
  .object({
    type: z.literal("about:blank"),
    title: z.string(),
    status: z.int().min(400).max(599),
    code: apiProblemCode,
    requestId,
    issues: z.array(journeyInputIssue).optional(),
  })
  .meta({ id: "ApiProblem" });

export type ApiProblemCode = z.infer<typeof apiProblemCode>;

export const health = z.object({ status: z.literal("ok") });
export const readiness = z.object({ status: z.literal("ready") });

export const protocolQuery = z.object({
  version: z
    .string()
    .regex(/^[1-9]\d{0,5}$/)
    .optional(),
});

export const protocol = z.object({
  minimumVersion: z.int().positive(),
  currentVersion: z.int().positive(),
  supported: z.boolean(),
});
export {
  accountProfile,
  advanceOnboarding,
  onboardingProgress,
  updateProfile,
} from "./identity.js";
