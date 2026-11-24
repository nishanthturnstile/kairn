import type { JourneySchedule, PrivateJourney } from "@kairn/contracts";
import { journeyRoleLabel } from "@kairn/shared/journey-editorial";
import {
  formatJourneyLocalMinute,
  journeyScheduleStatus,
  journeyStatusLabels,
} from "@kairn/shared/journey-time";
import {
  Archive,
  CalendarClock,
  CalendarDays,
  Compass,
  Globe,
  History,
  LockKeyhole,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import "./detail.css";

const statusIcons = {
  active: Compass,
  upcoming: CalendarDays,
  past: History,
  openEnded: CalendarClock,
};

export function JourneyMetadata({
  journey,
  asOf,
  showSchedule,
}: {
  journey: PrivateJourney;
  asOf: number;
  showSchedule?: boolean;
}) {
  const { schedule } = journey;
  const status = schedule && journeyScheduleStatus(schedule, asOf);
  const StatusIcon = status && statusIcons[status];
  const start =
    schedule && formatJourneyLocalMinute(schedule.intendedStart.local);
  const end =
    schedule?.intendedEnd &&
    formatJourneyLocalMinute(schedule.intendedEnd.local);
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold">
      {status && StatusIcon && (
        <li>
          <Badge className="gap-1.5 px-2 py-1">
            <StatusIcon aria-hidden="true" className="size-4 shrink-0" />
            {journeyStatusLabels[status]}
          </Badge>
        </li>
      )}
      <li className="inline-flex items-center gap-1.5 text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
        Private
      </li>
      {showSchedule && (
        <li className="text-muted-foreground">
          <span className="sr-only">Your role </span>
          {journeyRoleLabel(journey.capabilities)}
        </li>
      )}
      {showSchedule && schedule && start && (
        <li className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground">
          <CalendarDays
            aria-hidden="true"
            className="hidden size-4 shrink-0 sm:block"
          />
          <span className="sr-only">Schedule </span>
          <span className="min-w-0 wrap-anywhere">
            <time dateTime={schedule.intendedStart.instant}>
              {start.date}, {start.time}
            </time>
            {end && schedule.intendedEnd && (
              <>
                {" to "}
                <time dateTime={schedule.intendedEnd.instant}>
                  {end.date}, {end.time}
                </time>
              </>
            )}{" "}
            {schedule.timeZone}
          </span>
        </li>
      )}
      {journey.state === "archived" && (
        <li className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Archive aria-hidden="true" className="size-4 shrink-0" />
          Archived
        </li>
      )}
    </ul>
  );
}

export function JourneyOverview({
  journey,
  peopleAction,
}: {
  journey: PrivateJourney;
  peopleAction: ReactNode;
}) {
  const { schedule } = journey;
  return (
    <div className="grid min-w-0 items-start gap-4 @min-[52rem]/journey-detail:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] @min-[52rem]/journey-detail:gap-5">
      <section aria-labelledby="journey-schedule" className="min-w-0">
        <Card className="@container/journey-schedule control-border [--card-spacing:--spacing(4)] @min-[52rem]/journey-detail:[--card-spacing:--spacing(5)]">
          <CardHeader>
            <h2 id="journey-schedule" className="text-xl font-bold">
              Schedule
            </h2>
          </CardHeader>
          <CardContent>
            {schedule ? (
              <dl
                className="journey-schedule"
                data-open-ended={!schedule.intendedEnd}
              >
                <ScheduleStop
                  label="Intended start"
                  minute={schedule.intendedStart}
                />
                <ScheduleStop
                  label="Intended end"
                  minute={schedule.intendedEnd}
                />
                <div className="col-span-full mt-4 flex min-w-0 flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-sm">
                  <dt className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground">
                    <Globe aria-hidden="true" className="size-4 shrink-0" />
                    Time zone
                  </dt>
                  <dd className="min-w-0 font-semibold wrap-anywhere">
                    {schedule.timeZone}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground">Dates unavailable</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="journey-people" className="min-w-0">
        <Card className="control-border bg-accent [--card-spacing:--spacing(4)] @min-[52rem]/journey-detail:[--card-spacing:--spacing(5)]">
          <CardHeader>
            <h2 id="journey-people" className="text-xl font-bold">
              People
            </h2>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <dt className="text-sm font-semibold text-muted-foreground">
                  Your role
                </dt>
                <dd className="font-semibold">
                  {journeyRoleLabel(journey.capabilities)}
                </dd>
              </div>
            </dl>
            {peopleAction}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ScheduleStop({
  label,
  minute,
}: {
  label: "Intended start" | "Intended end";
  minute: JourneySchedule["intendedEnd"];
}) {
  const local = minute && formatJourneyLocalMinute(minute.local);

  return (
    <div
      className="journey-schedule-stop relative grid min-w-0 content-start gap-1"
      data-dated={Boolean(minute)}
    >
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-anywhere">
        {minute && local ? (
          <time dateTime={minute.instant} className="grid gap-0.5">
            <span className="text-2xl font-bold leading-tight tabular-nums">
              {local.date}
            </span>{" "}
            <span className="text-muted-foreground tabular-nums">
              {local.time}
            </span>
          </time>
        ) : (
          <span className="font-semibold text-muted-foreground">
            End date unknown
          </span>
        )}
      </dd>
    </div>
  );
}
