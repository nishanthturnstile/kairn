import { activeInvitation, type InvitationHandoff } from "./invitation-link";

type Inbox = { handoff?: InvitationHandoff; token?: string };

export function createInvitationState({
  handoff,
  persist,
  now = Date.now,
}: {
  handoff?: InvitationHandoff;
  persist: (value?: InvitationHandoff) => void;
  now?: () => number;
}) {
  let snapshot: Inbox = { handoff };
  const listeners = new Set<() => void>();
  function update(value: Inbox) {
    snapshot = value;
    for (const notify of listeners) notify();
  }
  function readInvitationHandoff() {
    return snapshot.handoff && activeInvitation(snapshot.handoff, now());
  }
  function saveInvitationHandoff(value?: InvitationHandoff) {
    persist(value);
    update({ ...snapshot, handoff: value });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    captureInvitationToken(token: string) {
      if (token !== snapshot.token) update({ ...snapshot, token });
    },
    discardInvitationToken() {
      if (snapshot.token) update({ handoff: snapshot.handoff });
    },
    finishInvitationExchange(token: string, value?: InvitationHandoff) {
      if (snapshot.token !== token) return false;
      if (value) persist(value);
      update({ handoff: value ?? snapshot.handoff });
      return true;
    },
    isCurrentInvitation(expected: { source?: string; operationId?: string }) {
      const current = readInvitationHandoff();
      if (snapshot.token || !current) return false;
      return expected.operationId
        ? current.operationId === expected.operationId
        : (current.continuation ?? current.operationId) === expected.source;
    },
    pruneInvitation(expected: InvitationHandoff) {
      if (snapshot.handoff !== expected) return;
      const current = readInvitationHandoff();
      if (current !== expected) saveInvitationHandoff(current);
    },
    readInvitationHandoff,
    saveInvitationHandoff,
    clearInvitationHandoff() {
      persist();
      update({});
    },
  };
}
