import { describe, expect, it } from "vite-plus/test";
import { resolveJourneySchedule } from "../packages/backend/src/modules/journeys/schedule";
import { createJourney } from "../packages/contracts/src/journeys";
import { formatJourneyLocalMinute } from "../packages/shared/src/journey-time";

const input = {
  title: "Coorg",
  intendedStart: "2026-06-12T09:00",
  timeZone: "Asia/Kolkata",
};

describe("journey schedule", () => {
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
