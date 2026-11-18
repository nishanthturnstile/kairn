import { z } from "zod";

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

export const apiProblem = z.object({
  type: z.literal("about:blank"),
  title: z.string(),
  status: z.int().min(400).max(599),
  code: z.enum([
    "invalid_request",
    "not_found",
    "service_unavailable",
    "internal_error",
  ]),
  requestId,
});

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
