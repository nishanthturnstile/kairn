import {
  journeyPath,
  restrictJourneyMembership,
} from "@kairn/contracts/journeys";
import * as SecureStore from "expo-secure-store";
import { authOrigin } from "./auth";
import { sessionStoragePrefix } from "./auth-origin";
import type { VerifiedMobileScope } from "./session";

export type MembershipAttempt = {
  type: "leave" | "remove";
  key: string;
  memberId: string;
  membershipGeneration: string;
  expiresAt: number;
};
export const departureKey = ["journey-departure"] as const;
export const membershipAttemptLifetime = 24 * 60 * 60_000;
const options = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function key(scope: VerifiedMobileScope, journeyId: string) {
  return (
    authOrigin &&
    `${sessionStoragePrefix(authOrigin)}_restriction_${scope.accountId}_${journeyId}`
  );
}

export function readMembershipAttempt(
  scope: VerifiedMobileScope,
  journeyId: string,
): MembershipAttempt | undefined {
  const storageKey = key(scope, journeyId);
  if (!storageKey) return;
  try {
    const raw = SecureStore.getItem(storageKey, options);
    if (!raw) return;
    const attempt = JSON.parse(raw);
    const now = Date.now();
    if (
      ((attempt.type === "leave" && attempt.memberId === scope.accountId) ||
        (attempt.type === "remove" && attempt.memberId !== scope.accountId)) &&
      journeyPath.safeParse({ journeyId: attempt.key }).success &&
      journeyPath.safeParse({ journeyId: attempt.memberId }).success &&
      restrictJourneyMembership.safeParse({
        membershipGeneration: attempt.membershipGeneration,
      }).success &&
      Number.isFinite(attempt.expiresAt) &&
      attempt.expiresAt > now &&
      attempt.expiresAt <= now + membershipAttemptLifetime
    )
      return attempt;
    SecureStore.setItem(storageKey, "", options);
  } catch {
    return undefined;
  }
}

export function saveMembershipAttempt(
  scope: VerifiedMobileScope,
  journeyId: string,
  value?: MembershipAttempt,
) {
  const storageKey = key(scope, journeyId);
  if (!storageKey) return;
  if (value) SecureStore.setItem(storageKey, JSON.stringify(value), options);
  else {
    try {
      SecureStore.setItem(storageKey, "", options);
    } catch {
      /* The previous receipt can be retried safely. */
    }
  }
}
