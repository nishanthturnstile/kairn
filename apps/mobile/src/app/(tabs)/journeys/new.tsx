import { CreateJourney } from "../../../components/journeys/create";
import { JourneyGate } from "../../../components/journeys/states";

export default function CreateJourneyRoute() {
  return (
    <JourneyGate title="Create journey">
      {(scope) => <CreateJourney key={scope.accountId} scope={scope} />}
    </JourneyGate>
  );
}
