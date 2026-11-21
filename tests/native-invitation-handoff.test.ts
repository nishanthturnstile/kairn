import { expect, it, vi } from "vite-plus/test";
import { createInvitationState } from "../apps/mobile/src/invitation-state";

const first = "a".repeat(43);
const second = "b".repeat(43);
const handle = "c".repeat(80);
const accountId = "250dbeb0-da94-4de9-a164-cadaa8d2d6bd";
const operationId = "cf1f1e2a-06e9-40c8-8d43-6e61605250e1";

it("keeps a newer link when an earlier native exchange finishes late", () => {
  const state = createInvitationState({ persist: vi.fn() });
  const handoff = { continuation: handle, expiresAt: Date.now() + 1000 };
  state.captureInvitationToken(first);
  state.captureInvitationToken(second);
  expect(state.finishInvitationExchange(first, handoff)).toBe(false);
  expect(state.getSnapshot().token).toBe(second);
  expect(state.readInvitationHandoff()).toBeUndefined();
  expect(state.finishInvitationExchange(second, handoff)).toBe(true);
  expect(state.getSnapshot().token).toBeUndefined();
  expect(state.readInvitationHandoff()).toEqual(handoff);
});

it("checks the originating acceptance before opening a journey", () => {
  const state = createInvitationState({ persist: vi.fn() });
  const handoff = { continuation: handle, expiresAt: Date.now() + 1000 };
  state.saveInvitationHandoff({ ...handoff, accountId, operationId });
  expect(state.isCurrentInvitation({ operationId })).toBe(true);
  state.captureInvitationToken(second);
  expect(state.isCurrentInvitation({ operationId })).toBe(false);
  state.discardInvitationToken();
  expect(state.isCurrentInvitation({ operationId })).toBe(true);
  state.captureInvitationToken(second);
  state.finishInvitationExchange(second, {
    ...handoff,
    continuation: "d".repeat(80),
  });
  expect(state.isCurrentInvitation({ operationId })).toBe(false);
  expect(state.isCurrentInvitation({ source: handle })).toBe(false);
});

it("prunes an expired continuation and retains only bounded acceptance recovery", () => {
  let now = 100;
  const persist = vi.fn();
  const handoff = {
    continuation: handle,
    expiresAt: 200,
    accountId,
    operationId,
  };
  const state = createInvitationState({ handoff, persist, now: () => now });
  now = 201;
  state.pruneInvitation(handoff);
  const receipt = { ...handoff, continuation: undefined };
  expect(state.getSnapshot().handoff).toEqual(receipt);
  expect(persist).toHaveBeenLastCalledWith(receipt);
  now += 24 * 60 * 60_000;
  const current = state.getSnapshot().handoff;
  if (!current) throw new Error("Expected an acceptance receipt.");
  state.pruneInvitation(current);
  expect(state.getSnapshot().handoff).toBeUndefined();
  expect(persist).toHaveBeenLastCalledWith(undefined);
});
