import {
  gpxLimits,
  recordingFileName,
} from "@kairn/contracts/recording-limits";
import type { RecordingUpload } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { CryptoDigestAlgorithm, digest, randomUUID } from "expo-crypto";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { getNetworkStateAsync } from "expo-network";
import { Platform } from "react-native";
import { ensureActive } from "./api";
import { JourneyRequestError, journeyResult } from "./journey-api";
import { useMobileSession } from "./mobile-session";
import type { VerifiedMobileScope } from "./session";
import {
  copyingRecordings,
  type MobileRecordingDraft,
  replaceRecordingSelection,
  withRecordingWorkspace,
} from "./storage/recording-import";

export const mobileRecordingImportsKey = ["recording-imports"] as const;
export const mobileRecordingDraftKey = ["recording-draft"] as const;

export function useRecordingImports(
  scope: VerifiedMobileScope,
  enabled = true,
) {
  const { refresh } = useMobileSession();
  return useQuery({
    queryKey: mobileRecordingImportsKey,
    enabled,
    queryFn: async ({ signal }) => {
      const response = await scope.api.GET("/api/v1/imports", { signal });
      if (response.response.status === 503) return null;
      return journeyResult(response, scope, refresh);
    },
    staleTime: 15_000,
  });
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

export const recordingSize = (bytes: number) =>
  bytes >= 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;

export function clearExpiredRecordingExports() {
  const oldest = Date.now() - 15 * 60 * 1000;
  for (const entry of Paths.cache.list()) {
    if (!(entry instanceof Directory)) continue;
    const timestamp = /^recording-export-(\d+)-/.exec(entry.name)?.[1];
    if (timestamp && Number(timestamp) < oldest) entry.delete();
  }
}

export async function shareOriginalRecording(
  scope: VerifiedMobileScope,
  {
    id,
    fileName,
    byteLength,
  }: { id: string; fileName: string; byteLength: number },
  refresh: (scope: VerifiedMobileScope) => void,
  signal: AbortSignal,
) {
  const sharing = await import("expo-sharing");
  if (!(await sharing.isAvailableAsync()))
    throw new Error("File sharing unavailable");
  ensureActive(scope.signal);
  ensureActive(signal);
  clearExpiredRecordingExports();
  if (byteLength > Paths.availableDiskSpace)
    throw new Error("Insufficient temporary storage");
  const directory = new Directory(
    Paths.cache,
    `recording-export-${Date.now()}-${randomUUID()}`,
  );
  const base = Array.from(recordingFileName(fileName).replace(/\.gpx$/i, ""))
    .slice(0, 50)
    .join("");
  const file = new File(directory, `${base || "Recording"}.gpx`);
  let preserveForReceiver = false;
  try {
    directory.create();
    file.create();
    const handle = file.open(FileMode.WriteOnly);
    try {
      for (let start = 0; start < byteLength; start += gpxLimits.partBytes) {
        const end = Math.min(start + gpxLimits.partBytes, byteLength) - 1;
        const result = await scope.api.GET(
          "/api/v1/account/recordings/{id}/original",
          {
            params: {
              path: { id },
              header: { range: `bytes=${start}-${end}` },
            },
            parseAs: "arrayBuffer",
            signal,
          },
        );
        const bytes = journeyResult(result, scope, refresh);
        if (
          result.response.status !== 206 ||
          bytes.byteLength !== end - start + 1 ||
          result.response.headers.get("Content-Range") !==
            `bytes ${start}-${end}/${byteLength}`
        ) {
          throw new Error("Recording download was incomplete");
        }
        await handle.writeBytes(new Uint8Array(bytes));
      }
    } finally {
      handle.close();
    }
    ensureActive(scope.signal);
    ensureActive(signal);
    await sharing.shareAsync(file.uri, {
      mimeType: "application/gpx+xml",
      UTI: "public.xml",
    });
    // Android returns a content URI whose receiver may open the file later.
    preserveForReceiver = Platform.OS === "android";
  } finally {
    if (!preserveForReceiver && directory.exists) directory.delete();
  }
}

export async function pickRecording(
  scope: VerifiedMobileScope,
  current: MobileRecordingDraft,
  journeyId: string | undefined,
  signal: AbortSignal,
) {
  const picked = await File.pickFileAsync();
  if (picked.canceled) return undefined;
  const file = picked.result;
  ensureActive(signal);
  const size = file.size;
  if (!size) throw new Error("Choose a file that contains a recording.");
  if (size > gpxLimits.bytes)
    throw new Error("Choose a GPX file up to 50 MiB.");
  if (size > Paths.availableDiskSpace)
    throw new Error(
      "Free some space on this device and choose the recording again.",
    );

  return withRecordingWorkspace(scope, async (workspace) => {
    const fileId = randomUUID();
    const target = workspace.originalFile(fileId);
    copyingRecordings.add(fileId);
    try {
      await workspace.beginRecordingCopy(fileId);
      await file.copy(target);
      ensureActive(signal);
      ensureActive(scope.signal);
      if (target.size !== size)
        throw new Error("The selected file could not be read completely.");
      const sha256 = (await target.digest("SHA-256")).toLowerCase();
      ensureActive(scope.signal);
      ensureActive(signal);
      const replacingPart = Boolean(current.uploadId && !current.importId);
      if (replacingPart && current.input?.sha256 !== sha256)
        throw new Error(
          "Choose the original file or cancel the earlier upload before continuing.",
        );
      const updated: MobileRecordingDraft = replacingPart
        ? { ...current, fileId, journeyId }
        : {
            fileId,
            journeyId,
            input: {
              protocolVersion: 1,
              kind: "gpx",
              deviceId: randomUUID(),
              commandId: randomUUID(),
              fileName: recordingFileName(file.name.split(/[:/]/).at(-1) ?? ""),
              byteLength: size,
              sha256,
            },
          };
      await replaceRecordingSelection(workspace, current, updated, {
        keep: fileId,
        release: current.importId ? undefined : current.fileId,
      });
      return updated;
    } catch (error) {
      if (target.exists) target.delete();
      await workspace.forgetRecordingCopy(fileId);
      throw error;
    } finally {
      copyingRecordings.delete(fileId);
    }
  });
}

export async function uploadRecording(
  scope: VerifiedMobileScope,
  initial: MobileRecordingDraft,
  signal: AbortSignal,
  wifiOnly: boolean,
  refresh: (scope: VerifiedMobileScope) => void,
  update: (draft: MobileRecordingDraft, receipt?: RecordingUpload) => void,
  transfer?: {
    verifiedDigest: string;
    persist: (
      workspace: Parameters<typeof replaceRecordingSelection>[0],
      next: MobileRecordingDraft,
      receipt?: RecordingUpload,
    ) => Promise<void>;
  },
) {
  return withRecordingWorkspace(scope, async (workspace) => {
    async function checkConnection() {
      ensureActive(scope.signal);
      ensureActive(signal);
      if (wifiOnly && (await getNetworkStateAsync()).type !== "WIFI")
        throw new RecordingConnectionError();
    }
    await checkConnection();
    let draft = initial;
    async function persist(
      next: MobileRecordingDraft,
      receipt?: RecordingUpload,
    ) {
      ensureActive(scope.signal);
      ensureActive(signal);
      if (transfer) await transfer.persist(workspace, next, receipt);
      else await replaceRecordingSelection(workspace, draft, next);
      draft = next;
      update(next, receipt);
    }
    if (!draft.input || !draft.fileId)
      throw new Error("Select a GPX file first.");
    const file = workspace.originalFile(draft.fileId);
    const input = draft.input;
    if (
      !file.exists ||
      file.size !== input.byteLength ||
      (transfer?.verifiedDigest ??
        (await file.digest("SHA-256")).toLowerCase()) !== input.sha256
    )
      throw new Error("Choose the original GPX again to resume this upload.");
    ensureActive(signal);
    let receipt = draft.uploadId
      ? journeyResult(
          await scope.api.GET("/api/v1/uploads/{id}", {
            params: { path: { id: draft.uploadId } },
            signal,
          }),
          scope,
          refresh,
        )
      : journeyResult(
          await scope.api.POST("/api/v1/uploads", { body: input, signal }),
          scope,
          refresh,
        );
    if (receipt.state === "expired" && !input.batch) {
      const next = { ...input, commandId: randomUUID() };
      await persist({ ...draft, input: next, uploadId: undefined });
      receipt = journeyResult(
        await scope.api.POST("/api/v1/uploads", { body: next, signal }),
        scope,
        refresh,
      );
    }
    if (
      input.batch &&
      (receipt.state === "expired" || receipt.state === "aborted") &&
      Date.parse(receipt.expiresAt) <= Date.now()
    ) {
      await persist({ ...draft, uploadId: receipt.id }, receipt);
      throw new Error(
        "This recording draft expired. Upload it again to start a new review.",
      );
    }
    if (receipt.state !== "uploading" && receipt.state !== "complete")
      throw new Error(
        "This upload has closed. Cancel it and select another file.",
      );
    await persist({ ...draft, uploadId: receipt.id }, receipt);
    if (!receipt.importId) {
      const sent = new Set(receipt.parts.map((part) => part.partNumber));
      const partSize = receipt.partSize;
      const handle = file.open();
      try {
        for (
          let offset = 0, partNumber = 1;
          offset < input.byteLength;
          offset += partSize, partNumber++
        ) {
          if (sent.has(partNumber)) continue;
          await checkConnection();
          const expected = Math.min(partSize, input.byteLength - offset);
          handle.offset = offset;
          const bytes = await handle.readBytes(expected);
          if (bytes.length !== expected)
            throw new Error("The selected file changed. Choose it again.");
          const sha256 = hex(await digest(CryptoDigestAlgorithm.SHA256, bytes));
          receipt = journeyResult(
            await scope.api.PUT("/api/v1/uploads/{id}/parts/{partNumber}", {
              params: {
                path: { id: receipt.id, partNumber },
                header: {
                  "content-length": String(expected),
                  "x-part-sha256": sha256,
                },
              },
              headers: { "Content-Type": "application/octet-stream" },
              body: "",
              bodySerializer: () => bytes,
              signal,
            }),
            scope,
            refresh,
          );
          ensureActive(signal);
          ensureActive(scope.signal);
          update(draft, receipt);
        }
      } finally {
        handle.close();
      }
      await checkConnection();
      receipt = journeyResult(
        await scope.api.POST("/api/v1/uploads/{id}/complete", {
          params: { path: { id: receipt.id } },
          signal,
        }),
        scope,
        refresh,
      );
    }
    if (!receipt.importId)
      throw new Error("The uploaded bytes didn’t match the selected file.");
    await persist({ ...draft, importId: receipt.importId }, receipt);
  });
}

class RecordingConnectionError extends Error {}

export function recordingRequestMessage(error: unknown, fallback: string) {
  if (error instanceof RecordingConnectionError)
    return "Waiting for Wi-Fi. Confirmed parts will be kept.";
  if (error instanceof JourneyRequestError) {
    if (error.status === 429)
      return "The upload limit was reached. Wait a minute, then try again.";
    return fallback;
  }
  return fallback;
}
