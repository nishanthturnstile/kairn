import { describe, expect, it } from "vite-plus/test";
import { createWebSession } from "../apps/web/src/lib/session";

const baseUrl = "http://kairn.test";

describe("creator account scope", () => {
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
