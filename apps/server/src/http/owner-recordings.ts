import { Readable } from "node:stream";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { journeyHeaders } from "@kairn/contracts/journeys";
import {
  ownerRecording,
  ownerRecordingPage,
  recordingSectionPage,
  removedRecording,
} from "@kairn/contracts/recordings";
import type { JourneyEnvironment, JourneyRouteGuards } from "./journeys.js";
import { errorResponse, privateHeaders } from "./openapi.js";
import { problem } from "./problem.js";
import {
  errors,
  identityRequest,
  itemRequest,
  jsonResponse,
  mutationErrors,
  numericCursor,
} from "./recordings.js";

const detailPath = "/api/v1/account/recordings/{id}";
const download = {
  description: "Private original GPX bytes.",
  headers: privateHeaders,
  content: {
    "application/gpx+xml": { schema: z.string().openapi({ format: "binary" }) },
  },
};

export function registerOwnerRecordingRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const service = operations?.ownerRecordings;
  const read = [protect, authenticate];

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/account/recordings",
      operationId: "listOwnerRecordings",
      middleware: read,
      request: {
        ...identityRequest,
        query: z.object({ cursor: z.uuid().optional() }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          ownerRecordingPage,
          "An owner-scoped page of original recordings.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.list(
        context.var.journeys.session,
        context.req.valid("query").cursor,
      );
      return result.status === 200
        ? context.json(result.page, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: detailPath,
      operationId: "readOwnerRecording",
      middleware: read,
      request: itemRequest,
      responses: {
        ...errors,
        200: jsonResponse(ownerRecording, "The owner's recording summary."),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.detail(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.recording, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/account/recordings/{id}/segments",
      operationId: "listOwnerRecordingSections",
      middleware: read,
      request: {
        ...itemRequest,
        query: z.object({ cursor: numericCursor.optional() }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingSectionPage,
          "The owner's measured recording sections.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.sections(
        context.var.journeys.session,
        context.req.valid("param").id,
        context.req.valid("query").cursor,
      );
      return result.status === 200
        ? context.json(result.page, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "delete",
      path: detailPath,
      operationId: "deleteOwnerRecording",
      middleware: [...read, enforceWriteOrigin],
      request: itemRequest,
      responses: {
        ...mutationErrors,
        200: jsonResponse(
          removedRecording,
          "Deletion was independently confirmed.",
        ),
        202: jsonResponse(
          removedRecording,
          "The recording was denied. Independent confirmation is pending.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.deleteOriginal(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      if (!("confirmation" in result)) return problem(context, result.status);
      return context.json(
        { id: result.id, confirmation: result.confirmation },
        result.status,
      );
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/account/recordings/{id}/original",
      operationId: "downloadOwnerRecording",
      middleware: read,
      request: {
        ...itemRequest,
        headers: journeyHeaders.extend({ range: z.string().optional() }),
      },
      responses: {
        ...errors,
        200: download,
        206: download,
        416: errorResponse(
          "The requested byte range is unavailable.",
          privateHeaders,
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.original(
        context.var.journeys.session,
        context.req.valid("param").id,
        context.req.valid("header").range,
      );
      if (result.status === 416) {
        context.header("Content-Range", `bytes */${result.size}`);
        return problem(context, 416);
      }
      if (result.status !== 200 && result.status !== 206)
        return problem(context, result.status);
      const encodedName = encodeURIComponent(
        result.fileName.replace(/[\uD800-\uDFFF]/gu, "_"),
      ).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
      return new Response(
        Readable.toWeb(result.body) as ReadableStream<Uint8Array>,
        {
          status: result.status,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Type": "application/gpx+xml",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `attachment; filename="recording.gpx"; filename*=UTF-8''${encodedName}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(result.size),
            ...(result.contentRange && {
              "Content-Range": result.contentRange,
            }),
          },
        },
      );
    },
  );
}
