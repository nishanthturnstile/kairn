import type {
  BeginRecordingUpload,
  CommitRecordingImport,
} from "@kairn/contracts/recordings";

export interface RecordingDraft {
  token: string;
  file: ArrayBuffer | Blob | null;
  input: BeginRecordingUpload;
  uploadId?: string;
  importId?: string;
  journeyId?: string;
}

type Store = "drafts" | "commands";

function openRecordingDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("kairn-recording-imports", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts");
      request.result.createObjectStore("commands");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function access<Value>(
  name: Store,
  key: IDBValidKey,
  change?: (previous: Value | undefined) => Value | undefined,
): Promise<Value | undefined> {
  const db = await openRecordingDatabase();
  try {
    return await new Promise<Value | undefined>((resolve, reject) => {
      const tx = db.transaction(name, change ? "readwrite" : "readonly");
      const store = tx.objectStore(name);
      const request = store.get(key);
      let result: Value | undefined;
      request.onsuccess = () => {
        result = request.result;
        if (!change) return;
        try {
          const next = change(result);
          if (next !== result) {
            if (next === undefined) store.delete(key);
            else store.put(next, key);
          }
          result = next;
        } catch {
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Recording draft unavailable"));
    });
  } finally {
    db.close();
  }
}

export async function hasRecordingDraft(accountId: string) {
  const db = await openRecordingDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const request = db
        .transaction("drafts")
        .objectStore("drafts")
        .getKey(accountId);
      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const recordingDraftKey = (accountId: string, journeyId?: string) =>
  journeyId
    ? [accountId, "recording-draft", journeyId]
    : [accountId, "recording-draft"];

function draftStorageKey(accountId: string, journeyId?: string) {
  return journeyId ? [accountId, journeyId] : accountId;
}

export function readRecordingDraft(accountId: string, journeyId?: string) {
  return access<RecordingDraft>(
    "drafts",
    draftStorageKey(accountId, journeyId),
  );
}

export function replaceRecordingDraft(
  accountId: string,
  expectedToken: string | undefined,
  next?: RecordingDraft,
  journeyId?: string,
) {
  return access<RecordingDraft>(
    "drafts",
    draftStorageKey(accountId, journeyId),
    (current) => {
      if (current?.token !== expectedToken)
        throw new Error("Recording draft changed in another window");
      return next;
    },
  );
}

export function readRecordingCommit(accountId: string, importId: string) {
  return access<CommitRecordingImport>("commands", [accountId, importId]);
}

export async function claimRecordingCommit(
  accountId: string,
  importId: string,
  input: CommitRecordingImport,
) {
  const result = await access<CommitRecordingImport>(
    "commands",
    [accountId, importId],
    (current) => current ?? input,
  );
  if (!result) throw new Error("Recording command could not be saved");
  return result;
}

export function clearRecordingCommit(
  accountId: string,
  importId: string,
  commandId: string,
) {
  return access<CommitRecordingImport>(
    "commands",
    [accountId, importId],
    (current) => (current?.commandId === commandId ? undefined : current),
  );
}
