import {
  createJourneyHeaders,
  membershipRestrictionResult,
  restrictJourneyMembership,
} from "@kairn/contracts/journeys";
import { journeyResult } from "./journey-api";
import type { AccountScope } from "./session";

type Departure = {
  accountId: string;
  journeyId: string;
  membershipGeneration: string;
  key: string;
  expiresAt: number;
};
const storageKey = "kairn.journey-departure";
let fallback: Departure | undefined;

export function readDeparture(
  scope: AccountScope,
  journeyId: string,
): Departure | undefined {
  let value = fallback;
  try {
    const raw = sessionStorage.getItem(storageKey);
    value = raw ? JSON.parse(raw) : undefined;
  } catch {
    // The current tab can retry even when session storage is blocked.
  }
  if (
    value &&
    value.accountId === scope.accountId &&
    value.journeyId === journeyId &&
    value.expiresAt > Date.now() &&
    createJourneyHeaders.safeParse({ "idempotency-key": value.key }).success &&
    restrictJourneyMembership.safeParse({
      membershipGeneration: value.membershipGeneration,
    }).success
  ) {
    return value;
  }
}

export function saveDeparture(
  accountId: string,
  journeyId: string,
  membershipGeneration: string,
  key: string,
) {
  const value = {
    accountId,
    journeyId,
    membershipGeneration,
    key,
    expiresAt: Date.now() + 24 * 60 * 60_000,
  };
  fallback = value;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {}
  return value;
}

export function clearDeparture(scope: AccountScope, attempt: Departure) {
  if (readDeparture(scope, attempt.journeyId)?.key !== attempt.key) return;
  fallback = undefined;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {}
}

export async function sendDeparture(
  scope: AccountScope,
  attempt: Departure,
  refresh: (scope: AccountScope) => void,
  signal: AbortSignal,
) {
  const result = await scope.api.POST("/api/v1/journeys/{journeyId}/leave", {
    params: {
      path: { journeyId: attempt.journeyId },
      header: { "idempotency-key": attempt.key },
    },
    body: { membershipGeneration: attempt.membershipGeneration },
    signal,
  });
  signal.throwIfAborted();
  return membershipRestrictionResult.parse(
    journeyResult(result, scope, refresh),
  ).confirmation;
}

export function departureNoticeKey(scope: AccountScope) {
  return [scope.accountId, "departure-notice"];
}
