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
const journeyCapability = z.enum(["administrator", "coauthor", "publisher"]);
export const editorialCapability = z.enum(["coauthor", "publisher"]);
export type EditorialCapability = z.infer<typeof editorialCapability>;
const editorialRevision = z.int().min(0).max(2_147_483_647);
export const privateJourney = createdJourney
  .extend({
    title: z.string(),
    state: z.enum(["draft", "archived"]),
    schedule: journeySchedule.nullable(),
    capabilities: z.array(journeyCapability),
  })
  .meta({ id: "PrivateJourneyV1" });

const journeyPageCursor = z.uuid();
export const journeyPageQuery = z.strictObject({
  cursor: journeyPageCursor.optional(),
});

const journeyPerson = z
  .object({
    accountId: z.uuid(),
    membershipGeneration: z.uuid(),
    editorialRevisions: z
      .object({
        coauthor: editorialRevision,
        publisher: editorialRevision,
      })
      .optional(),
    displayName: z.string(),
    capabilities: z.array(journeyCapability),
  })
  .meta({ id: "JourneyPersonV1" });
export const invitableJourney = privateJourney
  .pick({ id: true, title: true, schedule: true })
  .meta({ id: "InvitableJourneyV1" });

export const journeyPeoplePage = z
  .object({
    items: z.array(journeyPerson),
    nextCursor: journeyPageCursor.nullable(),
  })
  .meta({ id: "JourneyPeoplePageV1" });
export const invitableJourneysPage = journeyPeoplePage
  .extend({ items: z.array(invitableJourney) })
  .meta({ id: "InvitableJourneysPageV1" });

export const journeyMemberPath = journeyPath.extend({ memberId: z.uuid() });
export const journeySourcePath = journeyPath.extend({ sourceId: z.uuid() });
const sourceGrantRevision = z.int().min(0).max(2_147_483_647);
export const updateSourceReview = z
  .discriminatedUnion("action", [
    z.strictObject({
      action: z.literal("share"),
      expectedRevision: sourceGrantRevision,
    }),
    z.strictObject({
      action: z.literal("withdraw"),
      expectedRevision: sourceGrantRevision.min(1),
    }),
    z.strictObject({
      action: z.literal("allow_publication_reuse"),
      expectedRevision: sourceGrantRevision,
      consent: z
        .literal("members_unlisted_public_v1")
        .describe(
          "The owner explicitly allows this source in approved publications and shares of this journey. Designated publishers can choose members-only, unlisted, or public visibility.",
        ),
    }),
    z.strictObject({
      action: z.literal("narrow_to_review"),
      expectedRevision: sourceGrantRevision.min(1),
    }),
  ])
  .meta({ id: "UpdateSourceReviewV1" });
export const journeySourceReview = z
  .object({
    sourceId: z.uuid(),
    scope: z.enum(["only_me", "journey_review", "publication_reuse"]),
    revision: sourceGrantRevision,
  })
  .meta({ id: "JourneySourceReviewV1" });
export const sourceReviewWithdrawal = z
  .object({
    eventId: z.uuid(),
    revision: sourceGrantRevision.min(2),
    confirmation: z.enum(["confirmed", "pending"]),
  })
  .meta({ id: "SourceReviewWithdrawalV1" });
export const sourceReviewNarrowing = sourceReviewWithdrawal
  .extend({
    scope: z.literal("journey_review"),
  })
  .meta({ id: "SourceReviewNarrowingV1" });
export const originalExportPath = journeyPath.extend({ grantId: z.uuid() });
export const originalExportMetadataNotice =
  "Original files can include private metadata omitted from published versions. People can keep copies they download.";
const originalExportSelection = z.object({
  assetIds: z.array(z.uuid()),
  expiresAt: z.iso.datetime({ precision: 3 }),
});
export const requestOriginalExport = z
  .strictObject({
    ownerId: z.uuid(),
    assetIds: originalExportSelection.shape.assetIds.min(1).max(50),
    expiresAt: z.iso
      .datetime({ offset: true })
      .describe(
        "A future timestamp normalized to UTC at millisecond precision.",
      ),
  })
  .meta({ id: "RequestOriginalExportV1" });
export const decideOriginalExport = z
  .discriminatedUnion("decision", [
    z.strictObject({
      decision: z.literal("approve"),
      metadataAcknowledged: z
        .literal(true)
        .describe(originalExportMetadataNotice),
    }),
    z.strictObject({ decision: z.literal("decline") }),
  ])
  .meta({ id: "DecideOriginalExportV1" });
export const originalExportAuthorization = originalExportSelection
  .extend({ grantId: z.uuid() })
  .meta({ id: "OriginalExportAuthorizationV1" });
export const originalExportRequest = originalExportAuthorization
  .extend({
    ownerId: z.uuid(),
    recipient: z.object({ accountId: z.uuid(), displayName: z.string() }),
    state: z.enum([
      "pending",
      "approved",
      "declined",
      "expired",
      "revoked",
      "unavailable",
    ]),
    metadataNotice: z.literal(originalExportMetadataNotice),
  })
  .meta({ id: "OriginalExportRequestV1" });
export const originalExportPage = z
  .object({
    items: z.array(originalExportRequest),
    nextCursor: journeyPageCursor.nullable(),
  })
  .meta({ id: "OriginalExportPageV1" });
export const restrictJourneyMembership = z
  .strictObject({
    membershipGeneration: z.uuid(),
  })
  .meta({ id: "RestrictJourneyMembershipV1" });
export const membershipRestrictionResult = z
  .object({
    eventId: z.uuid(),
    confirmation: z.enum(["confirmed", "pending"]),
  })
  .meta({ id: "MembershipRestrictionResultV1" });
export const updateEditorialCapability = z
  .strictObject({
    membershipGeneration: z.uuid(),
    capability: editorialCapability,
    expectedRevision: editorialRevision,
    enabled: z.boolean(),
  })
  .meta({ id: "UpdateEditorialCapabilityV1" });
export type UpdateEditorialCapability = z.infer<
  typeof updateEditorialCapability
>;
export const editorialCapabilityRemoval = membershipRestrictionResult
  .extend({
    enabled: z.literal(false),
    revision: editorialRevision,
  })
  .meta({ id: "EditorialCapabilityRemovalV1" });
export const editorialCapabilityResult = z
  .union([
    z.object({ enabled: z.literal(true), revision: editorialRevision }),
    editorialCapabilityRemoval,
  ])
  .meta({ id: "EditorialCapabilityResultV1" });

const invitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const continuationHandle = z
  .string()
  .min(60)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);
export const journeyInvitationPath = journeyPath.extend({
  invitationId: z.uuid(),
});
const inviteeSelection = z
  .string()
  .min(60)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/);
export const invitationEmail = z.email().max(254);
export const invitationRecipient = z.union([
  z.strictObject({ email: z.string().max(254) }),
  z.strictObject({ selection: inviteeSelection }),
]);
export const issueJourneyInvitations = z
  .union([
    z.strictObject({ emails: z.array(z.string().max(254)).min(1).max(10) }),
    z.strictObject({ recipients: z.array(invitationRecipient).min(1).max(10) }),
  ])
  .meta({ id: "IssueJourneyInvitationsV1" });
export const searchJourneyInvitees = z.strictObject({
  query: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .refine((value) => !value.includes("\u0000")),
});
export const journeyInviteeMatches = z
  .object({
    items: z.array(
      z.object({
        displayName: z.string(),
        selection: inviteeSelection,
        ambiguous: z.boolean(),
      }),
    ),
  })
  .meta({ id: "JourneyInviteeMatchesV1" });
export const journeyInvitationBatchResult = z
  .object({
    items: z.array(
      z.union([
        z.object({
          status: z.enum(["queued", "cancelled"]),
          invitationId: z.uuid(),
        }),
        z.object({
          status: z.enum([
            "invalid_email",
            "duplicate",
            "already_member",
            "already_pending",
            "rate_limited",
          ]),
        }),
      ]),
    ),
  })
  .meta({ id: "JourneyInvitationBatchResultV1" });
export const journeyInvitationPage = z
  .object({
    items: z.array(
      z.object({
        id: z.uuid(),
        email: z.email().optional(),
        displayName: z.string().optional(),
        expiresAt: z.iso.datetime(),
        decision: z.enum(["pending", "expired"]),
        delivery: z.enum(["queued", "sent", "failed", "expired"]),
      }),
    ),
    nextCursor: journeyPageCursor.nullable(),
  })
  .meta({ id: "JourneyInvitationPageV1" });

export const exchangeJourneyInvitation = z.strictObject({
  token: invitationToken,
});
export const journeyInvitationContinuation = z
  .object({
    continuation: continuationHandle,
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "JourneyInvitationContinuationV1" });
export const reviewJourneyInvitation = z.strictObject({
  continuation: continuationHandle,
});
export const journeyInvitationReview = z
  .union([
    z.object({
      state: z.literal("ready"),
      title: z.string(),
      inviter: z.string(),
      expiresAt: z.iso.datetime(),
      scope: z.literal("participant"),
      schedule: journeySchedule.nullable(),
      continuation: continuationHandle,
    }),
    z.object({ state: z.literal("joined"), journeyId: z.uuid() }),
    z.object({
      state: z.enum(["wrong_account", "unavailable", "expired", "cancelled"]),
    }),
  ])
  .meta({ id: "JourneyInvitationReviewV1" });
export const journeyInvitationOperation = z.strictObject({
  operationId: z.uuid(),
});
export const acceptJourneyInvitation = reviewJourneyInvitation.extend(
  journeyInvitationOperation.shape,
);

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
  "memberId",
  "membershipGeneration",
  "invitationId",
  "emails",
  "query",
  "recipients",
  "continuation",
  "operationId",
  "token",
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
export type JourneyPeoplePage = z.infer<typeof journeyPeoplePage>;
export type InvitableJourneysPage = z.infer<typeof invitableJourneysPage>;
export type DashboardJourney = z.infer<typeof dashboardJourney>;
export type DashboardSummary = z.infer<typeof dashboardSummary>;
