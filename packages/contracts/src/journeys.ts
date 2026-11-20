import { cursorPage, cursorQuery } from "@kairn/sync-protocol";
import { z } from "zod";

const localMinute = z
  .string()
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/);
const utcOffset = z
  .string()
  .regex(/^[+-](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const timeZone = z
  .string()
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/);

export const createJourney = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((title) => !title.includes("\u0000")),
    intendedStart: localMinute,
    intendedEnd: localMinute.nullish(),
    timeZone,
    startOffset: utcOffset.optional(),
    endOffset: utcOffset.optional(),
  })
  .meta({ id: "CreateJourneyV1" });

export const journeyHeaders = z.object({
  "x-expected-account": z.uuid().optional(),
});
export const createJourneyHeaders = journeyHeaders.extend({
  "idempotency-key": z.uuid(),
});
export const journeyPath = z.object({ journeyId: z.uuid() });
export const createdJourney = z
  .object({ id: z.uuid() })
  .meta({ id: "CreatedJourneyV1" });

export const journeyTimelineSections = [
  "active",
  "upcoming",
  "past",
  "incomplete",
] as const;
export type JourneyTimelineSection = (typeof journeyTimelineSections)[number];

export const historySection = z.enum([...journeyTimelineSections, "recent"]);
export const journeyHistoryQuery = cursorQuery
  .pick({ cursor: true })
  .extend({
    section: historySection.optional(),
    view: z.literal("timeline").optional(),
  })
  .strict()
  .refine(
    ({ section, cursor, view }) =>
      (section === undefined) === (cursor === undefined) &&
      (view === undefined || cursor === undefined),
    {
      path: ["cursor"],
    },
  );

const resolvedMinute = z.object({
  local: localMinute,
  instant: z.iso.datetime(),
  offset: utcOffset,
});
const journeySchedule = z.object({
  timeZone,
  intendedStart: resolvedMinute,
  intendedEnd: resolvedMinute.nullable(),
});
export const privateJourney = createdJourney
  .extend({
    title: z.string(),
    state: z.enum(["draft", "archived"]),
    schedule: journeySchedule.nullable(),
    capabilities: z.array(z.enum(["administrator", "coauthor", "publisher"])),
  })
  .meta({ id: "PrivateJourneyV1" });

const dashboardJourney = privateJourney
  .omit({ capabilities: true })
  .meta({ id: "DashboardJourneyV1" });
export const dashboardSummary = z
  .object({
    asOf: z.iso.datetime(),
    journeyCount: z.int().nonnegative(),
    upcomingCount: z.int().nonnegative(),
    nextJourney: z.union([dashboardJourney, z.null()]),
    recentJourneys: z.array(dashboardJourney).max(3),
  })
  .meta({ id: "DashboardSummaryV1" });

const historyPage = cursorPage
  .extend({ items: z.array(privateJourney) })
  .meta({ id: "JourneyHistoryPageV1" });
const initialJourneyHistory = z
  .object({
    asOf: z.iso.datetime(),
    upcoming: historyPage,
    recent: historyPage,
  })
  .meta({ id: "InitialJourneyHistoryV1" });
const journeyTimeline = z
  .object({
    asOf: z.iso.datetime(),
    timeline: z.object({
      active: historyPage,
      upcoming: historyPage,
      past: historyPage,
      incomplete: historyPage,
    }),
  })
  .meta({ id: "JourneyTimelineV1" });
const continuedJourneyHistory = z
  .object({
    asOf: z.iso.datetime(),
    section: historySection,
    page: historyPage,
  })
  .meta({ id: "ContinuedJourneyHistoryV1" });
export const journeyHistory = z.union([
  initialJourneyHistory,
  journeyTimeline,
  continuedJourneyHistory,
]);

export const journeyInputField = z.enum([
  "body",
  "title",
  "intendedStart",
  "intendedEnd",
  "timeZone",
  "startOffset",
  "endOffset",
  "idempotency-key",
  "x-expected-account",
  "cursor",
  "section",
  "journeyId",
]);
export const journeyInputIssue = z.union([
  z.object({
    field: journeyInputField,
    code: z.enum([
      "invalid_value",
      "invalid_calendar_date",
      "unsupported_timezone",
      "nonexistent_time",
      "invalid_offset",
      "offset_without_end",
      "date_out_of_range",
      "end_before_start",
      "invalid_cursor",
    ]),
  }),
  z.object({
    field: z.enum(["intendedStart", "intendedEnd"]),
    code: z.literal("ambiguous_time"),
    offsets: z.tuple([utcOffset, utcOffset]),
  }),
]);

export type CreateJourney = z.infer<typeof createJourney>;
export type JourneySchedule = z.infer<typeof journeySchedule>;
export type JourneyInputField = z.infer<typeof journeyInputField>;
export type JourneyInputIssue = z.infer<typeof journeyInputIssue>;
export type JourneyHistoryQuery = z.infer<typeof journeyHistoryQuery>;
export type JourneyHistory = z.infer<typeof journeyHistory>;
export type PrivateJourney = z.infer<typeof privateJourney>;
export type DashboardJourney = z.infer<typeof dashboardJourney>;
export type DashboardSummary = z.infer<typeof dashboardSummary>;
