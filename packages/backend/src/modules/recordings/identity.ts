import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../db/index.js";

function recordingUuid(
  ownerId: string,
  sha256: string,
  size: number,
  kind: "source" | "asset",
) {
  const bytes = createHash("sha256")
    .update(JSON.stringify(["recording-v1", kind, ownerId, sha256, size]))
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const id = bytes.subarray(0, 16).toString("hex");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export function recordingIdentity(
  ownerId: string,
  expected: { sha256: string; byteLength: number },
) {
  return {
    sourceId: recordingUuid(
      ownerId,
      expected.sha256,
      expected.byteLength,
      "source",
    ),
    assetId: recordingUuid(
      ownerId,
      expected.sha256,
      expected.byteLength,
      "asset",
    ),
  };
}

export async function recordingUploadDenied(
  tx: DatabaseTransaction,
  sourceId: string,
) {
  const result = await tx.execute<{ denied: boolean }>(sql`
    select kairn.recording_upload_denied(${sourceId}::uuid) as denied
  `);
  return result.rows[0].denied;
}
