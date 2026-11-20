import { journeyPath } from "@kairn/contracts/journeys";

const storageKey = "kairn.workspace-sign-in-return";
const lifetime = 24 * 60 * 60 * 1000;
type ReturnTarget =
  | "/journeys"
  | "/journeys/new"
  | "/saved"
  | "/discover"
  | `/journeys/${string}`;

interface Handoff {
  target: ReturnTarget;
  accountId?: string;
  expiresAt: number;
}

let handoffInMemory: Handoff | undefined;

export function journeyReturnTo(value: unknown): ReturnTarget | undefined {
  if (
    value === "/journeys" ||
    value === "/journeys/new" ||
    value === "/saved" ||
    value === "/discover"
  )
    return value;
  if (typeof value !== "string" || !value.startsWith("/journeys/")) return;
  const result = journeyPath.safeParse({
    journeyId: value.slice("/journeys/".length),
  });
  if (result.success) return `/journeys/${result.data.journeyId}`;
}

function storeHandoff(value?: Handoff) {
  handoffInMemory = value;
  try {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // Navigation in the current document still works when storage is blocked.
  }
}

function readHandoff(): Handoff | undefined {
  let value = handoffInMemory;
  try {
    const raw = sessionStorage.getItem(storageKey);
    value = raw ? JSON.parse(raw) : undefined;
  } catch {
    // Retain the current document's handoff if storage is unavailable.
  }
  if (
    value &&
    journeyReturnTo(value.target) &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > Date.now()
  )
    return value;
  if (value) storeHandoff();
}

export function saveJourneyReturnTo(target: ReturnTarget, accountId?: string) {
  const current = readHandoff();
  if (current?.target === target && current.accountId === accountId) return;
  storeHandoff({ target, accountId, expiresAt: Date.now() + lifetime });
}

export function bindJourneyReturn(
  accountId: string,
  canResumeUnbound: boolean,
) {
  const current = readHandoff();
  if (!current || current.accountId === accountId) return;
  if (!current.accountId && canResumeUnbound)
    storeHandoff({ ...current, accountId });
  else storeHandoff();
}

export function discardOtherAccountReturn(accountId: string) {
  const current = readHandoff();
  if (current?.accountId && current.accountId !== accountId) storeHandoff();
}

export function boundJourneyReturn(accountId: string | null) {
  const current = readHandoff();
  return accountId && current?.accountId === accountId
    ? current.target
    : undefined;
}

export function clearJourneyReturn(accountId: string) {
  if (boundJourneyReturn(accountId)) storeHandoff();
}

export function workspaceDestination(target?: ReturnTarget) {
  if (!target) return { to: "/dashboard" } as const;
  if (
    target === "/journeys" ||
    target === "/journeys/new" ||
    target === "/saved" ||
    target === "/discover"
  )
    return { to: target } as const;
  return {
    to: "/journeys/$journeyId",
    params: { journeyId: target.slice("/journeys/".length) },
  } as const;
}
