import type { JourneySchedule } from "@kairn/contracts";

export const journeyStatusLabels = {
  active: "Active now",
  upcoming: "Upcoming",
  past: "Past journey",
  openEnded: "Open-ended",
} as const;

export function journeyScheduleStatus(schedule: JourneySchedule, asOf: number) {
  if (Date.parse(schedule.intendedStart.instant) > asOf) return "upcoming";
  if (!schedule.intendedEnd) return "openEnded";
  return Date.parse(schedule.intendedEnd.instant) < asOf ? "past" : "active";
}

export function journeyScheduleAsOf(headers: {
  get(name: string): string | null;
}) {
  const instant = Date.parse(headers.get("X-Kairn-As-Of") ?? "");
  return Number.isFinite(instant) ? instant : Date.now();
}

const journeyDateFormat = new Intl.DateTimeFormat("en-IN", {
  calendar: "gregory",
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const journeyTimeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatJourneyLocalMinute(local: string) {
  // Give Intl a fixed reference zone so it displays the recorded wall time.
  const displayDate = new Date(`${local}Z`);
  return {
    date: journeyDateFormat.format(displayDate),
    time: journeyTimeFormat
      .format(displayDate)
      .replace(/\s+/g, " ")
      .toLowerCase(),
  };
}
