import type { journeyCapabilities, journeyMemberships } from "./schema.js";

export interface Actor {
  accountId: string;
  restrictedAt: Date | null;
}

type Capability = typeof journeyCapabilities.$inferSelect.capability;

export type Membership = Pick<
  typeof journeyMemberships.$inferSelect,
  "accountId" | "journeyId" | "revokedAt"
> & { capabilities: readonly Capability[] };

// Domain operations must supply the authenticated actor and current scoped rows.
export function journeyAccess(
  actor: Actor,
  journeyId: string,
  membership?: Membership,
) {
  const currentMembership =
    actor.restrictedAt === null &&
    membership?.accountId === actor.accountId &&
    membership.journeyId === journeyId &&
    membership.revokedAt === null
      ? membership
      : undefined;

  const administrator =
    currentMembership?.capabilities.includes("administrator") ?? false;
  const coauthor =
    currentMembership?.capabilities.includes("coauthor") ?? false;
  const publisher =
    currentMembership?.capabilities.includes("publisher") ?? false;

  return {
    isActiveMember: currentMembership !== undefined,
    canManageJourney: administrator,
    canReadDraft: coauthor || publisher,
    canEditDraft: coauthor,
    canApprovePublication: publisher,
    canAuthorizeJourneyDeletion: administrator && publisher,
  };
}
