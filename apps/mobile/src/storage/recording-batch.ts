import {
  gpxBatchLimits,
  gpxLimits,
  recordingFileName,
} from "@kairn/contracts/recording-limits";
import {
  beginRecordingUpload,
  commitRecordingBatch,
} from "@kairn/contracts/recordings";
import { randomUUID } from "expo-crypto";
import { type File, Paths } from "expo-file-system";
import { z } from "zod";
import { ensureActive } from "../api";
import type { VerifiedMobileScope } from "../session";
import {
  copyingRecordings,
  recoverRecordingCopies,
  removeReleasedCopy,
  withRecordingWorkspace,
} from "./recording-import";
import type { openAccountWorkspace } from "./workspace";

const batchDraftKey = "792ca6ff-8ba3-4875-a890-ae95a3637576";
const batchFile = z.object({
  id: z.uuid(),
  copyId: z.uuid(),
  position: z.int().nonnegative(),
  name: z.string(),
  bytes: z.int().min(1).max(gpxLimits.bytes),
  input: beginRecordingUpload.optional(),
  uploadId: z.uuid().optional(),
  importId: z.uuid().optional(),
});
const batchDraft = z.object({
  id: z.uuid(),
  revision: z.uuid(),
  expiresAt: z.iso.datetime().optional(),
  nextPosition: z.int().nonnegative(),
  files: z.array(batchFile).max(gpxBatchLimits.files),
  attempt: commitRecordingBatch.optional(),
});
export type NativeBatch = z.infer<typeof batchDraft>;
export type NativeBatchFile = z.infer<typeof batchFile>;
export type PickedBatchFile = { file: File; name: string; size?: number };
type Workspace = Awaited<ReturnType<typeof openAccountWorkspace>>;

export function readNativeBatch(scope: VerifiedMobileScope) {
  return withRecordingWorkspace(scope, async (workspace) => {
    await recoverRecordingCopies(workspace);
    const row = await workspace.getDraft(batchDraftKey);
    ensureActive(scope.signal);
    return row ? batchDraft.parse(JSON.parse(row.text)) : undefined;
  });
}

export async function replaceNativeBatch(
  workspace: Workspace,
  current: NativeBatch | undefined,
  next: NativeBatch | undefined,
  copies: { keep?: string; release?: readonly string[] } = {},
) {
  const updated = next && { ...next, revision: randomUUID() };
  await workspace.updateRecordingDraft(
    batchDraftKey,
    (stored) => {
      const revision = stored
        ? batchDraft.parse(JSON.parse(stored)).revision
        : undefined;
      if (revision !== current?.revision)
        throw new Error(
          "The recording draft changed. Open it again to continue.",
        );
      return updated && JSON.stringify(updated);
    },
    copies,
  );
  for (const id of copies.release ?? [])
    await removeReleasedCopy(workspace, id);
  return updated;
}

export function saveNativeBatch(
  scope: VerifiedMobileScope,
  current: NativeBatch,
  next: NativeBatch | undefined,
  release?: readonly string[],
) {
  return withRecordingWorkspace(scope, (workspace) =>
    replaceNativeBatch(workspace, current, next, { release }),
  );
}

export async function copyNativeBatchFile(
  scope: VerifiedMobileScope,
  current: NativeBatch | undefined,
  picked: PickedBatchFile,
  signal: AbortSignal,
  replacing?: NativeBatchFile,
) {
  const { file } = picked;
  const selected = picked.name;
  if (!/\.gpx$/i.test(selected)) throw new Error("Choose a .gpx file.");
  const cleanName = recordingFileName(selected);
  const name = /\.gpx$/i.test(cleanName)
    ? cleanName
    : `${recordingFileName(selected.slice(0, -4).slice(0, 250))}.gpx`;
  // Some content providers omit size. Statting their URI can read the whole
  // file synchronously, before the size limit can be enforced.
  const bytes = picked.size;
  if (bytes === undefined)
    throw new Error("Save the file to this device, then choose it again.");
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new Error("The file is empty or unavailable.");
  if (bytes > gpxLimits.bytes)
    throw new Error("A GPX file can be up to 50 MiB.");
  if (
    replacing &&
    (bytes !== replacing.bytes || (!replacing.input && name !== replacing.name))
  )
    throw new Error("Choose a copy of the original recording.");
  if (!replacing && current) {
    if (current.files.length >= gpxBatchLimits.files)
      throw new Error(`Choose up to ${gpxBatchLimits.files} files.`);
    if (
      current.files.reduce((total, entry) => total + entry.bytes, bytes) >
      gpxBatchLimits.bytes
    )
      throw new Error("Choose up to 200 MiB of recordings.");
  }
  if (bytes > Paths.availableDiskSpace)
    throw new Error("Free space on this device and choose the file again.");

  return withRecordingWorkspace(scope, async (workspace) => {
    const copyId = randomUUID();
    const copy = workspace.originalFile(copyId);
    copyingRecordings.add(copyId);
    let saved = false;
    try {
      await workspace.beginRecordingCopy(copyId);
      await file.copy(copy);
      ensureActive(scope.signal);
      ensureActive(signal);
      if (copy.size !== bytes)
        throw new Error("The selected file could not be read completely.");
      if (replacing?.input) {
        const sha256 = (await copy.digest("SHA-256")).toLowerCase();
        ensureActive(scope.signal);
        ensureActive(signal);
        if (sha256 !== replacing.input.sha256)
          throw new Error("Choose a copy of the original recording.");
      }

      const next = current ?? {
        id: randomUUID(),
        revision: randomUUID(),
        nextPosition: 0,
        files: [],
      };
      const input = replacing
        ? {
            ...next,
            files: next.files.map((entry) =>
              entry.id === replacing.id ? { ...entry, copyId } : entry,
            ),
          }
        : {
            ...next,
            nextPosition: next.nextPosition + 1,
            files: [
              ...next.files,
              {
                id: randomUUID(),
                copyId,
                position: next.nextPosition,
                bytes,
                name,
              },
            ],
          };
      const result = await replaceNativeBatch(workspace, current, input, {
        keep: copyId,
        release: replacing ? [replacing.copyId] : undefined,
      });
      saved = true;
      if (!result) throw new Error("The recording draft could not be saved.");
      return result;
    } finally {
      if (!saved) await removeReleasedCopy(workspace, copyId);
      copyingRecordings.delete(copyId);
    }
  });
}
