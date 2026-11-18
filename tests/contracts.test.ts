import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { createMobileApiClient } from "../apps/mobile/src/api";
import { createApp } from "../apps/server/src/app";
import { createWebApiClient } from "../apps/web/src/lib/api";
import type { components } from "../packages/contracts/src/index";
import { apiProblem } from "../packages/contracts/src/schemas";
import {
  cursorQuery,
  revisionedCommand,
  syncTombstone,
  uploadPartAcknowledgement,
} from "../packages/sync-protocol/src/index";

const app = createApp({
  authHandler: async () => Response.json({ handledBy: "auth" }),
  checkReadiness: async () => {},
});

describe("versioned HTTP contracts", () => {
  it("serves health, readiness, and protocol compatibility through the web and mobile clients", async () => {
    const baseUrl = "http://kairn.test";
    const fetch = async (request: Request) => app.request(request);
    const web = createWebApiClient();
    const mobile = createMobileApiClient(baseUrl);
    await expect(
      web.GET("/api/v1/health", { baseUrl, fetch }),
    ).resolves.toMatchObject({
      data: { status: "ok" },
    });
    await expect(mobile.GET("/api/v1/ready", { fetch })).resolves.toMatchObject(
      {
        data: { status: "ready" },
      },
    );
    await expect(
      mobile.GET("/api/v1/protocol", {
        fetch,
        params: { query: { version: "1" } },
      }),
    ).resolves.toMatchObject({
      data: { minimumVersion: 1, currentVersion: 1, supported: true },
    });
    await expect(
      mobile.GET("/api/v1/protocol", {
        fetch,
        params: { query: { version: "2" } },
      }),
    ).resolves.toMatchObject({
      data: { minimumVersion: 1, currentVersion: 1, supported: false },
    });
  });

  it("returns safe problem details and an independent request ID for invalid and missing routes", async () => {
    const invalid = await app.request(
      "/api/v1/protocol?version=private-input",
      { headers: { "X-Request-Id": "untrusted-id" } },
    );
    const missing = await app.request("/api/v1/journeys");
    expect(invalid.headers.get("Content-Type")).toContain(
      "application/problem+json",
    );
    const body = await invalid.json();
    expect(body).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      code: "invalid_request",
      requestId: invalid.headers.get("X-Request-Id"),
    });
    expect(apiProblem.safeParse(body).success).toBe(true);
    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Request-Id")).not.toBe(body.requestId);
  });

  it("keeps liveness up when readiness fails and omits the dependency error", async () => {
    const unavailable = createApp({
      authHandler: async () => new Response(null, { status: 404 }),
      checkReadiness: async () => {
        throw new Error("private database details");
      },
    });
    const ready = await unavailable.request("/api/v1/ready");
    expect(ready.status).toBe(503);
    await expect(ready.json()).resolves.toEqual({
      type: "about:blank",
      title: "Service Unavailable",
      status: 503,
      code: "service_unavailable",
      requestId: ready.headers.get("X-Request-Id"),
    });
    expect((await unavailable.request("/api/v1/health")).status).toBe(200);
  });

  it("leaves the auth response with its own handler and serves the committed OpenAPI document", async () => {
    const auth = await app.request("/api/auth/get-session");
    expect(auth.headers.get("X-Request-Id")).toBeTruthy();
    await expect(auth.json()).resolves.toEqual({ handledBy: "auth" });

    const published = await app.request("/api/v1/openapi.json");
    const document = JSON.parse(
      await readFile(
        new URL("../packages/contracts/openapi.json", import.meta.url),
        "utf8",
      ),
    );
    expect(published.status).toBe(200);
    await expect(published.json()).resolves.toEqual(document);
    expect(
      Object.keys(document.paths).some((path) => path.startsWith("/api/auth")),
    ).toBe(false);
  });
});

it("validates the versioned sync fixtures against the generated wire shapes", () => {
  const command = {
    protocolVersion: 1,
    deviceId: randomUUID(),
    commandId: randomUUID(),
    expectedRevision: 3,
  } satisfies components["schemas"]["RevisionedCommandV1"];
  const part = {
    protocolVersion: 1,
    uploadId: randomUUID(),
    partNumber: 1,
    byteLength: 128,
    sha256: "f".repeat(64),
  } satisfies components["schemas"]["UploadPartAcknowledgementV1"];
  const tombstone = {
    protocolVersion: 1,
    resource: "source",
    id: randomUUID(),
    reason: "access_revoked",
    policyGeneration: 2,
  } satisfies components["schemas"]["SyncTombstoneV1"];

  expect(revisionedCommand.parse(command)).toEqual(command);
  expect(
    revisionedCommand.safeParse({ ...command, expectedRevision: 0 }).success,
  ).toBe(false);
  expect(
    revisionedCommand.safeParse({ ...command, protocolVersion: 2 }).success,
  ).toBe(false);
  expect(cursorQuery.parse({ cursor: "opaque_token", limit: "25" })).toEqual({
    cursor: "opaque_token",
    limit: 25,
  });
  expect(cursorQuery.safeParse({ limit: "101" }).success).toBe(false);
  expect(uploadPartAcknowledgement.parse(part)).toEqual(part);
  expect(
    uploadPartAcknowledgement.safeParse({ ...part, partNumber: 0 }).success,
  ).toBe(false);
  expect(
    uploadPartAcknowledgement.safeParse({ ...part, sha256: "etag" }).success,
  ).toBe(false);
  expect(
    syncTombstone.parse({
      ...tombstone,
      privateCaption: "never part of a tombstone",
    }),
  ).toEqual(tombstone);
  const membershipTombstone = {
    protocolVersion: 1,
    resource: "membership",
    journeyId: randomUUID(),
    reason: "access_revoked",
    policyGeneration: 2,
  } satisfies components["schemas"]["SyncTombstoneV1"];
  expect(syncTombstone.parse(membershipTombstone)).toEqual(membershipTombstone);
  expect(
    syncTombstone.safeParse({ ...tombstone, resource: "membership" }).success,
  ).toBe(false);
});
