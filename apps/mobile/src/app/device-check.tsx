import Mapbox from "@rnmapbox/maps";
import { Directory, File, Paths } from "expo-file-system";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Destination } from "../components/destination";
import { accountSession } from "../storage/session";
import { openAccountWorkspace } from "../storage/workspace";

const accountA = "00000000-0000-4000-8000-000000000101";
const accountB = "00000000-0000-4000-8000-000000000102";
const draftId = "00000000-0000-4000-8000-000000000103";
const originalId = "00000000-0000-4000-8000-000000000104";

function requireResult(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runFixture(phase: "stage" | "resume") {
  await Mapbox.setAccessToken(null);

  if (phase === "stage") {
    const workspace = await openAccountWorkspace(accountA);
    try {
      await workspace.saveDraft(draftId, "Synthetic draft for account A");
      const file = workspace.originalFile(originalId);
      file.create({ overwrite: true });
      file.write("Synthetic original for account A");
      await accountSession(accountA).write("synthetic-session-a");
    } finally {
      await workspace.close();
    }
    return "Staged draft, original, and session for account A";
  }

  const other = await openAccountWorkspace(accountB);
  try {
    requireResult(
      (await other.getDraft(draftId)) === null,
      "Account B could read account A’s draft",
    );
    requireResult(
      !other.originalFile(originalId).exists,
      "Account B could read account A’s original",
    );
    requireResult(
      (await accountSession(accountB).read()) === null,
      "Account B could read account A’s session",
    );
  } finally {
    await other.close();
  }

  const original = await openAccountWorkspace(accountA);
  try {
    requireResult(
      (await original.getDraft(draftId))?.text ===
        "Synthetic draft for account A",
      "Draft failed to survive relaunch",
    );
    requireResult(
      (await original.originalFile(originalId).text()) ===
        "Synthetic original for account A",
      "Original failed to survive relaunch",
    );
    const session = accountSession(accountA);
    requireResult(
      (await session.read()) === "synthetic-session-a",
      "Session failed to survive relaunch",
    );
    await session.clear();
    requireResult((await session.read()) === null, "Session failed to clear");
  } finally {
    await original.close();
  }

  return "Verified relaunch, account isolation, and session removal";
}

export default function DeviceCheckRoute() {
  const { phase } = useLocalSearchParams<{ phase?: string }>();
  if (
    !__DEV__ ||
    process.env.EXPO_PUBLIC_KAIRN_DEVICE_FIXTURES !== phase ||
    (phase !== "stage" && phase !== "resume")
  ) {
    return <Redirect href="/journeys" />;
  }
  return <DeviceCheck key={phase} phase={phase} />;
}

function DeviceCheck({ phase }: { phase: "stage" | "resume" }) {
  const [status, setStatus] = useState("Checking native modules");
  useEffect(() => {
    async function check() {
      let result: { passed: boolean; message: string };
      try {
        result = { passed: true, message: await runFixture(phase) };
      } catch (error) {
        result = {
          passed: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      const directory = new Directory(Paths.document, "kairn-device-fixtures");
      directory.create({ idempotent: true });
      const evidence = new File(directory, `${phase}.json`);
      evidence.create({ overwrite: true });
      evidence.write(JSON.stringify(result));
      setStatus(`${result.passed ? "Passed" : "Failed"} · ${result.message}`);
    }
    void check();
  }, [phase]);

  return (
    <Destination
      title="Device check"
      description="Synthetic native development fixture."
      stateTitle={status}
      stateDescription={
        phase === "stage"
          ? "Restart Kairn before continuing."
          : "SQLite, SecureStore, app-owned files, and the Mapbox bridge."
      }
    />
  );
}
