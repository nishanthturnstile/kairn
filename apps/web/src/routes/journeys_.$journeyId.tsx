import type { JourneySchedule, PrivateJourney } from "@kairn/contracts";
import { journeyPath } from "@kairn/contracts/journeys";
import {
  journeyScheduleStatus,
  journeyStatusLabels,
} from "@kairn/shared/journey-time";
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
  Users,
} from "lucide-react";
import { type RefCallback, useCallback, useRef } from "react";
import { JourneyDate } from "../components/journeys/dates";
import {
  JourneyBackLink,
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { Alert, AlertTitle } from "../components/ui/alert";
import { ButtonLink } from "../components/ui/button";
import { useJourneyAccess } from "../lib/journey-access";
import type { AccountScope } from "../lib/session";

const pageLayout = "@container/journey-detail mx-auto grid max-w-4xl gap-4";
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
        <ButtonLink render={<Link to="/dashboard" />} variant="ghost">
          Go to Dashboard
        </ButtonLink>
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
  const detail = useJourneyAccess(scope, journeyId);
  const presented = useRef(false);
  const focusOnEntry = useCallback((heading: HTMLHeadingElement | null) => {
    if (!heading || presented.current) return;
    presented.current = true;
    if (document.activeElement === document.body) heading.focus();
  }, []);
  if (
    !detail.checking &&
    !detail.isError &&
    detail.isFetchedAfterMount &&
    detail.data === null
  )
    return <UnavailableJourney />;
  const snapshot =
    detail.isFetchedAfterMount && !detail.isError && !detail.checking
      ? detail.data
      : undefined;
  return (
    <section className={pageLayout}>
      <JourneyBackLink />
      {snapshot ? (
        <JourneyOverview {...snapshot} headingRef={focusOnEntry} />
      ) : (
        <>
          <PageHeading title="Journey" />
          {detail.offline ? (
            <Alert>
              <AlertTitle>Reconnect to check journey access</AlertTitle>
            </Alert>
          ) : detail.isError ? (
            <JourneyRetry
              title="Couldn’t load this journey"
              busy={detail.checking}
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
  headingRef,
  journey,
  asOf,
}: {
  headingRef: RefCallback<HTMLHeadingElement>;
  journey: PrivateJourney;
  asOf: number;
}) {
  const { schedule } = journey;
  const status = schedule && journeyScheduleStatus(schedule, asOf);
  const StatusIcon = status && statusIcons[status];
  return (
    <article className="min-w-0 overflow-hidden rounded-card control-border bg-card">
      <header className="grid gap-4 bg-accent p-inset">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 text-4xl font-semibold wrap-anywhere"
        >
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
        className="grid gap-4 border-t p-inset"
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
      <section
        aria-labelledby="journey-people"
        className="flex flex-wrap items-center justify-between gap-3 border-t p-inset"
      >
        <div>
          <h2 id="journey-people" className="text-xl font-semibold">
            People
          </h2>
          <p className="text-sm text-muted-foreground">
            {journey.capabilities.includes("administrator")
              ? "Organiser"
              : "Journey member"}
          </p>
        </div>
        <ButtonLink
          render={
            <Link
              to="/journeys/$journeyId/people"
              params={{ journeyId: journey.id }}
            />
          }
          variant="outline"
        >
          <Users aria-hidden="true" data-icon="inline-start" /> View people
        </ButtonLink>
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
