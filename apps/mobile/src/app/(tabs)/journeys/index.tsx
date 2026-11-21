import { JourneyHistory } from "../../../components/journeys/history";
import { JourneyGate } from "../../../components/journeys/states";

export default function JourneysRoute() {
  return (
    <JourneyGate title="Journeys" top>
      {(scope) => <JourneyHistory key={scope.accountId} scope={scope} />}
    </JourneyGate>
  );
}
