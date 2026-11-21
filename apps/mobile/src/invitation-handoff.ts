import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";
import { authOrigin } from "./auth";
import { sessionStoragePrefix } from "./auth-origin";
import {
  type InvitationHandoff,
  invitationDeadline,
  restoreInvitation,
} from "./invitation-link";
import { createInvitationState } from "./invitation-state";

const key = authOrigin
  ? `${sessionStoragePrefix(authOrigin)}_journey_invitation`
  : undefined;
const options = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function restore() {
  try {
    if (!key) return;
    const raw = SecureStore.getItem(key, options);
    const value = restoreInvitation(raw, Date.now());
    if (raw) persist(value);
    return value;
  } catch {
    return undefined;
  }
}

function persist(handoff?: InvitationHandoff) {
  if (!key) return;
  try {
    SecureStore.setItem(key, handoff ? JSON.stringify(handoff) : "", options);
  } catch {
    // In this process the user can still complete the handoff.
  }
}

const state = createInvitationState({ handoff: restore(), persist });
export const {
  captureInvitationToken,
  clearInvitationHandoff,
  discardInvitationToken,
  finishInvitationExchange,
  isCurrentInvitation,
  readInvitationHandoff,
  saveInvitationHandoff,
} = state;

export function useInvitationHandoff() {
  return useSyncExternalStore(
    state.subscribe,
    state.getSnapshot,
    state.getSnapshot,
  );
}

export function useInvitationExpiry(handoff?: InvitationHandoff) {
  useEffect(() => {
    if (!handoff) return;
    const timer = setTimeout(
      () => state.pruneInvitation(handoff),
      Math.max(0, invitationDeadline(handoff) - Date.now() + 1),
    );
    return () => clearTimeout(timer);
  }, [handoff]);
}
