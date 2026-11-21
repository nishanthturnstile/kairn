import { describe, expect, it } from "vite-plus/test";
import { journeyReturnTo } from "../apps/web/src/lib/journey-return";
import { createWebSession } from "../apps/web/src/lib/session";

const baseUrl = "http://kairn.test";

describe("creator account scope", () => {
  it("binds Journey requests to the verified account even when a caller supplies a different header", async () => {
    const session = createWebSession(baseUrl);
    const accountId = "250dbeb0-da94-4de9-a164-cadaa8d2d6bd";
    session.setVerifiedAccount(accountId);
    const { api } = session.getSnapshot();
    await api.GET("/api/v1/journeys", {
      baseUrl,
      headers: { "X-Expected-Account": "other" },
      async fetch(request) {
        expect(request.headers.get("X-Expected-Account")).toBe(accountId);
        return Response.json({});
      },
    });
  });

  it("cancels protected requests and clears state before exposing the next account", async () => {
    const session = createWebSession(baseUrl);
    session.setVerifiedAccount("account-a");
    const first = session.getSnapshot();
    first.queryClient.setQueryData(
      ["account-a", "journeys"],
      ["private fixture"],
    );
    const started = Promise.withResolvers<Request>();
    const release = Promise.withResolvers<Response>();
    const settled = first.api
      .GET("/api/v1/ready", {
        baseUrl,
        fetch: (request) => {
          started.resolve(request);
          return release.promise;
        },
      })
      .catch((error: unknown) => error);
    const request = await started.promise;
    expect(request.credentials).toBe("same-origin");
    expect(request.cache).toBe("no-store");
    session.setVerifiedAccount(null);
    session.setVerifiedAccount("account-b");
    expect(request.signal.aborted).toBe(true);
    expect(
      first.queryClient.getQueryData(["account-a", "journeys"]),
    ).toBeUndefined();
    expect(session.getSnapshot().queryClient).not.toBe(first.queryClient);
    release.resolve(Response.json({ status: "ready" }));
    expect(await settled).toMatchObject({ name: "AbortError" });
  });

  it("rejects requests outside the application origin before dispatch", async () => {
    const { api } = createWebSession(baseUrl).getSnapshot();
    await expect(
      api.GET("/api/v1/ready", {
        baseUrl: "https://other.test",
        async fetch() {
          throw new Error("Unexpected dispatch");
        },
      }),
    ).rejects.toThrow("application origin");
  });
});

it("accepts allowlisted workspace destinations after sign-in", () => {
  const detail = "/journeys/250dbeb0-da94-4de9-a164-cadaa8d2d6bd";
  expect(journeyReturnTo("/journeys")).toBe("/journeys");
  expect(journeyReturnTo("/journeys/new")).toBe("/journeys/new");
  expect(journeyReturnTo("/saved")).toBe("/saved");
  expect(journeyReturnTo(detail)).toBe(detail);
  for (const unavailable of [
    "//other.test/journeys",
    "https://other.test/journeys",
    "/journeys/../account",
    `${detail}?extra=1`,
  ]) {
    expect(journeyReturnTo(unavailable)).toBeUndefined();
  }
});
