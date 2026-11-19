import { journeyPath } from "@kairn/contracts/journeys";

const storageKey = "kairn.journey-sign-in-return";

export function journeyReturnTo(
  value: unknown,
): "/journeys" | `/journeys/${string}` | undefined {
  if (value === "/journeys") return value;
  if (typeof value !== "string" || !value.startsWith("/journeys/")) return;
  const result = journeyPath.safeParse({
    journeyId: value.slice("/journeys/".length),
  });
  if (result.success) return `/journeys/${result.data.journeyId}` as const;
}

export function savedJourneyReturnTo() {
  try {
    return journeyReturnTo(sessionStorage.getItem(storageKey));
  } catch {
    return undefined;
  }
}

export function saveJourneyReturnTo(value: ReturnType<typeof journeyReturnTo>) {
  try {
    if (value) sessionStorage.setItem(storageKey, value);
    else sessionStorage.removeItem(storageKey);
  } catch {
    // The validated URL still carries the return target when storage is blocked.
  }
}
