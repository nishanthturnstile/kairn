import type { JourneySchedule, PrivateJourney } from "@kairn/contracts";
import { journeyPath } from "@kairn/contracts/journeys";
import {
  journeyScheduleAsOf,
  journeyScheduleStatus,
  journeyStatusLabels,
} from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
  Archive,
  CalendarClock,
  CalendarDays,
  Compass,
  Globe,
  History,
  LockKeyhole,
} from "lucide-react";
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

const pageLayout = "@container/journey-detail mx-auto grid max-w-4xl gap-5";
const statusIcons = {
  active: Compass,
  upcoming: CalendarDays,
  past: History,
  openEnded: CalendarClock,
};

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
    <section className={pageLayout}>
      <JourneyBackLink />
      <PageHeading title="Journey" />
      <Alert>
        <AlertTitle>This journey is unavailable</AlertTitle>
      </Alert>
      <div className="flex flex-wrap gap-2">
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
    refetchOnWindowFocus: "always",
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
      const journey = journeyResult(result, scope, refresh);
      return {
        journey,
        asOf: journeyScheduleAsOf(result.response.headers),
      };
    },
  });
  if (!detail.isError && detail.isFetchedAfterMount && detail.data === null)
    return <UnavailableJourney />;
  const snapshot =
    detail.isFetchedAfterMount && !detail.isError ? detail.data : undefined;
  return (
    <section className={pageLayout}>
      <JourneyBackLink />
      {snapshot ? (
        <JourneyOverview {...snapshot} />
      ) : (
        <>
          <PageHeading title="Journey" />
          {detail.isError ? (
            <JourneyRetry
              title="Couldn’t load this journey"
              busy={detail.isFetching}
              retry={() => void detail.refetch()}
            />
          ) : (
            <JourneyLoading label="Loading journey" />
          )}
        </>
      )}
    </section>
  );
}

function JourneyOverview({
  journey,
  asOf,
}: {
  journey: PrivateJourney;
  asOf: number;
}) {
  const { schedule } = journey;
  const status = schedule && journeyScheduleStatus(schedule, asOf);
  const StatusIcon = status && statusIcons[status];
  return (
    <article className="min-w-0 overflow-hidden rounded-card control-border bg-card">
      <header className="grid gap-4 bg-accent p-5 @min-[32rem]/journey-detail:p-8">
        <h1 className="min-w-0 text-4xl font-semibold wrap-anywhere">
          {journey.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold">
          {status && StatusIcon && (
            <span className="inline-flex min-w-0 items-start gap-1.5 rounded-control bg-card px-2.5 py-1.5 text-primary">
              <StatusIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{journeyStatusLabels[status]}</span>
            </span>
          )}
          <span className="inline-flex min-w-0 items-start gap-1.5 text-muted-foreground">
            <LockKeyhole
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            Private
          </span>
          {journey.state === "archived" && (
            <span className="inline-flex min-w-0 items-start gap-1.5 text-muted-foreground">
              <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Archived
            </span>
          )}
        </div>
      </header>
      <section
        aria-labelledby="journey-schedule"
        className="grid gap-5 border-t p-5 @min-[32rem]/journey-detail:p-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="journey-schedule" className="text-xl font-semibold">
            Schedule
          </h2>
          {schedule && (
            <span className="inline-flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
              <Globe aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="sr-only">Timezone</span>
              <span className="min-w-0 wrap-anywhere">{schedule.timeZone}</span>
            </span>
          )}
        </div>
        {schedule ? (
          <dl className="grid @min-[34rem]/journey-detail:grid-cols-2">
            <ScheduleStop
              label="Intended start"
              minute={schedule.intendedStart}
            />
            <ScheduleStop label="Intended end" minute={schedule.intendedEnd} />
          </dl>
        ) : (
          <p className="text-muted-foreground">Dates unavailable</p>
        )}
      </section>
    </article>
  );
}

function ScheduleStop({
  label,
  minute,
}: {
  label: "Intended start" | "Intended end";
  minute: JourneySchedule["intendedEnd"];
}) {
  const first = label === "Intended start";
  return (
    <div
      className={cn(
        "relative grid min-w-0 gap-1 ps-5 @min-[34rem]/journey-detail:ps-0 @min-[34rem]/journey-detail:pt-5",
        first &&
          "pb-5 before:absolute before:start-1 before:top-2 before:-bottom-2 before:w-px before:bg-border/60 @min-[34rem]/journey-detail:pe-4 @min-[34rem]/journey-detail:pb-0 @min-[34rem]/journey-detail:before:-end-1 @min-[34rem]/journey-detail:before:top-1 @min-[34rem]/journey-detail:before:bottom-auto @min-[34rem]/journey-detail:before:h-px @min-[34rem]/journey-detail:before:w-auto",
      )}
    >
      <dt className="text-sm font-semibold text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn(
            "absolute start-0 top-1 size-2.5 rounded-full border border-primary @min-[34rem]/journey-detail:top-0",
            minute ? "bg-primary" : "bg-card",
          )}
        />
        {label}
      </dt>
      <dd
        className={cn(
          "text-lg wrap-anywhere",
          minute ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {minute ? <JourneyDate minute={minute} /> : "End date unknown"}
      </dd>
    </div>
  );
}
