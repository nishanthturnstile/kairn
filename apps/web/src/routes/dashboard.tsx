import type {
  DashboardJourney,
  DashboardSummary,
  OnboardingIntent,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, MapIcon, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { JourneyMap } from "../components/illustrations/journey-map";
import { JourneyDate } from "../components/journeys/dates";
import {
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "../components/journeys/states";
import { ButtonLink } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { journeyResult } from "../lib/journey-api";
import { journeyIntentCopy } from "../lib/journey-intent-copy";
import { useOnboarding } from "../lib/onboarding";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const { scope } = Route.useRouteContext();
  return (
    <JourneyGate title="Dashboard" returnTo={null}>
      {scope.accountId && (
        <DashboardHome scope={scope} accountId={scope.accountId} />
      )}
    </JourneyGate>
  );
}

function DashboardHome({
  scope,
  accountId,
}: {
  scope: AccountScope;
  accountId: string;
}) {
  const { refresh } = useSessionAccess();
  const { data: setup } = useOnboarding();
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useQuery({
    queryKey: [accountId, "dashboard"],
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    async queryFn({ signal }) {
      const result = await scope.api.GET("/api/v1/dashboard", {
        params: { header: { "x-expected-account": accountId } },
        signal,
      });
      return journeyResult(result, scope, refresh);
    },
  });
  const intent =
    summary.data?.journeyCount === 0 && setup?.state === "completed"
      ? setup.intent
      : undefined;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const currentSummary =
    summary.isFetching || summary.isError ? undefined : summary.data;
  const showFirstJourney = currentSummary?.journeyCount === 0;

  return (
    <div className="@container/dashboard grid gap-section">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-4xl font-bold tracking-tight"
          >
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Your upcoming plans and recent journeys.
          </p>
        </div>
        {!showFirstJourney && <CreateJourneyLink />}
      </header>
      {currentSummary ? (
        <JourneyOverview summary={currentSummary} intent={intent} />
      ) : summary.isError ? (
        <JourneyRetry
          title="Couldn’t load your Dashboard"
          busy={summary.isFetching}
          retry={() => void summary.refetch()}
        />
      ) : (
        <JourneyLoading label="Loading your Dashboard" />
      )}
    </div>
  );
}

function CreateJourneyLink({ intent }: { intent?: OnboardingIntent }) {
  return (
    <ButtonLink render={<Link to="/journeys/new" search={{ intent }} />}>
      <Plus aria-hidden="true" data-icon="inline-start" />
      <span>
        {intent ? journeyIntentCopy[intent].action : "Create a journey"}
      </span>
    </ButtonLink>
  );
}

function JourneyOverview({
  summary,
  intent,
}: {
  summary: DashboardSummary;
  intent?: OnboardingIntent;
}) {
  return (
    <>
      <div className="grid gap-4 @min-[49rem]/dashboard:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        {summary.journeyCount === 0 ? (
          <FirstJourney intent={intent} />
        ) : (
          <NextJourney journey={summary.nextJourney} />
        )}
        <section aria-label="Overview">
          <Card className="h-full gap-2">
            <CardHeader>
              <h2 className="text-xl font-semibold">Overview</h2>
            </CardHeader>
            <CardContent>
              <dl className="grid divide-y divide-border/45">
                <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <dt className="flex items-center gap-3 text-muted-foreground">
                    <MapIcon aria-hidden="true" className="size-4 shrink-0" />
                    Journeys
                  </dt>
                  <dd className="text-xl font-bold tabular-nums">
                    {summary.journeyCount.toLocaleString("en-IN")}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <dt className="flex items-center gap-3 text-muted-foreground">
                    <CalendarDays
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    Upcoming plans
                  </dt>
                  <dd className="text-xl font-bold tabular-nums">
                    {summary.upcomingCount.toLocaleString("en-IN")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </section>
      </div>

      {summary.journeyCount > 0 && (
        <section aria-labelledby="dashboard-recent">
          <Card className="gap-2">
            <CardHeader className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 id="dashboard-recent" className="text-xl font-semibold">
                Recent journeys
              </h2>
              <ButtonLink
                render={<Link to="/journeys" />}
                variant="link"
                size="sm"
                className="-me-2"
              >
                All journeys
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </ButtonLink>
            </CardHeader>
            <CardContent>
              {summary.recentJourneys.length ? (
                <ul className="divide-y divide-border/45">
                  {summary.recentJourneys.map((journey) => (
                    <li key={journey.id}>
                      <JourneySummaryLink journey={journey} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pb-3 text-muted-foreground">
                  Journeys appear here once their planned start date arrives.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </>
  );
}

function FirstJourney({ intent }: { intent?: OnboardingIntent }) {
  const title = intent
    ? journeyIntentCopy[intent].heading
    : "Your journeys start here";
  return (
    <section
      aria-label={title}
      className="relative grid overflow-hidden rounded-card control-border bg-card @min-[31rem]/dashboard:grid-cols-[minmax(0,1fr)_38%]"
    >
      <div className="grid content-center justify-items-start gap-3 p-inset">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="max-w-[38ch] text-muted-foreground">
          {intent
            ? journeyIntentCopy[intent].description
            : "Add a journey and its dates to see your upcoming plans and recent journeys here."}
        </p>
        <div className="mt-2">
          <CreateJourneyLink intent={intent} />
        </div>
      </div>
      <JourneyMap />
    </section>
  );
}

function NextJourney({ journey }: { journey?: DashboardJourney | null }) {
  return (
    <section
      aria-labelledby="next-journey"
      className="grid content-start gap-4 rounded-card control-border bg-accent p-inset text-accent-foreground"
    >
      <h2
        id="next-journey"
        className="flex items-center gap-2 text-base font-semibold"
      >
        <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
        Next journey
      </h2>
      {journey ? (
        <JourneySummaryLink journey={journey} featured />
      ) : (
        <p className="max-w-prose text-xl font-semibold">
          No upcoming journeys scheduled.
        </p>
      )}
    </section>
  );
}

function JourneySummaryLink({
  journey,
  featured = false,
}: {
  journey: DashboardJourney;
  featured?: boolean;
}) {
  return (
    <Link
      to="/journeys/$journeyId"
      params={{ journeyId: journey.id }}
      className="group grid min-h-touch grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-control py-3 focus-visible:-outline-offset-2"
    >
      <span className="grid gap-1">
        <span
          className={
            featured
              ? "text-2xl font-bold underline-offset-4 group-hover:underline"
              : "font-semibold text-primary underline-offset-4 group-hover:underline"
          }
        >
          {journey.title}
        </span>
        <span className={featured ? "text-current" : "text-muted-foreground"}>
          {journey.schedule ? (
            <JourneyDate minute={journey.schedule.intendedStart} />
          ) : (
            "Dates unavailable"
          )}
        </span>
        {journey.state === "archived" && (
          <span className="text-sm text-muted-foreground">Archived</span>
        )}
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
    </Link>
  );
}
