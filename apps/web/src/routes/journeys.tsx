import { createFileRoute } from "@tanstack/react-router";
import { JourneyHistoryPage } from "../components/journeys/history";
import { JourneyGate } from "../components/journeys/states";

export const Route = createFileRoute("/journeys")({ component: Journeys });

function Journeys() {
  const { scope } = Route.useRouteContext();
  return (
    <JourneyGate title="Journeys">
      <JourneyHistoryPage scope={scope} />
    </JourneyGate>
  );
}
