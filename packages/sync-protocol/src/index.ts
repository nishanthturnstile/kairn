import { z } from "zod";

export const syncProtocolVersion = 1 as const;
const protocolVersion = z.literal(syncProtocolVersion);
const revision = z.int().positive();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const commandEnvelope = z.object({
  protocolVersion,
  commandId: z.uuid(),
  deviceId: z.uuid(),
});

export const revisionedCommand = commandEnvelope.extend({
  expectedRevision: revision,
});

export const revisionConflict = z.object({
  protocolVersion,
  commandId: z.uuid(),
  conflictId: z.uuid(),
  expectedRevision: revision,
  currentRevision: revision,
});

const cursor = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9._~-]+$/);

export const cursorQuery = z.object({
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const cursorPage = z.object({ nextCursor: cursor.nullable() });

export const uploadPartAcknowledgement = z.object({
  protocolVersion,
  uploadId: z.uuid(),
  partNumber: z.int().min(1).max(10_000),
  byteLength: z
    .int()
    .min(1)
    .max(5 * 1024 ** 3),
  sha256,
});

export const uploadCompletionAcknowledgement = z.object({
  protocolVersion,
  uploadId: z.uuid(),
  assetId: z.uuid(),
  byteLength: z.int().positive(),
  sha256,
});

const tombstone = z.object({
  protocolVersion,
  reason: z.enum(["deleted", "access_revoked"]),
  policyGeneration: revision,
});

export const syncTombstone = z.discriminatedUnion("resource", [
  tombstone.extend({
    resource: z.enum(["journey", "source", "asset"]),
    id: z.uuid(),
  }),
  tombstone.extend({ resource: z.literal("membership"), journeyId: z.uuid() }),
]);
