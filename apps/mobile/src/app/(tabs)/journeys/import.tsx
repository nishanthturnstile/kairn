import { journeyPath } from "@kairn/contracts/journeys";
import { useLocalSearchParams } from "expo-router";
import { JourneyGate } from "../../../components/journeys/states";
import {
  NativeRecordingImport,
  NativeUnfinishedImports,
} from "../../../components/recordings/import";

export default function RecordingImportRoute() {
  const params = useLocalSearchParams();
  const journeyId = journeyPath.safeParse({ journeyId: params.journeyId }).data
    ?.journeyId;
  const importId = journeyPath.safeParse({ journeyId: params.importId }).data
    ?.journeyId;
  return (
    <JourneyGate title="Import a GPX recording">
      {(scope) =>
        params.resume === "1" ? (
          <NativeUnfinishedImports scope={scope} />
        ) : (
          <NativeRecordingImport
            key={`${scope.accountId}:${importId ?? ""}:${journeyId ?? ""}:${params.fresh === "1"}`}
            scope={scope}
            importId={importId}
            initialJourney={journeyId}
            fresh={params.fresh === "1"}
            editOnly={Boolean(importId && params.edit === "1")}
          />
        )
      }
    </JourneyGate>
  );
}
