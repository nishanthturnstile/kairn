import type { CreateJourney, JourneyInputIssue } from "@kairn/contracts";
import { createJourney } from "@kairn/contracts/journeys";

export function journeyDraft(input?: CreateJourney) {
  return {
    title: input?.title ?? "",
    startDate: input?.intendedStart.slice(0, 10) ?? "",
    startTime: input?.intendedStart.slice(11) ?? "",
    endDate: input?.intendedEnd?.slice(0, 10) ?? "",
    endTime: input?.intendedEnd?.slice(11) ?? "",
    timeZone:
      input?.timeZone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC",
    startOffset: input?.startOffset ?? "",
    endOffset: input?.endOffset ?? "",
  };
}

export type JourneyDraft = ReturnType<typeof journeyDraft>;
export type JourneyField = keyof JourneyDraft;
export type FieldErrors = Partial<Record<JourneyField, string>>;
export type OffsetChoices = Partial<
  Record<"startOffset" | "endOffset", [string, string]>
>;

export const fieldOrder: JourneyField[] = [
  "title",
  "startDate",
  "startTime",
  "startOffset",
  "endDate",
  "endTime",
  "endOffset",
  "timeZone",
];

const fieldMessages: FieldErrors = {
  title: "Enter a title of 1 to 120 characters.",
  startDate: "Enter a valid start date.",
  startTime: "Enter a valid start time.",
  endDate: "Enter a valid end date.",
  endTime: "Enter a valid end time.",
  timeZone: "Enter an IANA timezone, such as Asia/Kolkata.",
};

export function validateJourneyDraft(draft: JourneyDraft) {
  const errors: FieldErrors = {};
  for (const part of ["start", "end"] as const) {
    const dateField = `${part}Date` as const;
    const timeField = `${part}Time` as const;
    const date = draft[dateField];
    const time = draft[timeField];
    if (part === "end" && !date && !time) continue;
    if (!date)
      errors[dateField] =
        `Enter ${part === "start" ? "a" : "an"} ${part} date.`;
    else if (!isCalendarDate(date))
      errors[dateField] = fieldMessages[dateField];
    if (!time)
      errors[timeField] =
        `Enter ${part === "start" ? "a" : "an"} ${part} time.`;
    else if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
      errors[timeField] = fieldMessages[timeField];
  }
  const result = createJourney.safeParse({
    title: draft.title,
    intendedStart: `${draft.startDate}T${draft.startTime}`,
    intendedEnd:
      draft.endDate || draft.endTime
        ? `${draft.endDate}T${draft.endTime}`
        : null,
    timeZone: draft.timeZone.trim(),
    startOffset: draft.startOffset || undefined,
    endOffset: draft.endOffset || undefined,
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path[0];
      if (path === "title" || path === "timeZone")
        errors[path] = fieldMessages[path];
      if (path === "startOffset" || path === "endOffset")
        errors[path === "startOffset" ? "startTime" : "endTime"] =
          "Choose a valid time occurrence.";
    }
    return { errors };
  }
  if (Object.keys(errors).length) return { errors };
  return { input: result.data };
}

function isCalendarDate(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function canReleaseJourneyAttempt(
  status: number,
  issues: JourneyInputIssue[],
) {
  // Request validation and origin failures can happen before receipt lookup.
  return (
    status === 404 ||
    status === 409 ||
    (status === 400 &&
      issues.some(
        ({ code }) => code !== "invalid_value" && code !== "invalid_cursor",
      ))
  );
}

export function journeyFormIssues(issues: JourneyInputIssue[]) {
  const errors: FieldErrors = {};
  const choices: OffsetChoices = {};
  for (const issue of issues) {
    if (issue.code === "ambiguous_time") {
      const field =
        issue.field === "intendedStart" ? "startOffset" : "endOffset";
      choices[field] = issue.offsets;
      errors[field] = "Choose which occurrence you meant.";
    } else if (
      issue.field === "intendedStart" ||
      issue.field === "intendedEnd"
    ) {
      const start = issue.field === "intendedStart";
      if (issue.code === "end_before_start")
        errors.endTime = "Choose an end time on or after the start.";
      else if (issue.code === "nonexistent_time")
        errors[start ? "startTime" : "endTime"] =
          "This time does not occur in this timezone. Choose another time.";
      else if (issue.code === "invalid_offset")
        errors[start ? "startTime" : "endTime"] =
          "Enter a time again to choose a valid occurrence.";
      else errors[start ? "startDate" : "endDate"] = "Enter a valid date.";
    } else if (issue.field === "title" || issue.field === "timeZone") {
      errors[issue.field] = fieldMessages[issue.field];
    } else if (issue.field === "startOffset" || issue.field === "endOffset") {
      errors[issue.field === "startOffset" ? "startTime" : "endTime"] =
        "Choose a valid time.";
    }
  }
  return { errors, choices };
}
