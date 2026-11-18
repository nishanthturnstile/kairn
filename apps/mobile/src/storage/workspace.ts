import { Directory, File, Paths } from "expo-file-system";
import { openDatabaseAsync } from "expo-sqlite";
import { localId } from "./namespace";

const migrations = [
  `CREATE TABLE local_drafts (
    id TEXT PRIMARY KEY NOT NULL,
    text TEXT NOT NULL
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
