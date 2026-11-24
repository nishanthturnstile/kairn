import { gpxLimits } from "@kairn/contracts/recording-limits";
import type { RecordingUpload } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { JourneyRequestError, journeyResult } from "./journey-api";
import type { AccountScope } from "./session";
import { useSessionAccess } from "./session-access";

export const journeyRouteKey = (scope: AccountScope, journeyId: string) =>
  [scope.accountId, "journey-route", journeyId] as const;

export const importsKey = (scope: AccountScope) => [
  scope.accountId,
  "recording-imports",
];

export function useRecordingImports(scope: AccountScope, enabled = true) {
  const { refresh } = useSessionAccess();
  return useQuery({
    queryKey: importsKey(scope),
    enabled: enabled && Boolean(scope.accountId),
    queryFn: async ({ signal }) => {
      const response = await scope.api.GET("/api/v1/imports", { signal });
      if (response.response.status === 503) return null;
      return journeyResult(response, scope, refresh);
    },
  });
}

export async function recordingDigest(blob: Blob | ArrayBuffer) {
  const bytes = blob instanceof Blob ? await blob.arrayBuffer() : blob;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function recordingSize(bytes: number) {
  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  });
  return bytes >= 1024 ** 2
    ? `${formatter.format(bytes / 1024 ** 2)} MiB`
    : `${formatter.format(bytes / 1024)} KiB`;
}

export const maxRecordingSize = recordingSize(gpxLimits.bytes);

export async function sendRecordingPart(
  scope: AccountScope,
  uploadId: string,
  partNumber: number,
  blob: Blob,
  signal: AbortSignal,
  refresh: (scope: AccountScope) => void,
): Promise<RecordingUpload> {
  const hash = await recordingDigest(blob);
  signal.throwIfAborted();
  const response = await fetch(
    `/api/v1/uploads/${uploadId}/parts/${partNumber}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Part-Sha256": hash,
        "X-Expected-Account": scope.accountId ?? "",
      },
      body: blob,
      signal,
      cache: "no-store",
      redirect: "error",
    },
  );
  const body = await response.json();
  if (response.ok) return body;
  if (response.status === 401 || body.code === "account_changed")
    refresh(scope);
  throw new JourneyRequestError(response.status, [], body.code);
}
