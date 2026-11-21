import type { OnboardingIntent } from "@kairn/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { CreateJourneyPage } from "../components/journeys/create";
import { JourneyGate } from "../components/journeys/states";

export const Route = createFileRoute("/journeys_/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { intent?: OnboardingIntent } => ({
    intent:
      search.intent === "plan" || search.intent === "record"
        ? search.intent
        : undefined,
  }),
  component: CreateJourneyRoute,
});

function CreateJourneyRoute() {
  const { scope } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const { intent } = Route.useSearch();
  return (
    <JourneyGate title="Create journey" returnTo="/journeys/new">
      {scope.accountId && (
        <CreateJourneyPage
          key={scope.accountId}
          scope={scope}
          accountId={scope.accountId}
          intent={intent}
          openJourney={(journeyId, invitePeople) =>
            void navigate({
              to: invitePeople
                ? "/journeys/$journeyId/invite"
                : "/journeys/$journeyId",
              params: { journeyId },
              replace: true,
            })
          }
        />
      )}
    </JourneyGate>
  );
}
