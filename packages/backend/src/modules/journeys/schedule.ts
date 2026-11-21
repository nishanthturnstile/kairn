import { Temporal } from "temporal-polyfill";

interface ScheduleInput {
  intendedStart: string;
  intendedEnd?: string | null;
  timeZone: string;
  startOffset?: string;
  endOffset?: string;
}

type MinuteIssue =
  | {
      code:
        | "invalid_calendar_date"
        | "nonexistent_time"
        | "invalid_offset"
        | "date_out_of_range";
    }
  | { code: "ambiguous_time"; offsets: [string, string] };

type MinuteResult =
  | { value: { local: string; instant: string; offset: string } }
  | { issue: MinuteIssue };

function resolveMinute(
  local: string,
  timeZone: string,
  offset?: string,
): MinuteResult {
  let minute: Temporal.PlainDateTime;
  try {
    minute = Temporal.PlainDateTime.from(local);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { issue: { code: "invalid_calendar_date" } };
  }

  const earlier = minute.toZonedDateTime(timeZone, {
    disambiguation: "earlier",
  });
  const later = minute.toZonedDateTime(timeZone, { disambiguation: "later" });
  if (!earlier.toPlainDateTime().equals(minute)) {
    return { issue: { code: "nonexistent_time" } };
  }
  if (offset === undefined && !earlier.equals(later)) {
    return {
      issue: {
        code: "ambiguous_time",
        offsets: [earlier.offset, later.offset],
      },
    };
  }

  // Treat an explicitly supplied zero seconds component as the same offset.
  const selectedOffset = offset?.replace(/^(.*:\d{2}):00$/, "$1");
  const selected = selectedOffset === later.offset ? later : earlier;
  if (selectedOffset !== undefined && selectedOffset !== selected.offset) {
    return { issue: { code: "invalid_offset" } };
  }
  const instant = selected.toInstant().toString();
  if (!/^(?!0000)\d{4}-/.test(instant)) {
    return { issue: { code: "date_out_of_range" } };
  }
  return { value: { local, instant, offset: selected.offset } };
}

export function resolveJourneySchedule(input: ScheduleInput) {
  const { intendedStart, intendedEnd, timeZone, startOffset, endOffset } =
    input;
  try {
    // Intl checks the server's zone data without changing the submitted name.
    new Intl.DateTimeFormat("en", { timeZone });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      issue: { field: "timeZone", code: "unsupported_timezone" },
    } as const;
  }

  const start = resolveMinute(intendedStart, timeZone, startOffset);
  if ("issue" in start) {
    return { issue: { field: "intendedStart", ...start.issue } } as const;
  }
  if (intendedEnd == null) {
    if (endOffset !== undefined) {
      return {
        issue: { field: "endOffset", code: "offset_without_end" },
      } as const;
    }
    return {
      schedule: { timeZone, intendedStart: start.value, intendedEnd: null },
    };
  }

  const end = resolveMinute(intendedEnd, timeZone, endOffset);
  if ("issue" in end) {
    return { issue: { field: "intendedEnd", ...end.issue } } as const;
  }
  if (end.value.instant < start.value.instant) {
    return {
      issue: { field: "intendedEnd", code: "end_before_start" },
    } as const;
  }
  return {
    schedule: { timeZone, intendedStart: start.value, intendedEnd: end.value },
  };
}
