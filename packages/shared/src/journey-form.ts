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
  if (!draft.startDate) errors.startDate = "Enter a start date.";
  if (!draft.startTime) errors.startTime = "Enter a start time.";
  if (draft.endTime && !draft.endDate) errors.endDate = "Enter an end date.";
  if (draft.endDate && !draft.endTime) errors.endTime = "Enter an end time.";
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
      if (path === "intendedStart" && !errors.startDate && !errors.startTime)
        errors.startDate = fieldMessages.startDate;
      if (path === "intendedEnd" && !errors.endDate && !errors.endTime)
        errors.endDate = fieldMessages.endDate;
    }
    return { errors };
  }
  for (const [field, minute] of [
    ["startDate", result.data.intendedStart],
    ["endDate", result.data.intendedEnd],
  ] as const) {
    if (!minute) continue;
    const date = new Date(`${minute}Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 16) !== minute
    )
      errors[field] = fieldMessages[field];
  }
  if (Object.keys(errors).length) return { errors };
  return { input: result.data };
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
