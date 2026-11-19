import { createFileRoute } from "@tanstack/react-router";
import { CreateJourneyPage } from "../components/journeys/create";
import { JourneyGate } from "../components/journeys/states";

export const Route = createFileRoute("/journeys_/new")({
  component: CreateJourneyRoute,
});

function CreateJourneyRoute() {
  const { scope } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  return (
    <JourneyGate title="Create journey">
      {scope.accountId && (
        <CreateJourneyPage
          scope={scope}
          accountId={scope.accountId}
          openJourney={(journeyId) =>
            void navigate({
              to: "/journeys/$journeyId",
              params: { journeyId },
              replace: true,
            })
          }
        />
      )}
    </JourneyGate>
  );
}
