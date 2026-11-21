import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as schemas from "@kairn/contracts/schemas";
import { createJourneysApi, type JourneyOperations } from "./journeys.js";
import { errorResponse, requestIdHeader } from "./openapi.js";
import { problem, type RequestEnvironment } from "./problem.js";
import { createWorkspaceApi, type WorkspaceOperations } from "./workspace.js";

const documentOptions = {
  openapi: "3.1.0",
  info: { title: "Kairn API", version: "1.0.0" },
};

const minimumVersion = 1;

const healthRoute = createRoute({
  method: "get",
  path: "/api/v1/health",
  operationId: "getHealth",
  responses: {
    200: {
      description: "The HTTP process is alive",
      headers: requestIdHeader,
      content: { "application/json": { schema: schemas.health } },
    },
  },
});

const readinessRoute = createRoute({
  method: "get",
  path: "/api/v1/ready",
  operationId: "getReadiness",
  responses: {
    200: {
      description: "The HTTP process can reach its migrated database",
      headers: requestIdHeader,
      content: { "application/json": { schema: schemas.readiness } },
    },
    503: errorResponse("The database is unavailable or requires migration"),
  },
});

const protocolRoute = createRoute({
  method: "get",
  path: "/api/v1/protocol",
  operationId: "getSyncProtocol",
  request: { query: schemas.protocolQuery },
  responses: {
    200: {
      description: "Supported sync protocol version range",
      headers: requestIdHeader,
      content: { "application/json": { schema: schemas.protocol } },
    },
    400: errorResponse("The requested version is malformed"),
  },
});

export function createV1Api(
  checkReadiness: () => Promise<void>,
  journeys?: JourneyOperations,
  workspace?: WorkspaceOperations,
) {
  const api = new OpenAPIHono<RequestEnvironment>({
    defaultHook: (result, context) => {
      if (!result.success) return problem(context, 400);
    },
  });

  const registry = api.openAPIRegistry;
  registry.register("CommandEnvelopeV1", schemas.commandEnvelope);
  registry.register("RevisionedCommandV1", schemas.revisionedCommand);
  registry.register("RevisionConflictV1", schemas.revisionConflict);
  registry.register("CursorQueryV1", schemas.cursorQuery);
  registry.register("CursorPageV1", schemas.cursorPage);
  registry.register(
    "UploadPartAcknowledgementV1",
    schemas.uploadPartAcknowledgement,
  );
  registry.register(
    "UploadCompletionAcknowledgementV1",
    schemas.uploadCompletionAcknowledgement,
  );
  registry.register("SyncTombstoneV1", schemas.syncTombstone);

  api.openapi(healthRoute, (context) => context.json({ status: "ok" }, 200));
  api.openapi(readinessRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    try {
      await checkReadiness();
      return context.json({ status: "ready" } as const, 200);
    } catch {
      return problem(context, 503);
    }
  });
  api.openapi(protocolRoute, (context) => {
    const currentVersion = schemas.syncProtocolVersion;
    const { version } = context.req.valid("query");
    const requestedVersion =
      version === undefined ? currentVersion : Number(version);
    return context.json(
      {
        minimumVersion,
        currentVersion,
        supported:
          requestedVersion >= minimumVersion &&
          requestedVersion <= currentVersion,
      },
      200,
    );
  });

  return api
    .route("/", createJourneysApi(journeys))
    .route("/", createWorkspaceApi(workspace));
}

export function getOpenApiDocument(api: ReturnType<typeof createV1Api>) {
  return api.getOpenAPI31Document(documentOptions);
}
