import { journeyPath } from "@kairn/contracts/journeys";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { JourneyDate } from "../components/journeys/dates";
import {
  JourneyBackLink,
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { Alert, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { historyKey, journeyResult } from "../lib/journey-api";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";

export const Route = createFileRoute("/journeys_/$journeyId")({
  component: JourneyDetailRoute,
});

function JourneyDetailRoute() {
  const { journeyId } = Route.useParams();
  const { scope } = Route.useRouteContext();
  if (!journeyPath.safeParse({ journeyId }).success)
    return <UnavailableJourney />;
  return (
    <JourneyGate title="Journey" returnTo={`/journeys/${journeyId}`}>
      <JourneyDetail key={journeyId} journeyId={journeyId} scope={scope} />
    </JourneyGate>
  );
}

function UnavailableJourney() {
  return (
    <section className="grid max-w-2xl gap-6">
      <PageHeading title="Journey" />
      <Alert>
        <AlertTitle>This journey is unavailable</AlertTitle>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <JourneyBackLink />
        <Button asChild variant="ghost">
          <Link to="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </section>
  );
}

function JourneyDetail({
  scope,
  journeyId,
}: {
  scope: AccountScope;
  journeyId: string;
}) {
  const { refresh } = useSessionAccess();
  const detail = useQuery({
    queryKey: [scope.accountId, "journey-detail", journeyId],
    refetchOnMount: "always",
    async queryFn({ signal }) {
      const result = await scope.api.GET("/api/v1/journeys/{journeyId}", {
        params: { path: { journeyId } },
        signal,
      });
      if (result.response.status === 404) {
        scope.signal.throwIfAborted();
        signal.throwIfAborted();
        scope.queryClient.removeQueries({
          queryKey: historyKey(scope),
          exact: true,
        });
        return null;
      }
      return journeyResult(result, scope, refresh);
    },
  });
  if (!detail.isError && detail.isFetchedAfterMount && detail.data === null)
    return <UnavailableJourney />;
  const journey =
    detail.isFetchedAfterMount && !detail.isError ? detail.data : undefined;
  return (
    <section className="grid max-w-2xl gap-6 sm:gap-8">
      <JourneyBackLink />
      <PageHeading title={journey?.title ?? "Journey"} />
      {detail.isError ? (
        <JourneyRetry
          title="Couldn’t load this journey"
          busy={detail.isFetching}
          retry={() => void detail.refetch()}
        />
      ) : !journey ? (
        <JourneyLoading label="Loading journey" />
      ) : (
        <>
          <p className="font-semibold text-muted-foreground">
            {journey.state === "archived" ? "Private · Archived" : "Private"}
          </p>
          {journey.schedule ? (
            <dl className="grid gap-4 rounded-card control-border bg-card p-4 sm:grid-cols-2">
              <div className="grid gap-1">
                <dt className="font-semibold">Intended start</dt>
                <dd>
                  <JourneyDate minute={journey.schedule.intendedStart} />
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="font-semibold">Intended end</dt>
                <dd>
                  {journey.schedule.intendedEnd ? (
                    <JourneyDate minute={journey.schedule.intendedEnd} />
                  ) : (
                    "End date unknown"
                  )}
                </dd>
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <dt className="font-semibold">Timezone</dt>
                <dd>{journey.schedule.timeZone}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground">Dates unavailable</p>
          )}
        </>
      )}
    </section>
  );
}
