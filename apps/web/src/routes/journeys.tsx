import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { JourneyHistoryPage } from "../components/journeys/history";
import { JourneyGate } from "../components/journeys/states";
import { Alert, AlertDescription } from "../components/ui/alert";
import { departureNoticeKey } from "../lib/journey-departure";

export const Route = createFileRoute("/journeys")({ component: Journeys });

function Journeys() {
  const { scope } = Route.useRouteContext();
  const [departure] = useState(() =>
    scope.queryClient.getQueryData<"confirmed" | "pending">([
      scope.accountId,
      "departure-notice",
    ]),
  );
  useEffect(() => {
    if (departure)
      scope.queryClient.removeQueries({
        queryKey: departureNoticeKey(scope),
      });
  }, [departure, scope]);
  return (
    <JourneyGate title="Journeys">
      {departure && (
        <Alert
          className="mb-5"
          role="status"
          variant={departure === "pending" ? "warning" : "default"}
        >
          <AlertDescription>
            {departure === "pending"
              ? "You left the journey. Confirmation is pending."
              : "You left the journey."}
          </AlertDescription>
        </Alert>
      )}
      <JourneyHistoryPage scope={scope} />
    </JourneyGate>
  );
}
