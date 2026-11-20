import { describe, expect, it } from "vite-plus/test";
import { resolveJourneySchedule } from "../packages/backend/src/modules/journeys/schedule";
import { createJourney } from "../packages/contracts/src/journeys";
import {
  canReleaseJourneyAttempt,
  journeyDraft,
  validateJourneyDraft,
} from "../packages/shared/src/journey-form";
import {
  formatJourneyLocalMinute,
  journeyScheduleAsOf,
  journeyScheduleStatus,
} from "../packages/shared/src/journey-time";

const input = {
  title: "Coorg",
  intendedStart: "2026-06-12T09:00",
  timeZone: "Asia/Kolkata",
};

describe("journey form", () => {
  it("reports invalid typed clocks on the time fields alongside valid dates", () => {
    const draft = journeyDraft({ ...input, intendedEnd: "2026-06-13T09:00" });
    expect(
      validateJourneyDraft({ ...draft, startTime: "25:00", endTime: "09:60" }),
    ).toEqual({
      errors: {
        startTime: "Enter a valid start time.",
        endTime: "Enter a valid end time.",
      },
    });
    expect(
      validateJourneyDraft({ ...draft, startDate: "2026-02-29", endTime: "" }),
    ).toEqual({
      errors: {
        startDate: "Enter a valid start date.",
        endTime: "Enter an end time.",
      },
    });
  });

  it("retains the stored attempt when the request is denied before receipt lookup", () => {
    for (const status of [401, 403, 413, 415, 500, 503])
      expect(canReleaseJourneyAttempt(status, [])).toBe(false);
    expect(
      canReleaseJourneyAttempt(400, [{ field: "body", code: "invalid_value" }]),
    ).toBe(false);
    expect(
      canReleaseJourneyAttempt(400, [
        { field: "intendedStart", code: "nonexistent_time" },
      ]),
    ).toBe(true);
  });
});

describe("journey schedule", () => {
  it("keeps web and native detail status on the server timeline boundaries", () => {
    const result = resolveJourneySchedule({
      ...input,
      intendedEnd: "2026-06-12T10:00",
    });
    if (!("schedule" in result) || !result.schedule?.intendedEnd)
      throw new Error("Expected a dated schedule.");
    const schedule = result.schedule;
    const start = Date.parse(schedule.intendedStart.instant);
    const end = Date.parse(result.schedule.intendedEnd.instant);
    const asOf = journeyScheduleAsOf({
      get: (name) =>
        name === "X-Kairn-As-Of" ? "2026-06-12T04:30:00.001Z" : null,
    });

    expect(journeyScheduleStatus(schedule, start - 1)).toBe("upcoming");
    expect(journeyScheduleStatus(schedule, start)).toBe("active");
    expect(journeyScheduleStatus(schedule, end)).toBe("active");
    expect(asOf).toBe(end + 1);
    expect(journeyScheduleStatus(schedule, asOf)).toBe("past");
    const openEnded = { ...schedule, intendedEnd: null };
    expect(journeyScheduleStatus(openEnded, start - 1)).toBe("upcoming");
    expect(journeyScheduleStatus(openEnded, asOf)).toBe("openEnded");
  });

  it.each([
    ["UTC", "2026-06-12T09:00", "+00:00:00", "2026-06-12T09:00:00Z", "+00:00"],
    [
      "America/New_York",
      "2026-01-01T23:45",
      "-05:00:00",
      "2026-01-02T04:45:00Z",
      "-05:00",
    ],
    [
      "America/New_York",
      "2026-06-12T09:00",
      "-04:00",
      "2026-06-12T13:00:00Z",
      "-04:00",
    ],
  ])(
    "resolves %s local time %s with an explicit offset",
    (timeZone, local, startOffset, instant, offset) => {
      expect(
        resolveJourneySchedule({
          ...input,
          timeZone,
          intendedStart: local,
          startOffset,
        }),
      ).toEqual({
        schedule: {
          timeZone,
          intendedStart: { local, instant, offset },
          intendedEnd: null,
        },
      });
    },
  );

  it("keeps the local date and resolves its instant across a UTC date boundary", () => {
    expect(
      resolveJourneySchedule({ ...input, intendedStart: "2026-06-12T00:15" }),
    ).toEqual({
      schedule: {
        timeZone: "Asia/Kolkata",
        intendedStart: {
          local: "2026-06-12T00:15",
          instant: "2026-06-11T18:45:00Z",
          offset: "+05:30",
        },
        intendedEnd: null,
      },
    });
    expect(formatJourneyLocalMinute(input.intendedStart)).toEqual({
      date: "12 Jun 2026",
      time: "9:00 am",
    });
  });

  it.each([
    [
      { intendedStart: "2026-02-29T09:00" },
      "intendedStart",
      "invalid_calendar_date",
    ],
    [
      { intendedEnd: "2026-06-31T09:00" },
      "intendedEnd",
      "invalid_calendar_date",
    ],
    [
      { intendedStart: "0001-01-01T00:00" },
      "intendedStart",
      "date_out_of_range",
    ],
    [
      { intendedStart: "9999-12-31T23:59", timeZone: "Pacific/Niue" },
      "intendedStart",
      "date_out_of_range",
    ],
    [{ timeZone: "Asia/Unknown" }, "timeZone", "unsupported_timezone"],
    [{ endOffset: "+05:30" }, "endOffset", "offset_without_end"],
    [{ startOffset: "+05:00" }, "intendedStart", "invalid_offset"],
    [{ intendedEnd: "2026-06-12T08:59" }, "intendedEnd", "end_before_start"],
    [
      { intendedStart: "2026-03-08T02:30", timeZone: "America/New_York" },
      "intendedStart",
      "nonexistent_time",
    ],
    [
      {
        intendedStart: "2026-03-08T02:30",
        timeZone: "America/New_York",
        startOffset: "-05:00",
      },
      "intendedStart",
      "nonexistent_time",
    ],
    [
      {
        intendedStart: "2026-03-08T01:30",
        intendedEnd: "2026-03-08T02:30",
        timeZone: "America/New_York",
      },
      "intendedEnd",
      "nonexistent_time",
    ],
    [
      { intendedStart: "2026-10-04T02:15", timeZone: "Australia/Lord_Howe" },
      "intendedStart",
      "nonexistent_time",
    ],
    [
      { intendedStart: "2011-12-30T12:00", timeZone: "Pacific/Apia" },
      "intendedStart",
      "nonexistent_time",
    ],
  ])("reports a safe issue for %o", (changes, field, code) => {
    expect(resolveJourneySchedule({ ...input, ...changes })).toEqual({
      issue: { field, code },
    });
  });

  it("allows equal endpoints and resolves a repeated minute with non-hour offset changes", () => {
    const overlapping = {
      ...input,
      intendedStart: "2026-04-05T01:45",
      intendedEnd: "2026-04-05T01:45",
      timeZone: "Australia/Lord_Howe",
    };
    expect(resolveJourneySchedule(overlapping)).toEqual({
      issue: {
        field: "intendedStart",
        code: "ambiguous_time",
        offsets: ["+11:00", "+10:30"],
      },
    });
    expect(
      resolveJourneySchedule({ ...overlapping, startOffset: "+11:00" }),
    ).toEqual({
      issue: {
        field: "intendedEnd",
        code: "ambiguous_time",
        offsets: ["+11:00", "+10:30"],
      },
    });
    expect(
      resolveJourneySchedule({
        ...overlapping,
        startOffset: "+11:00",
        endOffset: "+11:00",
      }),
    ).toMatchObject({
      schedule: {
        intendedStart: { instant: "2026-04-04T14:45:00Z" },
        intendedEnd: { instant: "2026-04-04T14:45:00Z" },
      },
    });
    expect(
      resolveJourneySchedule({
        ...overlapping,
        intendedEnd: "2026-04-05T01:40",
        startOffset: "+11:00",
        endOffset: "+10:30",
      }),
    ).toMatchObject({
      schedule: {
        intendedStart: { instant: "2026-04-04T14:45:00Z" },
        intendedEnd: { instant: "2026-04-04T15:10:00Z" },
      },
    });
    expect(
      resolveJourneySchedule({
        ...overlapping,
        startOffset: "+10:30",
        endOffset: "+11:00",
      }),
    ).toEqual({
      issue: { field: "intendedEnd", code: "end_before_start" },
    });
  });

  it("validates shape before interpreting dates", () => {
    for (const changes of [
      { title: "   " },
      { title: "x".repeat(121) },
      { title: "Coorg\u0000" },
      { intendedStart: "2026-06-12" },
      { intendedStart: "2026-06-12T09:00Z" },
      { intendedEnd: "2026-06-12T24:00" },
      { timeZone: "+05:30" },
      { endOffset: "05:30" },
    ]) {
      expect(createJourney.safeParse({ ...input, ...changes }).success).toBe(
        false,
      );
    }
    expect(
      createJourney.parse({ ...input, intendedEnd: null }).intendedEnd,
    ).toBeNull();
  });
});
