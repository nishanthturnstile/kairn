const storageKey = "kairn.invitation-handoff";
const receiptWindow = 24 * 60 * 60_000;

export interface InvitationHandoff {
  continuation?: string;
  expiresAt: number;
  accountId?: string;
  operationId?: string;
}

let current: InvitationHandoff | undefined;
let fragment: string | undefined;

export function saveInvitationHandoff(value?: InvitationHandoff) {
  current = value;
  try {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // Within this document the handoff remains available.
  }
}

export function readInvitationHandoff() {
  let value = current;
  try {
    const stored = sessionStorage.getItem(storageKey);
    value = stored ? JSON.parse(stored) : undefined;
  } catch {
    // Storage can be disabled.
  }
  if (!value || !Number.isFinite(value.expiresAt)) return undefined;
  if (Date.now() < value.expiresAt && value.continuation) return value;
  if (
    value.accountId &&
    value.operationId &&
    Date.now() < value.expiresAt + receiptWindow
  ) {
    if (value.continuation)
      saveInvitationHandoff({ ...value, continuation: undefined });
    return { ...value, continuation: undefined };
  }
  saveInvitationHandoff();
}

export function captureInvitationFragment() {
  if (
    window.location.pathname.replace(/\/$/, "") === "/journey-invitations" &&
    window.location.hash
  ) {
    fragment = window.location.hash.slice(1);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return fragment;
}

export function forgetInvitationFragment() {
  fragment = undefined;
}

export function clearInvitationHandoff() {
  forgetInvitationFragment();
  saveInvitationHandoff();
}
