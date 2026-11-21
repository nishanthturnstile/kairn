import type { JourneySchedule } from "@kairn/contracts";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";

export function JourneyDate({
  minute,
}: {
  minute: JourneySchedule["intendedStart"];
}) {
  const { date, time } = formatJourneyLocalMinute(minute.local);
  return (
    <time dateTime={minute.instant}>
      {date} · {time}
    </time>
  );
}
