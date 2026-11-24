import {
  type RecordingUpload,
  recordingBatch,
} from "@kairn/contracts/recordings";
import { getDocumentAsync } from "expo-document-picker";
import { File } from "expo-file-system";
import { ensureActive } from "./api";
import { journeyResult } from "./journey-api";
import { uploadRecording } from "./recording-api";
import type { VerifiedMobileScope } from "./session";
import {
  type NativeBatch,
  type NativeBatchFile,
  type PickedBatchFile,
  replaceNativeBatch,
  saveNativeBatch,
} from "./storage/recording-batch";
import { withRecordingWorkspace } from "./storage/recording-import";

type Refresh = (scope: VerifiedMobileScope) => void;

export async function pickNativeBatchFiles(
  multiple: boolean,
): Promise<PickedBatchFile[]> {
  const result = await getDocumentAsync({
    multiple,
    copyToCacheDirectory: false,
  });
  return result.canceled
    ? []
    : result.assets.map(({ uri, name, size }) => ({
        file: new File(uri),
        name,
        size: size ?? undefined,
      }));
}

export async function uploadNativeBatchFile({
  scope,
  current,
  file,
  wifiOnly,
  signal,
  refresh,
  update,
  progress,
}: {
  scope: VerifiedMobileScope;
  current: NativeBatch;
  file: NativeBatchFile;
  wifiOnly: boolean;
  signal: AbortSignal;
  refresh: Refresh;
  update: (batch: NativeBatch) => void;
  progress: (receipt: RecordingUpload) => void;
}) {
  let draft = current;
  const sha256 = await withRecordingWorkspace(scope, async (workspace) => {
    const copy = workspace.originalFile(file.copyId);
    if (!copy.exists || copy.size !== file.bytes)
      throw new Error("Choose the original recording again.");
    return (await copy.digest("SHA-256")).toLowerCase();
  });
  ensureActive(signal);
  ensureActive(scope.signal);
  if (file.input && file.input.sha256 !== sha256)
    throw new Error("Choose the original recording again.");

  const input = file.input ?? {
    protocolVersion: 1 as const,
    kind: "gpx" as const,
    deviceId: current.id,
    commandId: file.id,
    batch: { id: current.id, position: file.position },
    fileName: file.name,
    byteLength: file.bytes,
    sha256,
  };
  if (!file.input) {
    const prepared = await saveNativeBatch(scope, draft, {
      ...draft,
      files: draft.files.map((entry) =>
        entry.id === file.id ? { ...entry, input } : entry,
      ),
    });
    if (!prepared) throw new Error("Couldn’t save the recording draft.");
    draft = prepared;
    update(draft);
  }

  await uploadRecording(
    scope,
    { fileId: file.copyId, input, uploadId: file.uploadId },
    signal,
    wifiOnly,
    refresh,
    (_next, receipt) => {
      if (receipt) progress(receipt);
    },
    {
      verifiedDigest: sha256,
      async persist(workspace, next, receipt) {
        const updated = await replaceNativeBatch(workspace, draft, {
          ...draft,
          expiresAt: receipt?.expiresAt ?? draft.expiresAt,
          files: draft.files.map((entry) =>
            entry.id === file.id
              ? {
                  ...entry,
                  uploadId: next.uploadId,
                  importId: next.importId,
                }
              : entry,
          ),
        });
        if (!updated)
          throw new Error("Couldn’t save the upload acknowledgement.");
        draft = updated;
        update(draft);
      },
    },
  );
}

export async function removeNativeBatchFile(
  scope: VerifiedMobileScope,
  current: NativeBatch,
  file: NativeBatchFile,
  refresh: Refresh,
  signal: AbortSignal,
) {
  let uploadId = file.uploadId;
  if (!uploadId && file.input) {
    const result = await scope.api.GET("/api/v1/recording-batches/{id}", {
      params: { path: { id: current.id } },
      signal,
    });
    if (result.response.status !== 404) {
      uploadId = recordingBatch
        .parse(journeyResult(result, scope, refresh))
        .files.find((entry) => entry.commandId === file.id)?.upload.id;
    }
  }
  if (uploadId) {
    const result = await scope.api.DELETE("/api/v1/uploads/{id}", {
      params: { path: { id: uploadId } },
      signal,
    });
    if (result.response.status !== 404) journeyResult(result, scope, refresh);
  }
  ensureActive(signal);
  return saveNativeBatch(
    scope,
    current,
    {
      ...current,
      files: current.files.filter(({ id }) => id !== file.id),
    },
    [file.copyId],
  );
}
