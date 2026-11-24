import { Directory, File, Paths } from "expo-file-system";
import { openDatabaseAsync } from "expo-sqlite";
import { createJourneyAttemptTable, journeyAttempts } from "./journey-attempt";
import { localId } from "./namespace";

const migrations = [
  `CREATE TABLE local_drafts (
    id TEXT PRIMARY KEY NOT NULL,
    text TEXT NOT NULL
  ) STRICT;`,
  createJourneyAttemptTable,
  `CREATE TABLE local_recording_copies (
    id TEXT PRIMARY KEY NOT NULL,
    ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1))
  ) STRICT;`,
] as const;

export async function openAccountWorkspace(accountId: string) {
  const directory = new Directory(
    Paths.document,
    "kairn",
    "accounts",
    localId(accountId),
  );
  const originals = new Directory(directory, "originals");
  originals.create({ intermediates: true, idempotent: true });
  const db = await openDatabaseAsync(
    "workspace.db",
    { useNewConnection: true },
    directory.uri,
  );
  try {
    await db.execAsync("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;");
    try {
      const current = await db.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version;",
      );
      const version = current?.user_version;
      if (version === undefined || version > migrations.length)
        throw new Error("Unsupported workspace database version.");
      for (const migration of migrations.slice(version))
        await db.execAsync(migration);
      if (version !== migrations.length)
        await db.execAsync(`PRAGMA user_version = ${migrations.length};`);
      await db.execAsync("COMMIT;");
    } catch (error) {
      await db.execAsync("ROLLBACK;");
      throw error;
    }
  } catch (error) {
    await db.closeAsync();
    throw error;
  }

  return {
    journeyAttempts: journeyAttempts(db),
    claimDraft: async (id: string, value: string) => {
      const key = localId(id);
      await db.runAsync(
        "INSERT INTO local_drafts (id, text) VALUES (?, ?) ON CONFLICT DO NOTHING",
        key,
        value,
      );
      return db.getFirstAsync<{ text: string }>(
        "SELECT text FROM local_drafts WHERE id = ?",
        key,
      );
    },
    deleteDraft: (id: string) =>
      db.runAsync("DELETE FROM local_drafts WHERE id = ?", localId(id)),
    beginRecordingCopy: (id: string) =>
      db.runAsync(
        "INSERT INTO local_recording_copies (id) VALUES (?)",
        localId(id),
      ),
    incompleteRecordingCopies: () =>
      db.getAllAsync<{ id: string }>(
        "SELECT id FROM local_recording_copies WHERE ready = 0",
      ),
    forgetRecordingCopy: (id: string) =>
      db.runAsync(
        "DELETE FROM local_recording_copies WHERE id = ?",
        localId(id),
      ),
    updateRecordingDraft: async (
      draftId: string,
      change: (previous: string | undefined) => string | undefined,
      copies: { keep?: string; release?: string | readonly string[] } = {},
    ) => {
      const key = localId(draftId);
      await db.withExclusiveTransactionAsync(async (tx) => {
        const current = await tx.getFirstAsync<{ text: string }>(
          "SELECT text FROM local_drafts WHERE id = ?",
          key,
        );
        const next = change(current?.text);
        if (copies.keep) {
          const kept = await tx.runAsync(
            "UPDATE local_recording_copies SET ready = 1 WHERE id = ?",
            localId(copies.keep),
          );
          if (kept.changes !== 1)
            throw new Error("Recording copy is unavailable");
        }
        const released =
          typeof copies.release === "string"
            ? [copies.release]
            : copies.release;
        for (const id of released ?? [])
          await tx.runAsync(
            "UPDATE local_recording_copies SET ready = 0 WHERE id = ?",
            localId(id),
          );
        if (next === undefined)
          await tx.runAsync("DELETE FROM local_drafts WHERE id = ?", key);
        else
          await tx.runAsync(
            "INSERT INTO local_drafts (id, text) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET text = excluded.text",
            key,
            next,
          );
      });
    },
    originalFile: (id: string) => new File(originals, localId(id)),
    getDraft: (id: string) =>
      db.getFirstAsync<{ text: string }>(
        "SELECT text FROM local_drafts WHERE id = ?",
        localId(id),
      ),
    saveDraft: (id: string, value: string) =>
      db.runAsync(
        "INSERT INTO local_drafts (id, text) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET text = excluded.text",
        localId(id),
        value,
      ),
    close: () => db.closeAsync(),
  };
}
