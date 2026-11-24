import { createdJourney } from "@kairn/contracts/journeys";
import { recordingFileName } from "@kairn/contracts/recording-limits";
import {
  type CommitRecordingBatch,
  type RecordingUpload,
  recordingBatch,
  recordingBatchOverlay,
  recordingBatchReview,
  recordingUpload,
} from "@kairn/contracts/recordings";
import { journeyResult } from "./journey-api";
import { recordingDigest, sendRecordingPart } from "./recording-api";
import type { AccountScope } from "./session";

export function readBatchReview(
  scope: AccountScope,
  refresh: (scope: AccountScope) => void,
  id: string,
  signal: AbortSignal,
) {
  return scope.api
    .GET("/api/v1/recording-batches/{id}/review", {
      params: { path: { id } },
      signal,
    })
    .then((result) =>
      recordingBatchReview.parse(journeyResult(result, scope, refresh)),
    );
}

export function readBatchOverlay(
  scope: AccountScope,
  refresh: (scope: AccountScope) => void,
  id: string,
  signal: AbortSignal,
) {
  return scope.api
    .GET("/api/v1/recording-batches/{id}/overlay", {
      params: { path: { id } },
      signal,
    })
    .then((result) =>
      recordingBatchOverlay.parse(journeyResult(result, scope, refresh)),
    );
}

export function commitBatch(
  scope: AccountScope,
  refresh: (scope: AccountScope) => void,
  id: string,
  body: CommitRecordingBatch,
  signal: AbortSignal,
) {
  return scope.api
    .POST("/api/v1/recording-batches/{id}/commit", {
      params: { path: { id } },
      body,
      signal,
    })
    .then((result) =>
      createdJourney.parse(journeyResult(result, scope, refresh)),
    );
}

export function batchFileName(name: string) {
  const cleaned = recordingFileName(name);
  return /\.gpx$/i.test(cleaned)
    ? cleaned
    : `${recordingFileName(name.slice(0, -4).slice(0, 250))}.gpx`;
}

export async function readBatch(
  scope: AccountScope,
  refresh: (scope: AccountScope) => void,
  id: string,
  signal: AbortSignal,
) {
  const result = await scope.api.GET("/api/v1/recording-batches/{id}", {
    params: { path: { id } },
    signal,
  });
  if (result.response.status === 404) return null;
  return recordingBatch.parse(journeyResult(result, scope, refresh));
}

export async function sendBatchFile({
  scope,
  refresh,
  batchId,
  position,
  commandId,
  existing,
  file,
  signal,
  onProgress,
}: {
  scope: AccountScope;
  refresh: (scope: AccountScope) => void;
  batchId: string;
  position: number;
  commandId: string;
  existing?: RecordingUpload;
  file: File;
  signal: AbortSignal;
  onProgress: (upload: RecordingUpload) => void;
}) {
  const sha256 = await recordingDigest(file);
  signal.throwIfAborted();
  let upload: RecordingUpload;
  if (existing) {
    if (existing.sha256 !== sha256 || existing.byteLength !== file.size)
      throw new Error("Choose the original GPX file to resume this upload.");
    const status = await scope.api.GET("/api/v1/uploads/{id}", {
      params: { path: { id: existing.id } },
      signal,
    });
    upload = recordingUpload.parse(journeyResult(status, scope, refresh));
  } else {
    const result = await scope.api.POST("/api/v1/uploads", {
      body: {
        protocolVersion: 1,
        deviceId: batchId,
        commandId,
        kind: "gpx",
        fileName: batchFileName(file.name),
        byteLength: file.size,
        sha256,
        batch: { id: batchId, position },
      },
      signal,
    });
    upload = recordingUpload.parse(journeyResult(result, scope, refresh));
  }
  onProgress(upload);
  if (upload.state !== "uploading") return upload;
  const acknowledged = new Set(upload.parts.map((part) => part.partNumber));
  for (
    let offset = 0, part = 1;
    offset < file.size;
    offset += upload.partSize, part++
  ) {
    if (acknowledged.has(part)) continue;
    signal.throwIfAborted();
    upload = await sendRecordingPart(
      scope,
      upload.id,
      part,
      file.slice(offset, offset + upload.partSize),
      signal,
      refresh,
    );
    onProgress(upload);
  }
  const completed = await scope.api.POST("/api/v1/uploads/{id}/complete", {
    params: { path: { id: upload.id } },
    signal,
  });
  upload = recordingUpload.parse(journeyResult(completed, scope, refresh));
  onProgress(upload);
  return upload;
}
