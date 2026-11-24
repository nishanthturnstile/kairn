import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { journeyHeaders } from "@kairn/contracts/journeys";
import {
  beginRecordingUpload,
  gpxLimits,
  recordingBatch,
  recordingImport,
  recordingImportPage,
  recordingOverlay,
  recordingSamplePage,
  recordingSectionPage,
  recordingUpload,
  sha256Hex,
} from "@kairn/contracts/recordings";
import { bodyLimit } from "hono/body-limit";
import type { JourneyEnvironment, JourneyRouteGuards } from "./journeys.js";
import { errorResponse, privateHeaders, requireJson } from "./openapi.js";
import { problem } from "./problem.js";

const uploads = "/api/v1/uploads";
const upload = "/api/v1/uploads/{id}";
const imports = "/api/v1/imports";
const importPath = "/api/v1/imports/{id}";
export const identityRequest = { headers: journeyHeaders };
const resourcePath = z.object({ id: z.uuid() });
export const itemRequest = { ...identityRequest, params: resourcePath };
export const numericCursor = z.coerce
  .number()
  .int()
  .min(0)
  .max(gpxLimits.sections);
export const errors = {
  400: errorResponse("Invalid parameters or part checksum.", privateHeaders),
  401: errorResponse("A current verified session is required.", privateHeaders),
  404: errorResponse("The recording resource is unavailable.", privateHeaders),
  409: errorResponse(
    "The account, upload state or command changed.",
    privateHeaders,
  ),
  503: errorResponse(
    "Recording services are temporarily unavailable.",
    privateHeaders,
  ),
};
export const mutationErrors = {
  ...errors,
  403: errorResponse("The write origin is forbidden.", privateHeaders),
};
const uploadErrors = {
  ...mutationErrors,
  413: errorResponse("The body exceeds the upload limit.", privateHeaders),
  415: errorResponse("Incorrect request content type.", privateHeaders),
  429: {
    ...errorResponse(
      "The upload or transfer limit is reached.",
      privateHeaders,
    ),
    headers: {
      ...privateHeaders,
      "Retry-After": {
        description: "Seconds until retry.",
        schema: { type: "string" as const },
      },
    },
  },
};

export function jsonResponse<T extends z.ZodType>(
  schema: T,
  description: string,
) {
  return {
    description,
    headers: privateHeaders,
    content: { "application/json": { schema } },
  };
}

const uploadReceipt = jsonResponse(
  recordingUpload,
  "The verified owner's upload and acknowledged parts.",
);
const entryResponse = jsonResponse(
  recordingImport,
  "The verified owner's import status.",
);

export function registerRecordingUploadRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const service = operations?.recordingUploads;
  const read = [protect, authenticate] as const;
  const write = [protect, authenticate, enforceWriteOrigin] as const;

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/recording-batches/{id}",
      operationId: "readRecordingBatch",
      middleware: [...read],
      request: itemRequest,
      responses: {
        ...errors,
        200: jsonResponse(
          recordingBatch,
          "The verified owner's active recording batch.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.batch(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.draft, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: uploads,
      operationId: "beginRecordingUpload",
      middleware: [
        ...write,
        requireJson<JourneyEnvironment>(),
        bodyLimit({ maxSize: 4096 }),
      ],
      request: {
        ...identityRequest,
        body: {
          required: true,
          content: { "application/json": { schema: beginRecordingUpload } },
        },
      },
      responses: { ...uploadErrors, 200: uploadReceipt },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.begin(
        context.var.journeys.session,
        context.req.valid("json"),
      );
      if (result.status === 200) return context.json(result.upload, 200);
      if (result.status === 429) context.header("Retry-After", "60");
      return problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: upload,
      operationId: "readRecordingUpload",
      middleware: [...read],
      request: itemRequest,
      responses: { ...errors, 200: uploadReceipt },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.status(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.upload, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "put",
      path: "/api/v1/uploads/{id}/parts/{partNumber}",
      operationId: "putRecordingUploadPart",
      middleware: [...write],
      request: {
        params: resourcePath.extend({
          partNumber: z.coerce
            .number()
            .int()
            .min(1)
            .max(Math.ceil(gpxLimits.bytes / gpxLimits.partBytes)),
        }),
        headers: journeyHeaders.extend({
          "x-part-sha256": sha256Hex,
          "content-length": z.string().regex(/^[1-9]\d{0,7}$/),
        }),
        body: {
          required: true,
          content: {
            "application/octet-stream": {
              schema: z.string().openapi({ format: "binary" }),
            },
          },
        },
      },
      responses: { ...uploadErrors, 200: uploadReceipt },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { id, partNumber } = context.req.valid("param");
      const headers = context.req.valid("header");
      const length = Number(headers["content-length"]);
      if (length > gpxLimits.partBytes) return problem(context, 413);
      if (context.req.header("content-type") !== "application/octet-stream")
        return problem(context, 415);
      if (!context.req.raw.body) return problem(context, 400);
      const result = await service.putPart(
        context.var.journeys.session,
        id,
        partNumber,
        headers["x-part-sha256"],
        length,
        context.req.raw.body,
      );
      if (result.status === 200) return context.json(result.upload, 200);
      if (result.status === 429) context.header("Retry-After", "5");
      return problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/uploads/{id}/complete",
      operationId: "completeRecordingUpload",
      middleware: [...write],
      request: itemRequest,
      responses: { ...uploadErrors, 200: uploadReceipt },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.complete(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      if (result.status === 200) return context.json(result.upload, 200);
      if (result.status === 429) context.header("Retry-After", "5");
      return problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "delete",
      path: upload,
      operationId: "abortRecordingUpload",
      middleware: [...write],
      request: itemRequest,
      responses: { ...mutationErrors, 200: uploadReceipt },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.abort(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.upload, 200)
        : problem(context, result.status);
    },
  );
}

export function registerRecordingImportRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const service = operations?.recordingImports;
  const read = [protect, authenticate] as const;

  api.openapi(
    createRoute({
      method: "get",
      path: imports,
      operationId: "listRecordingImports",
      middleware: [...read],
      request: {
        ...identityRequest,
        query: z.object({ cursor: z.uuid().optional() }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingImportPage,
          "A page of the owner's imports.",
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
      path: importPath,
      operationId: "readRecordingImport",
      middleware: [...read],
      request: itemRequest,
      responses: { ...errors, 200: entryResponse },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.status(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.entry, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/imports/{id}/segments",
      operationId: "listRecordingImportSections",
      middleware: [...read],
      request: {
        ...itemRequest,
        query: z.object({ cursor: numericCursor.optional() }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingSectionPage,
          "A page of measured runs, without sample coordinates.",
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
      method: "get",
      path: "/api/v1/imports/{id}/overlay",
      operationId: "readRecordingImportOverlay",
      middleware: [...read],
      request: {
        ...itemRequest,
        query: z.object({
          cursor: numericCursor.optional(),
          through: numericCursor,
        }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingOverlay,
          "Bounded coordinates for the selected private sections.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { cursor, through } = context.req.valid("query");
      const result = await service.overlay(
        context.var.journeys.session,
        context.req.valid("param").id,
        cursor,
        through,
      );
      return result.status === 200
        ? context.json(result.overlay, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/imports/{id}/segments/{section}/samples",
      operationId: "listRecordingImportSamples",
      middleware: [...read],
      request: {
        ...itemRequest,
        params: resourcePath.extend({ section: numericCursor }),
        query: z.object({ page: numericCursor.optional() }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingSamplePage,
          "A bounded page of private sample observations.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { id, section } = context.req.valid("param");
      const result = await service.samples(
        context.var.journeys.session,
        id,
        section,
        context.req.valid("query").page ?? 0,
      );
      return result.status === 200
        ? context.json(result.page, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/imports/{id}/retry",
      operationId: "retryRecordingImport",
      middleware: [...read, enforceWriteOrigin],
      request: itemRequest,
      responses: { ...mutationErrors, 200: entryResponse },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.retry(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.entry, 200)
        : problem(context, result.status);
    },
  );
}
