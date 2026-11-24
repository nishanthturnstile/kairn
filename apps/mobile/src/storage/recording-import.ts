import {
  type BeginRecordingUpload,
  beginRecordingUpload,
  type CommitRecordingImport,
  commitRecordingImport,
} from "@kairn/contracts/recordings";
import { z } from "zod";
import { ensureActive } from "../api";
import type { VerifiedMobileScope } from "../session";
import { openAccountWorkspace } from "./workspace";

export const recordingDraftId = "8427e0d4-d629-4cce-8cf4-9af18a4e5131";

export const copyingRecordings = new Set<string>();
const wifiPreferenceId = "517fde79-da72-4782-9f89-1b6c7131611b";

const saved = z.object({
  fileId: z.uuid().optional(),
  input: beginRecordingUpload.optional(),
  uploadId: z.uuid().optional(),
  importId: z.uuid().optional(),
  journeyId: z.uuid().optional(),
});

export interface MobileRecordingDraft {
  fileId?: string;
  input?: BeginRecordingUpload;
  uploadId?: string;
  importId?: string;
  journeyId?: string;
}

export class CorruptRecordingSelection extends Error {
  constructor(
    readonly text: string,
    readonly fileToRelease?: string,
  ) {
    super("The saved recording selection is damaged.");
  }
}

export class RecordingSelectionChanged extends Error {}

function parseRecordingSelection(text: string): MobileRecordingDraft {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CorruptRecordingSelection(text);
  }
  const result = saved.safeParse(value);
  if (result.success) return result.data;
  const recoverable = z
    .object({ fileId: z.uuid(), importId: z.undefined() })
    .safeParse(value);
  throw new CorruptRecordingSelection(text, recoverable.data?.fileId);
}

export async function withRecordingWorkspace<T>(
  scope: VerifiedMobileScope,
  action: (db: Awaited<ReturnType<typeof openAccountWorkspace>>) => Promise<T>,
) {
  ensureActive(scope.signal);
  const workspace = await openAccountWorkspace(scope.accountId);
  try {
    ensureActive(scope.signal);
    return await action(workspace);
  } finally {
    await workspace.close();
  }
}

export async function readRecordingDraft(scope: VerifiedMobileScope) {
  return withRecordingWorkspace(scope, async (workspace) => {
    await recoverRecordingCopies(workspace);
    const stored = await workspace.getDraft(recordingDraftId);
    return stored ? parseRecordingSelection(stored.text) : {};
  });
}

export async function recoverRecordingCopies(
  workspace: Awaited<ReturnType<typeof openAccountWorkspace>>,
) {
  for (const { id } of await workspace.incompleteRecordingCopies()) {
    if (!copyingRecordings.has(id)) await removeReleasedCopy(workspace, id);
  }
}

export async function replaceRecordingSelection(
  workspace: Awaited<ReturnType<typeof openAccountWorkspace>>,
  expected: MobileRecordingDraft,
  next?: MobileRecordingDraft,
  copies: { keep?: string; release?: string } = {},
) {
  await workspace.updateRecordingDraft(
    recordingDraftId,
    (previous) => {
      const current = previous ? parseRecordingSelection(previous) : {};
      if (JSON.stringify(current) !== JSON.stringify(saved.parse(expected)))
        throw new RecordingSelectionChanged(
          "The saved recording selection changed. Open it again to continue.",
        );
      return next === undefined ? undefined : JSON.stringify(next);
    },
    copies,
  );
  if (copies.release) await removeReleasedCopy(workspace, copies.release);
}

export async function removeReleasedCopy(
  workspace: Awaited<ReturnType<typeof openAccountWorkspace>>,
  id: string,
) {
  try {
    const file = workspace.originalFile(id);
    if (file.exists) file.delete();
    await workspace.forgetRecordingCopy(id);
  } catch {
    // The workspace will retry the release when it next opens.
  }
}

export function saveRecordingDraft(
  scope: VerifiedMobileScope,
  expected: MobileRecordingDraft,
  next?: MobileRecordingDraft,
) {
  return withRecordingWorkspace(scope, (workspace) =>
    replaceRecordingSelection(workspace, expected, next),
  );
}

export function recordingWifiOnly(scope: VerifiedMobileScope, next?: boolean) {
  return withRecordingWorkspace(scope, async (workspace) => {
    if (next !== undefined)
      await workspace.saveDraft(wifiPreferenceId, next ? "1" : "0");
    return (await workspace.getDraft(wifiPreferenceId))?.text === "1";
  });
}

export function readRecordingCommand(
  scope: VerifiedMobileScope,
  importId: string,
) {
  return withRecordingWorkspace(scope, async (workspace) => {
    const stored = await workspace.getDraft(importId);
    return stored ? commitRecordingImport.parse(JSON.parse(stored.text)) : null;
  });
}

export function claimRecordingCommand(
  scope: VerifiedMobileScope,
  importId: string,
  command?: CommitRecordingImport,
) {
  return withRecordingWorkspace(scope, async (workspace) => {
    if (!command) {
      await workspace.deleteDraft(importId);
      return undefined;
    }
    const stored = await workspace.claimDraft(
      importId,
      JSON.stringify(command),
    );
    if (!stored) throw new Error("Recording command not saved");
    return commitRecordingImport.parse(JSON.parse(stored.text));
  });
}

export function discardRecordingDraft(
  scope: VerifiedMobileScope,
  expected: MobileRecordingDraft,
) {
  return withRecordingWorkspace(scope, (workspace) =>
    replaceRecordingSelection(workspace, expected, undefined, {
      release: expected.importId ? undefined : expected.fileId,
    }),
  );
}

export function discardCorruptRecordingDraft(
  scope: VerifiedMobileScope,
  corrupt: CorruptRecordingSelection,
) {
  return withRecordingWorkspace(scope, async (workspace) => {
    await workspace.updateRecordingDraft(
      recordingDraftId,
      (previous) => {
        if (previous !== corrupt.text) throw new RecordingSelectionChanged();
        return undefined;
      },
      { release: corrupt.fileToRelease },
    );
    if (corrupt.fileToRelease)
      await removeReleasedCopy(workspace, corrupt.fileToRelease);
  });
}
