import { describe, expect, it } from "vite-plus/test";
import {
  createAuthenticatedMobileApiClient,
  createInvitationExchangeClient,
} from "../apps/mobile/src/api";
import {
  invitationLink,
  restoreInvitation,
} from "../apps/mobile/src/invitation-link";
import {
  createMobileSession,
  isVerifiedMobileScope,
} from "../apps/mobile/src/session";
import { onboardingKey } from "../apps/mobile/src/workspace-keys";
import { observeOnboarding } from "../apps/mobile/src/workspace-observer";
import {
  readReturnHandoff,
  returnLifetime,
  workspaceHref,
  workspaceTarget,
} from "../apps/mobile/src/workspace-return";

const accountId = "250dbeb0-da94-4de9-a164-cadaa8d2d6bd";
const journeyId = "cf1f1e2a-06e9-40c8-8d43-6e61605250e1";
const origin = "https://kairn.test";

describe("native workspace return", () => {
  it("accepts only canonical destinations and strips paths to route parameters", () => {
    const detail = workspaceTarget(`/journeys/${journeyId}`);
    expect(workspaceHref(detail)).toEqual({
      pathname: "/journeys/[journeyId]",
      params: { journeyId },
    });
    expect(workspaceTarget("/journeys/new")).toBe("/journeys/new");
    expect(
      workspaceHref(workspaceTarget(`/journeys/${journeyId}/people`)),
    ).toEqual({
      pathname: "/journeys/[journeyId]/people",
      params: { journeyId },
    });
    expect(
      workspaceHref(workspaceTarget(`/journeys/${journeyId}/invite`)),
    ).toEqual({
      pathname: "/journeys/[journeyId]/invite",
      params: { journeyId },
    });
    expect(workspaceHref(workspaceTarget("/journey-invitations"))).toBe(
      "/journey-invitations",
    );
    expect(workspaceHref()).toBe("/dashboard");
    for (const rejected of [
      "https://kairn.test/journeys",
      "//kairn.test/saved",
      "/account",
      "/journeys/../saved",
      "/journeys/new?intent=record",
      `/journeys/${journeyId}/members`,
      "/journey-invitations#opaque-token",
      "/journey-invitations?continuation=opaque-token",
      ["/saved"],
    ])
      expect(workspaceTarget(rejected)).toBeUndefined();
  });

  it("restores only valid account-bound handoffs with a live expiry", () => {
    const now = Date.parse("2026-11-20T10:00:00Z");
    const valid = { target: "/saved", accountId, expiresAt: now + 500 };
    expect(readReturnHandoff(JSON.stringify(valid), now)).toEqual(valid);
    for (const invalid of [
      { ...valid, target: "/account" },
      { ...valid, accountId: undefined },
      { ...valid, expiresAt: now },
      { ...valid, expiresAt: now + returnLifetime + 1 },
    ])
      expect(readReturnHandoff(JSON.stringify(invalid), now)).toBeUndefined();
    expect(readReturnHandoff("not JSON", now)).toBeUndefined();
  });
});

describe("native invitation links", () => {
  const token = "a".repeat(43);
  const handle = "b".repeat(80);

  it("extracts only a first-party fragment or a development invitation link", () => {
    expect(
      invitationLink(`${origin}/journey-invitations#${token}`, origin),
    ).toEqual({ token });
    expect(
      invitationLink(`kairn://journey-invitations#${token}`, origin, true),
    ).toEqual({ token });
    expect(
      invitationLink(`kairn:///journey-invitations#${token}`, origin, true),
    ).toEqual({ token });
    for (const url of [
      `https://other.test/journey-invitations#${token}`,
      `https://person@kairn.test/journey-invitations#${token}`,
      `kairn://journey-invitations#${token}`,
      `${origin}/journey-invitations?token=${token}`,
      `${origin}/journey-invitations#invalid`,
    ])
      expect(invitationLink(url, origin)).toEqual({ token: undefined });
    expect(
      invitationLink(`kairn://journeys/${journeyId}`, origin, true),
    ).toBeUndefined();
  });

  it("restores only bounded continuations and keeps a matching receipt after expiry", () => {
    const now = Date.now();
    const saved = { continuation: handle, expiresAt: now + 10 };
    expect(restoreInvitation(JSON.stringify(saved), now)).toMatchObject(saved);
    expect(restoreInvitation(JSON.stringify(saved), now + 10)).toBeUndefined();
    expect(
      restoreInvitation(
        JSON.stringify({ ...saved, operationId: journeyId }),
        now,
      ),
    ).toBeUndefined();
    const pending = { ...saved, accountId, operationId: journeyId };
    expect(restoreInvitation(JSON.stringify(pending), now + 10)).toEqual({
      ...pending,
      continuation: undefined,
    });
    expect(
      restoreInvitation(JSON.stringify(pending), now + 25 * 60 * 60_000),
    ).toBeUndefined();
  });

  it("exchanges a credential only in a cookie-free request body", async () => {
    const expiresAt = "2026-11-25T12:30:00.000Z";
    const api = createInvitationExchangeClient(
      origin,
      async (request, init) => {
        expect(request.url).toBe(
          `${origin}/api/v1/journey-invitations/continue`,
        );
        expect(init.credentials).toBe("omit");
        expect(init.redirect).toBe("error");
        expect(new Headers(init.headers).has("Cookie")).toBe(false);
        expect(new Headers(init.headers).has("X-Expected-Account")).toBe(false);
        expect(await request.json()).toEqual({ token });
        return Response.json({ continuation: handle, expiresAt });
      },
    );
    expect(
      (
        await api.POST("/api/v1/journey-invitations/continue", {
          body: { token },
        })
      ).data,
    ).toEqual({ continuation: handle, expiresAt });
  });
});

it("uses the native account transport for profile, onboarding and Dashboard", async () => {
  const handled: string[] = [];
  const api = createAuthenticatedMobileApiClient({
    origin,
    accountId,
    lifetime: new AbortController().signal,
    getCookie: async () => "session=synthetic",
    async send(request, init) {
      const headers = new Headers(init.headers);
      expect(headers.get("X-Expected-Account")).toBe(accountId);
      expect(headers.get("Cookie")).toBe("session=synthetic");
      expect(init.redirect).toBe("error");
      const path = new URL(request.url).pathname;
      handled.push(`${request.method} ${path}`);
      if (path.endsWith("/profile"))
        return Response.json({ displayName: "Devika" });
      if (path.endsWith("/onboarding"))
        return Response.json({ state: "completed", intent: "record" });
      return Response.json({
        asOf: "2026-11-20T10:00:00Z",
        journeyCount: 0,
        upcomingCount: 0,
        recentJourneys: [],
      });
    },
  });
  const params = { header: { "x-expected-account": accountId } };
  expect(
    (
      await api.PATCH("/api/v1/profile", {
        params,
        body: { displayName: "Devika" },
      })
    ).data,
  ).toEqual({ displayName: "Devika" });
  expect(
    (
      await api.POST("/api/v1/onboarding", {
        params,
        body: { step: 2, intent: "record" },
      })
    ).data,
  ).toEqual({ state: "completed", intent: "record" });
  expect(
    (await api.GET("/api/v1/dashboard", { params })).data?.journeyCount,
  ).toBe(0);
  expect(handled).toEqual([
    "PATCH /api/v1/profile",
    "POST /api/v1/onboarding",
    "GET /api/v1/dashboard",
  ]);
});

it("observes checkpoint writes in the verified cache and detaches when the account changes", async () => {
  const session = createMobileSession({
    origin,
    getCookie: async () => "session=synthetic",
    send: async () => Response.json({ state: "pending", step: 1 }),
  });
  const guest = session.getSnapshot();
  session.setVerifiedAccount(accountId);
  const scope = session.getSnapshot();
  expect(isVerifiedMobileScope(scope)).toBe(true);
  if (!isVerifiedMobileScope(scope))
    throw new Error("Expected a verified scope.");
  const observer = observeOnboarding(scope, () => {});
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  expect(observer.getCurrentResult().data).toEqual({
    state: "pending",
    step: 1,
  });
  scope.queryClient.setQueryData(onboardingKey, { state: "pending", step: 2 });
  expect(observer.getCurrentResult().data).toEqual({
    state: "pending",
    step: 2,
  });
  expect(guest.queryClient.getQueryData(onboardingKey)).toBeUndefined();
  unsubscribe();
  session.setVerifiedAccount(journeyId);
  expect(scope.signal.aborted).toBe(true);
  expect(
    session.getSnapshot().queryClient.getQueryData(onboardingKey),
  ).toBeUndefined();
});
