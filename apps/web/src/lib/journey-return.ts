import { journeyPath } from "@kairn/contracts/journeys";

const storageKey = "kairn.workspace-sign-in-return";
const lifetime = 24 * 60 * 60 * 1000;
type ReturnTarget =
  | "/dashboard"
  | "/journeys"
  | "/journeys/new"
  | "/saved"
  | "/discover"
  | "/journey-invitations"
  | `/journeys/${string}/invite`
  | `/journeys/${string}`;

interface Handoff {
  target: ReturnTarget;
  accountId?: string;
  expiresAt: number;
  finishAtDashboard?: boolean;
}

let handoffInMemory: Handoff | undefined;

export function journeyReturnTo(value: unknown): ReturnTarget | undefined {
  if (
    value === "/dashboard" ||
    value === "/journeys" ||
    value === "/journeys/new" ||
    value === "/saved" ||
    value === "/discover" ||
    value === "/journey-invitations"
  )
    return value;
  if (typeof value !== "string" || !value.startsWith("/journeys/")) return;
  const match = /^\/journeys\/([^/]+)(\/(?:invite|people))?$/.exec(value);
  const result = journeyPath.safeParse({ journeyId: match?.[1] });
  if (result.success)
    return match?.[2] === "/invite"
      ? `/journeys/${result.data.journeyId}/invite`
      : `/journeys/${result.data.journeyId}`;
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
  const target = journeyReturnTo(value?.target);
  if (
    value &&
    target &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > Date.now()
  )
    return { ...value, target };
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

export function boundJourneyReturn(
  accountId: string | null,
  options?: { afterSetup: boolean },
) {
  const current = readHandoff();
  if (options?.afterSetup && current?.finishAtDashboard) return;
  return accountId && current?.accountId === accountId
    ? current.target
    : undefined;
}

export function rememberSetupExit(
  accountId: string,
  finishAtDashboard: boolean,
) {
  const current = readHandoff();
  if (current?.accountId === accountId)
    storeHandoff({ ...current, finishAtDashboard });
}

export function clearJourneyReturn(accountId: string) {
  if (boundJourneyReturn(accountId)) storeHandoff();
}

export function workspaceDestination(target?: ReturnTarget) {
  if (!target) return { to: "/dashboard" } as const;
  if (
    target === "/dashboard" ||
    target === "/journeys" ||
    target === "/journeys/new" ||
    target === "/saved" ||
    target === "/discover" ||
    target === "/journey-invitations"
  )
    return { to: target } as const;
  if (target.endsWith("/invite"))
    return {
      to: "/journeys/$journeyId/invite",
      params: { journeyId: target.split("/")[2] },
    } as const;
  return {
    to: "/journeys/$journeyId",
    params: { journeyId: target.split("/")[2] },
  } as const;
}
