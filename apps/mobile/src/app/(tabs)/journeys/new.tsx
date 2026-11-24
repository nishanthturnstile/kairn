import { useLocalSearchParams } from "expo-router";
import { CreateJourney } from "../../../components/journeys/create";
import { JourneyGate } from "../../../components/journeys/states";
import { gpxJourneyCreation } from "../../../journey-creation";

export default function CreateJourneyRoute() {
  const { intent } = useLocalSearchParams();
  const choice = intent === "plan" || intent === "record" ? intent : undefined;
  return (
    <JourneyGate
      title={gpxJourneyCreation ? "Create a journey" : "Create journey"}
      destination="/journeys/new"
    >
      {(scope) => (
        <CreateJourney key={scope.accountId} scope={scope} intent={choice} />
      )}
    </JourneyGate>
  );
}
