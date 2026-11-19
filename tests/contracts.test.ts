import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vite-plus/test";
import { createMobileApiClient } from "../apps/mobile/src/api";
import { createApp } from "../apps/server/src/app";
import type { JourneyOperations } from "../apps/server/src/http/journeys";
import { createWebApiClient } from "../apps/web/src/lib/api";
import { resolveJourneySchedule } from "../packages/backend/src/modules/journeys/schedule";
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
    const missing = await app.request("/api/v1/missing");
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

const webOrigin = "http://kairn.test";
const accountId = "250dbeb0-da94-4de9-a164-cadaa8d2d6bd";
const session = {
  accountId,
  sessionId: "dc48aaff-7946-4a46-9c97-4240f95622b1",
};
const journeyId = "da716ed6-bf00-410f-a3c5-09a0058a9d80";
const asOf = "2026-06-01T00:00:00Z";
const createInput = {
  title: "  Coorg  ",
  intendedStart: "2026-06-12T09:00",
  timeZone: "Asia/Kolkata",
} satisfies components["schemas"]["CreateJourneyV1"];
const journey = {
  id: journeyId,
  title: "Coorg",
  state: "draft",
  schedule: {
    timeZone: "Asia/Kolkata",
    intendedStart: {
      local: "2026-06-12T09:00",
      instant: "2026-06-12T03:30:00Z",
      offset: "+05:30",
    },
    intendedEnd: null,
  },
  capabilities: ["administrator", "coauthor", "publisher"],
} satisfies components["schemas"]["PrivateJourneyV1"];
const legacyJourney = {
  ...journey,
  id: "879dba47-bebe-492a-90d0-72c65c1a9ac2",
  title: "Undated journey",
  state: "archived",
  schedule: null,
} satisfies components["schemas"]["PrivateJourneyV1"];

function journeyApiFixture() {
  const internalJourney = { ...journey, createdBy: accountId };
  const operations = {
    writeOrigins: [webOrigin],
    verifySession: vi.fn<JourneyOperations["verifySession"]>(async (headers) =>
      headers.get("Cookie") === "fixture-session=verified"
        ? { status: 200, ...session }
        : { status: 401 },
    ),
    create: vi.fn<JourneyOperations["create"]>(
      async (_accountId, _key, input) => {
        const result = resolveJourneySchedule(input);
        return result.issue
          ? { status: 400, issue: result.issue }
          : { status: 201, id: journey.id };
      },
    ),
    history: vi.fn<JourneyOperations["history"]>(async (_, query) =>
      query.section === "recent"
        ? {
            status: 200,
            history: {
              asOf,
              section: "recent",
              page: { items: [legacyJourney], nextCursor: null },
            },
          }
        : {
            status: 200,
            history: {
              asOf,
              upcoming: { items: [internalJourney], nextCursor: null },
              recent: { items: [], nextCursor: "next-recent" },
            },
          },
    ),
    detail: vi.fn<JourneyOperations["detail"]>(async (_, id) =>
      id === journey.id
        ? { status: 200, journey: internalJourney }
        : { status: 404 },
    ),
  } satisfies JourneyOperations;
  const http = createApp({
    authHandler: async () => new Response(null, { status: 404 }),
    checkReadiness: async () => {},
    journeys: operations,
  });
  const cookie = { Cookie: "fixture-session=verified" };
  const fetch = async (request: Request) => http.request(request);
  const headers = {
    ...cookie,
    "Content-Type": "application/json",
    "Idempotency-Key": randomUUID(),
  };
  return { http, fetch, operations, headers, cookie };
}

async function expectJourneyProblem(
  response: Response,
  status: number,
  code: components["schemas"]["ApiProblem"]["code"],
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toContain(
    "application/problem+json",
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const body = apiProblem.parse(await response.json());
  expect(body).toMatchObject({ status, code });
  expect(response.headers.get("X-Request-Id")).toBe(body.requestId);
  return body;
}

describe("private journey HTTP contracts", () => {
  it("returns the canonical ID at creation and replay and forwards a verified actor and normalized input", async () => {
    const { fetch, operations, cookie } = journeyApiFixture();
    const web = createWebApiClient();
    const key = randomUUID().toUpperCase();
    const options = {
      baseUrl: webOrigin,
      fetch,
      headers: { ...cookie, Origin: webOrigin },
      params: {
        header: {
          "idempotency-key": key,
          "x-expected-account": accountId.toUpperCase(),
        },
      },
      body: createInput,
    };
    const created = await web.POST("/api/v1/journeys", options);
    expect(created.data).toEqual({ id: journey.id });
    expect(created.response.status).toBe(201);
    expect(created.response.headers.get("Location")).toBe(
      `/api/v1/journeys/${journey.id}`,
    );
    expect(created.response.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(created.response.headers.get("X-Request-Id")).toBeTruthy();
    expect(operations.create).toHaveBeenCalledWith(session, key.toLowerCase(), {
      ...createInput,
      title: "Coorg",
      intendedEnd: null,
    });

    operations.create.mockResolvedValue({ status: 200, id: journey.id });
    const replay = await web.POST("/api/v1/journeys", {
      ...options,
      body: { ...createInput, intendedEnd: null },
    });
    expect(replay.response.status).toBe(200);
    expect(replay.data).toEqual(created.data);
    expect(operations.create).toHaveBeenLastCalledWith(
      session,
      key.toLowerCase(),
      {
        ...createInput,
        title: "Coorg",
        intendedEnd: null,
      },
    );
  });

  it("uses one private projection for initial history, a continuation and detail", async () => {
    const { fetch, operations, cookie } = journeyApiFixture();
    const mobile = createMobileApiClient(webOrigin);
    const initial = await mobile.GET("/api/v1/journeys", {
      fetch,
      headers: cookie,
    });
    const next = await mobile.GET("/api/v1/journeys", {
      fetch,
      headers: cookie,
      params: { query: { section: "recent", cursor: "next-recent" } },
    });
    const detail = await mobile.GET("/api/v1/journeys/{journeyId}", {
      fetch,
      headers: cookie,
      params: { path: { journeyId: journey.id } },
    });
    expect(initial.data).toEqual({
      asOf,
      upcoming: { items: [journey], nextCursor: null },
      recent: { items: [], nextCursor: "next-recent" },
    });
    expect(next.data).toEqual({
      asOf,
      section: "recent",
      page: { items: [legacyJourney], nextCursor: null },
    });
    expect(detail.data).toEqual(journey);
    expect(detail.response.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(operations.history).toHaveBeenLastCalledWith(session, {
      section: "recent",
      cursor: "next-recent",
    });
  });

  it("checks session and account before operations and uses a generic unavailable detail", async () => {
    const { http, operations, headers, cookie } = journeyApiFixture();
    await expectJourneyProblem(
      await app.request("/api/v1/journeys"),
      503,
      "service_unavailable",
    );
    await expectJourneyProblem(
      await http.request("/api/v1/journeys"),
      401,
      "unauthorized",
    );
    await expectJourneyProblem(
      await http.request("/api/v1/journeys", {
        method: "POST",
        headers: { ...headers, "X-Expected-Account": randomUUID() },
        body: "{",
      }),
      409,
      "account_changed",
    );
    await expectJourneyProblem(
      await http.request("/api/v1/journeys", {
        headers: { ...cookie, "X-Expected-Account": "invalid" },
      }),
      400,
      "invalid_request",
    );
    expect(operations.create).not.toHaveBeenCalled();
    expect(operations.history).not.toHaveBeenCalled();
    const unavailable = await expectJourneyProblem(
      await http.request(`/api/v1/journeys/${randomUUID()}`, {
        headers: cookie,
      }),
      404,
      "not_found",
    );
    expect(Object.keys(unavailable).sort()).toEqual([
      "code",
      "requestId",
      "status",
      "title",
      "type",
    ]);
  });

  it("uses safe Problems for invalid forms, write origins, content limits and conflicts", async () => {
    const { http, operations, headers, cookie } = journeyApiFixture();
    const create = (body: string, extraHeaders?: Record<string, string>) =>
      http.request("/api/v1/journeys", {
        method: "POST",
        headers: { ...headers, ...extraHeaders },
        body,
      });

    await expectJourneyProblem(
      await create(JSON.stringify(createInput), {
        Origin: `${webOrigin}.example`,
      }),
      403,
      "origin_rejected",
    );
    await expectJourneyProblem(
      await create(JSON.stringify(createInput), {
        "Sec-Fetch-Site": "same-origin",
      }),
      403,
      "origin_rejected",
    );
    await expectJourneyProblem(
      await create(JSON.stringify(createInput), {
        "Content-Type": "text/plain",
      }),
      415,
      "unsupported_media_type",
    );
    await expectJourneyProblem(
      await create("x".repeat(4097)),
      413,
      "request_too_large",
    );
    const malformed = await expectJourneyProblem(
      await create("{"),
      400,
      "invalid_request",
    );
    expect(malformed.issues).toEqual([
      { field: "body", code: "invalid_value" },
    ]);
    const actor = await expectJourneyProblem(
      await create(
        JSON.stringify({ ...createInput, accountId: "private-input" }),
      ),
      400,
      "invalid_request",
    );
    expect(actor.issues).toEqual([{ field: "body", code: "invalid_value" }]);
    expect(operations.create).not.toHaveBeenCalled();
    const time = await expectJourneyProblem(
      await create(
        JSON.stringify({
          ...createInput,
          intendedStart: "2026-11-01T01:30",
          timeZone: "America/New_York",
        }),
      ),
      400,
      "invalid_request",
    );
    expect(time.issues).toEqual([
      {
        field: "intendedStart",
        code: "ambiguous_time",
        offsets: ["-04:00", "-05:00"],
      },
    ]);
    operations.create.mockResolvedValue({ status: 409 });
    await expectJourneyProblem(
      await create(JSON.stringify(createInput)),
      409,
      "idempotency_conflict",
    );
    await expectJourneyProblem(
      await http.request("/api/v1/journeys?section=recent", {
        headers: cookie,
      }),
      400,
      "invalid_request",
    );
    expect(operations.history).not.toHaveBeenCalled();
    operations.history.mockResolvedValue({ status: 400 });
    const cursor = await expectJourneyProblem(
      await http.request("/api/v1/journeys?section=recent&cursor=wrong-scope", {
        headers: cookie,
      }),
      400,
      "invalid_request",
    );
    expect(cursor.issues).toEqual([
      { field: "cursor", code: "invalid_cursor" },
    ]);
  });

  it("preserves private caching and safe errors when an operation fails unexpectedly", async () => {
    const { http, operations, cookie } = journeyApiFixture();
    operations.history.mockRejectedValue(
      new Error("private dependency details"),
    );
    const problem = await expectJourneyProblem(
      await http.request("/api/v1/journeys", { headers: cookie }),
      500,
      "internal_error",
    );
    expect(problem.issues).toBeUndefined();
    expect(problem.title).toBe("Internal Server Error");
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
