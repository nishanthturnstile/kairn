import type {
  DashboardJourney,
  DashboardSummary,
  OnboardingIntent,
} from "@kairn/contracts";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  LockKeyhole,
  MapIcon,
  Plus,
} from "lucide-react";
import { JourneyDate } from "@/components/journeys/dates";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { journeyIntentCopy } from "@/lib/journey-intent-copy";
import "./dashboard.css";

export function CreateJourneyLink({ intent }: { intent?: OnboardingIntent }) {
  return (
    <ButtonLink
      size="lg"
      render={<Link to="/journeys/new" search={{ intent }} />}
    >
      <Plus aria-hidden="true" data-icon="inline-start" />
      <span>
        {intent ? journeyIntentCopy[intent].action : "Create a journey"}
      </span>
    </ButtonLink>
  );
}

export function DashboardOverview({
  summary,
  intent,
}: {
  summary: DashboardSummary;
  intent?: OnboardingIntent;
}) {
  if (summary.journeyCount === 0) return <FirstJourney intent={intent} />;

  return (
    <>
      <div className="grid gap-4 @min-[48rem]/dashboard:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <NextJourney journey={summary.nextJourney} />
        <JourneyTotals summary={summary} />
      </div>
      <RecentJourneys journeys={summary.recentJourneys} />
    </>
  );
}

function FirstJourney({ intent }: { intent?: OnboardingIntent }) {
  const copy = intent && journeyIntentCopy[intent];
  return (
    <Empty
      role="region"
      aria-labelledby="dashboard-first-journey"
      className="items-stretch gap-0 overflow-hidden p-0 @min-[42rem]/dashboard:grid @min-[42rem]/dashboard:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
    >
      <div className="grid content-center justify-items-start gap-5 p-5 @min-[42rem]/dashboard:p-8 @min-[64rem]/dashboard:p-10">
        <EmptyHeader className="gap-2">
          <EmptyTitle
            id="dashboard-first-journey"
            className="text-2xl font-bold text-pretty @min-[42rem]/dashboard:text-3xl"
          >
            {copy ? copy.heading : "Your journeys start here"}
          </EmptyTitle>
          <EmptyDescription className="max-w-[44ch] text-pretty">
            {copy
              ? copy.description
              : "Add a journey and its dates to see your upcoming plans and past journeys here."}
          </EmptyDescription>
        </EmptyHeader>
        <CreateJourneyLink intent={intent} />
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Every journey starts private.
        </p>
      </div>
      <div className="dashboard-notebook" aria-hidden="true" />
    </Empty>
  );
}

function NextJourney({ journey }: { journey: DashboardJourney | null }) {
  return (
    <section aria-labelledby="dashboard-next">
      <Card className="h-full control-border bg-accent [--card-spacing:--spacing(5)]">
        <CardHeader>
          <h2 id="dashboard-next" className="text-base font-semibold">
            Next journey
          </h2>
        </CardHeader>
        <CardContent className="flex flex-1 items-center">
          {journey ? (
            <Link
              to="/journeys/$journeyId"
              params={{ journeyId: journey.id }}
              className="group grid min-h-touch w-full gap-3 rounded-control focus-visible:-outline-offset-2"
            >
              <span className="text-2xl font-bold text-pretty underline-offset-4 group-hover:underline @min-[48rem]/dashboard:text-3xl">
                {journey.title}
              </span>
              <span className="flex items-start gap-2 text-muted-foreground">
                <CalendarDays
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0"
                />
                <JourneySchedule journey={journey} />
              </span>
              <span className="mt-1 flex items-center gap-2 font-semibold text-primary">
                Open journey
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </span>
            </Link>
          ) : (
            <p className="max-w-prose text-lg font-semibold">
              No upcoming journeys scheduled.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function JourneyTotals({ summary }: { summary: DashboardSummary }) {
  return (
    <section aria-labelledby="dashboard-overview">
      <Card className="h-full gap-2 control-border [--card-spacing:--spacing(5)]">
        <CardHeader>
          <h2 id="dashboard-overview" className="text-base font-semibold">
            Overview
          </h2>
        </CardHeader>
        <CardContent>
          <dl className="grid divide-y divide-border">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <MapIcon aria-hidden="true" className="size-4 shrink-0" />
                Journeys
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {summary.journeyCount.toLocaleString("en-IN")}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                Upcoming plans
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {summary.upcomingCount.toLocaleString("en-IN")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}

function RecentJourneys({ journeys }: { journeys: DashboardJourney[] }) {
  return (
    <section aria-labelledby="dashboard-recent" className="grid gap-2">
      <header className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 id="dashboard-recent" className="text-2xl font-bold">
          Recent journeys
        </h2>
        <ButtonLink
          render={<Link to="/journeys" />}
          variant="link"
          size="sm"
          className="min-h-touch px-0"
        >
          All journeys
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </ButtonLink>
      </header>
      <Card className="control-border py-0">
        <CardContent className="px-1.5">
          {journeys.length ? (
            <ul className="divide-y divide-border">
              {journeys.map((journey) => (
                <li key={journey.id}>
                  <Link
                    to="/journeys/$journeyId"
                    params={{ journeyId: journey.id }}
                    className="group grid min-h-touch grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-control px-3 py-3 hover:bg-muted focus-visible:-outline-offset-2"
                  >
                    <span className="grid min-w-0 items-center gap-x-3 gap-y-1 @min-[48rem]/dashboard:grid-cols-[minmax(0,1fr)_minmax(0,13rem)]">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold underline-offset-4 group-hover:underline">
                          {journey.title}
                        </span>
                        {journey.state === "archived" && (
                          <Badge>Archived</Badge>
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        <JourneySchedule journey={journey} />
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-primary"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-muted-foreground">
              Journeys appear here once their planned start date arrives.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function JourneySchedule({ journey }: { journey: DashboardJourney }) {
  return journey.schedule ? (
    <JourneyDate minute={journey.schedule.intendedStart} />
  ) : (
    "Dates unavailable"
  );
}
