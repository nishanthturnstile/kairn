import { describe, expect, it } from "vite-plus/test";
import {
  journeyAccess,
  type Membership,
} from "../packages/backend/src/modules/journeys/permissions";
import {
  canExportGrantedOriginal,
  sourceAccess,
} from "../packages/backend/src/modules/sources/permissions";

const now = new Date("2026-11-18T00:00:00Z");
const journeyId = "journey";
const source = { id: "source", ownerId: "owner", deletedAt: null };
const publicationGrant = {
  journeyId,
  sourceId: source.id,
  ownerId: source.ownerId,
  scope: "publication_reuse",
  revision: 2,
  withdrawnAt: null,
} as const;
const reviewGrant = { ...publicationGrant, scope: "journey_review" } as const;

const scenarios = [
  {
    accountId: "participant",
    capabilities: [],
    revokedAt: null,
    allowed: ["isActiveMember"],
  },
  {
    accountId: "coauthor",
    capabilities: ["coauthor"],
    revokedAt: null,
    allowed: [
      "canEditDraft",
      "canReadDraft",
      "canReadReview",
      "isActiveMember",
    ],
  },
  {
    accountId: "publisher",
    capabilities: ["publisher"],
    revokedAt: null,
    allowed: [
      "canApprovePublication",
      "canApproveSourceReuse",
      "canReadDraft",
      "canReadReview",
      "isActiveMember",
    ],
  },
  {
    accountId: "administrator",
    capabilities: ["administrator"],
    revokedAt: null,
    allowed: ["canManageJourney", "isActiveMember"],
  },
  {
    accountId: "owner",
    capabilities: [],
    revokedAt: null,
    allowed: [
      "canManageSourceGrant",
      "canReadOriginal",
      "canReadReview",
      "isActiveMember",
    ],
  },
  {
    accountId: "revoked",
    capabilities: ["coauthor", "publisher"],
    revokedAt: now,
    allowed: [],
  },
] as const;

describe("foundational journey and source permissions", () => {
  it.each(scenarios)(
    "applies the capability matrix for $accountId",
    ({ accountId, capabilities, revokedAt, allowed }) => {
      const actor = { accountId, restrictedAt: null };
      const membership: Membership = {
        journeyId,
        accountId,
        capabilities,
        revokedAt,
      };
      const journey = journeyAccess(actor, journeyId, membership);
      const access = sourceAccess({
        actor,
        journeyId,
        membership,
        source,
        sourceGrant: publicationGrant,
      });
      expect(
        Object.entries({ ...journey, ...access })
          .filter(([, permitted]) => permitted)
          .map(([permission]) => permission)
          .sort(),
      ).toEqual(allowed);
    },
  );

  it("limits review and publication to their current grant and journey", () => {
    const actor = { accountId: "publisher", restrictedAt: null };
    const membership: Membership = {
      accountId: actor.accountId,
      journeyId,
      capabilities: ["publisher"],
      revokedAt: null,
    };
    const context = { actor, journeyId, membership, source };

    expect(
      sourceAccess({ ...context, sourceGrant: reviewGrant }),
    ).toMatchObject({ canReadReview: true, canApproveSourceReuse: false });
    expect(sourceAccess(context).canReadReview).toBe(false);
    expect(
      sourceAccess({
        ...context,
        sourceGrant: { ...publicationGrant, withdrawnAt: now },
      }).canReadReview,
    ).toBe(false);
    expect(
      sourceAccess({
        ...context,
        sourceGrant: { ...publicationGrant, journeyId: "other-journey" },
      }).canReadReview,
    ).toBe(false);
    expect(
      journeyAccess(actor, "other-journey", membership).canApprovePublication,
    ).toBe(false);
    expect(
      journeyAccess(actor, journeyId, {
        ...membership,
        accountId: "other-account",
      }).canApprovePublication,
    ).toBe(false);
    expect(
      journeyAccess({ ...actor, restrictedAt: now }, journeyId, membership)
        .canApprovePublication,
    ).toBe(false);
  });

  it("preserves personal access when a source owner leaves the journey", () => {
    const actor = { accountId: source.ownerId, restrictedAt: null };
    const membership: Membership = {
      accountId: actor.accountId,
      journeyId,
      capabilities: ["coauthor", "publisher"],
      revokedAt: now,
    };
    expect(sourceAccess({ actor, journeyId, membership, source })).toEqual({
      canReadOriginal: true,
      canManageSourceGrant: true,
      canReadReview: true,
      canApproveSourceReuse: false,
    });
  });
});

it("checks recipient, exact asset, active membership, expiry, and source revision for original exports", () => {
  const actor = { accountId: "recipient", restrictedAt: null };
  const membership: Membership = {
    accountId: actor.accountId,
    journeyId,
    revokedAt: null,
    capabilities: [],
  };
  const asset = { id: "asset", sourceId: source.id, deletedAt: null };
  const exportGrant = {
    id: "export-grant",
    journeyId,
    ownerId: source.ownerId,
    recipientId: actor.accountId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 1000),
    revokedAt: null,
  };
  const selection = {
    grantId: exportGrant.id,
    journeyId,
    ownerId: source.ownerId,
    assetId: asset.id,
    sourceId: source.id,
    sourceGrantRevision: publicationGrant.revision,
  };
  const context = {
    now,
    actor,
    membership,
    journeyId,
    source,
    sourceGrant: publicationGrant,
    asset,
    exportGrant,
    selection,
  };

  expect(canExportGrantedOriginal(context)).toBe(true);
  for (const variation of [
    { sourceGrant: undefined },
    { sourceGrant: { ...reviewGrant, revision: 3 } },
    { sourceGrant: { ...publicationGrant, withdrawnAt: now } },
    { membership: { ...membership, revokedAt: now } },
    { exportGrant: { ...exportGrant, recipientId: "different-recipient" } },
    { exportGrant: { ...exportGrant, revokedAt: now } },
    { now: exportGrant.expiresAt },
    { asset: { ...asset, deletedAt: now } },
    { asset: { ...asset, id: "different-asset" } },
    { selection: { ...selection, journeyId: "different-journey" } },
  ]) {
    expect(
      canExportGrantedOriginal({ ...context, ...variation }),
      Object.keys(variation).join(", "),
    ).toBe(false);
  }
});
