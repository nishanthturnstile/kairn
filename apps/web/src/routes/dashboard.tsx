import type {
  DashboardJourney,
  DashboardSummary,
  OnboardingIntent,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { JourneyDate } from "../components/journeys/dates";
import {
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "../components/journeys/states";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../components/ui/empty";
import { journeyResult } from "../lib/journey-api";
import { useOnboarding } from "../lib/onboarding";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

const firstJourney = {
  plan: {
    action: "Plan a trip",
    title: "Plan your first trip",
    description:
      "Give your trip a title and dates to see it in your upcoming plans.",
  },
  record: {
    action: "Record a past trip",
    title: "Keep a trip you’ve already taken",
    description:
      "Add the title and dates from a past trip to start your private journey history.",
  },
} as const;

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

  return (
    <div className="grid gap-8 sm:gap-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 ref={heading} tabIndex={-1} className="text-4xl font-semibold">
          Dashboard
        </h1>
        <Button asChild>
          <Link to="/journeys/new" search={{ intent }}>
            {intent ? firstJourney[intent].action : "Create a journey"}
          </Link>
        </Button>
      </header>
      {summary.isError ? (
        <JourneyRetry
          title="Couldn’t load your Dashboard"
          busy={summary.isFetching}
          retry={() => void summary.refetch()}
        />
      ) : !summary.data || summary.isFetching ? (
        <JourneyLoading label="Loading your Dashboard" />
      ) : (
        <JourneyOverview summary={summary.data} intent={intent} />
      )}
    </div>
  );
}

function JourneyOverview({
  summary,
  intent,
}: {
  summary: DashboardSummary;
  intent?: OnboardingIntent;
}) {
  if (summary.journeyCount === 0)
    return (
      <Empty className="bg-muted p-6 sm:p-8">
        <EmptyHeader>
          <EmptyTitle>
            {intent ? firstJourney[intent].title : "Your journeys start here"}
          </EmptyTitle>
          <EmptyDescription>
            {intent
              ? firstJourney[intent].description
              : "Add a journey and its dates to see your upcoming plans and recent trips here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <>
      <section
        aria-labelledby="next-journey"
        className="grid gap-3 rounded-card control-border bg-muted p-4 sm:p-8"
      >
        <h2 id="next-journey" className="text-xl font-semibold">
          Next journey
        </h2>
        {summary.nextJourney ? (
          <JourneySummaryLink journey={summary.nextJourney} featured />
        ) : (
          <p className="text-muted-foreground">
            No upcoming journeys scheduled.
          </p>
        )}
      </section>

      <section aria-labelledby="dashboard-overview" className="grid gap-3">
        <h2 id="dashboard-overview" className="text-xl font-semibold">
          Overview
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1 rounded-card control-border bg-card p-4">
            <dt className="font-semibold text-muted-foreground">Journeys</dt>
            <dd className="text-4xl font-semibold tabular-nums">
              {summary.journeyCount.toLocaleString("en-IN")}
            </dd>
          </div>
          <div className="grid content-start gap-1 rounded-card control-border bg-card p-4">
            <dt className="font-semibold text-muted-foreground">
              Upcoming plans
            </dt>
            <dd className="text-4xl font-semibold tabular-nums">
              {summary.upcomingCount.toLocaleString("en-IN")}
            </dd>
            <dd className="text-sm text-muted-foreground">
              Excludes archived journeys
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="dashboard-recent" className="grid gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dashboard-recent" className="text-xl font-semibold">
            Recent journeys
          </h2>
          <Button asChild variant="link">
            <Link to="/journeys">All journeys</Link>
          </Button>
        </header>
        {summary.recentJourneys.length ? (
          <ul className="grid gap-2">
            {summary.recentJourneys.map((journey) => (
              <li key={journey.id}>
                <JourneySummaryLink journey={journey} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            Journeys appear here once their planned start date arrives.
          </p>
        )}
      </section>
    </>
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
      className="grid min-h-touch gap-1 rounded-control control-border bg-card p-4 transition-colors hover:bg-background"
    >
      <span
        className={
          featured
            ? "text-xl font-semibold text-primary underline underline-offset-4"
            : "font-semibold text-primary underline underline-offset-4"
        }
      >
        {journey.title}
      </span>
      <span className="text-muted-foreground">
        {journey.schedule ? (
          <JourneyDate minute={journey.schedule.intendedStart} />
        ) : (
          "Dates unavailable"
        )}
      </span>
      {journey.state === "archived" && (
        <span className="text-sm text-muted-foreground">Archived</span>
      )}
    </Link>
  );
}
