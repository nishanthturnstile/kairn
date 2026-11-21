import { createRoute, type OpenAPIHono, type z } from "@hono/zod-openapi";
import {
  createJourneyHeaders,
  decideOriginalExport,
  journeyHeaders,
  journeyPageQuery,
  journeyPath,
  membershipRestrictionResult,
  originalExportAuthorization,
  originalExportMetadataNotice,
  originalExportPage,
  originalExportPath,
  originalExportRequest,
  requestOriginalExport,
} from "@kairn/contracts/journeys";
import { bodyLimit } from "hono/body-limit";
import type { JourneyEnvironment, JourneyRouteGuards } from "./journeys.js";
import { errorResponse, privateHeaders, requireJson } from "./openapi.js";
import { problem } from "./problem.js";

const collection = "/api/v1/journeys/{journeyId}/original-exports";
const grant = `${collection}/{grantId}` as const;
const grantRequest = { headers: journeyHeaders, params: originalExportPath };
const errors = {
  400: errorResponse("The request is invalid.", privateHeaders),
  401: errorResponse("A current verified session is required.", privateHeaders),
  404: errorResponse(
    "The export selection or request is unavailable.",
    privateHeaders,
  ),
  409: errorResponse(
    "The viewer account or export request changed.",
    privateHeaders,
  ),
  503: errorResponse("The service is temporarily unavailable.", privateHeaders),
};
const originError = {
  403: errorResponse("The write origin is forbidden.", privateHeaders),
};
const bodyErrors = {
  413: errorResponse("The request exceeds 4096 bytes.", privateHeaders),
  415: errorResponse("A JSON body is required.", privateHeaders),
};

function response<Schema extends z.ZodType>(
  schema: Schema,
  description: string,
) {
  return {
    description,
    headers: privateHeaders,
    content: { "application/json": { schema } },
  };
}

function withMetadataNotice(
  request: Omit<z.input<typeof originalExportRequest>, "metadataNotice">,
) {
  return { ...request, metadataNotice: originalExportMetadataNotice };
}

export function registerOriginalExportRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const service = operations?.originalExport;
  const reads = [protect, authenticate];
  const writes = [protect, authenticate, enforceWriteOrigin];
  const jsonWrites = [
    ...writes,
    requireJson<JourneyEnvironment>(),
    bodyLimit({ maxSize: 4096 }),
  ];

  api.openapi(
    createRoute({
      method: "post",
      path: collection,
      operationId: "requestJourneyOriginalExport",
      middleware: jsonWrites,
      request: {
        headers: createJourneyHeaders,
        params: journeyPath,
        body: {
          required: true,
          content: { "application/json": { schema: requestOriginalExport } },
        },
      },
      responses: {
        ...errors,
        ...originError,
        ...bodyErrors,
        429: errorResponse(
          "The recipient has requested too many exports for this journey.",
          privateHeaders,
        ),
        200: response(
          originalExportRequest,
          "The current state of an earlier identical request.",
        ),
        201: response(
          originalExportRequest,
          "The owner can review the request.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.request(
        context.var.journeys.session,
        context.req.valid("param").journeyId,
        context.req.valid("header")["idempotency-key"],
        context.req.valid("json"),
      );
      if (!("request" in result)) return problem(context, result.status);
      return context.json(
        originalExportRequest.parse(withMetadataNotice(result.request)),
        result.status,
      );
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: collection,
      operationId: "listJourneyOriginalExports",
      middleware: reads,
      request: {
        headers: journeyHeaders,
        params: journeyPath,
        query: journeyPageQuery,
      },
      responses: {
        ...errors,
        200: response(
          originalExportPage,
          "Export requests visible to their owner or current recipient.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.list(
        context.var.journeys.session,
        context.req.valid("param").journeyId,
        context.req.valid("query").cursor ?? null,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(
        originalExportPage.parse({
          ...result.value,
          items: result.value.items.map(withMetadataNotice),
        }),
        200,
      );
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: grant,
      operationId: "readJourneyOriginalExport",
      middleware: reads,
      request: grantRequest,
      responses: {
        ...errors,
        200: response(
          originalExportRequest,
          "The export request, its exact selection, and the metadata notice.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, grantId } = context.req.valid("param");
      const result = await service.detail(
        context.var.journeys.session,
        journeyId,
        grantId,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(
        originalExportRequest.parse(withMetadataNotice(result.value)),
        200,
      );
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: `${grant}/decision`,
      operationId: "decideJourneyOriginalExport",
      middleware: jsonWrites,
      request: {
        ...grantRequest,
        body: {
          required: true,
          content: { "application/json": { schema: decideOriginalExport } },
        },
      },
      responses: {
        ...errors,
        ...originError,
        ...bodyErrors,
        200: response(
          originalExportRequest,
          "The current state of the owner's decision.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, grantId } = context.req.valid("param");
      const result = await service.decide(
        context.var.journeys.session,
        journeyId,
        grantId,
        context.req.valid("json"),
      );
      if (result.status === 409)
        return problem(context, 409, { code: "original_export_changed" });
      if (result.status !== 200) return problem(context, result.status);
      return context.json(
        originalExportRequest.parse(withMetadataNotice(result.request)),
        200,
      );
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: `${grant}/authorization`,
      operationId: "authorizeJourneyOriginalExport",
      middleware: reads,
      request: grantRequest,
      responses: {
        ...errors,
        200: response(
          originalExportAuthorization,
          "The exact selection authorized for the current recipient at the time of the request.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, grantId } = context.req.valid("param");
      const result = await service.authorize(
        context.var.journeys.session,
        journeyId,
        grantId,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(originalExportAuthorization.parse(result.value), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: `${grant}/revoke`,
      operationId: "revokeJourneyOriginalExport",
      middleware: writes,
      request: grantRequest,
      responses: {
        ...errors,
        ...originError,
        200: response(
          membershipRestrictionResult,
          "The export revocation was independently confirmed.",
        ),
        202: response(
          membershipRestrictionResult,
          "The export was revoked. Independent confirmation is pending.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, grantId } = context.req.valid("param");
      const result = await service.revoke(
        context.var.journeys.session,
        journeyId,
        grantId,
      );
      if (result.status === 409)
        return problem(context, 409, { code: "original_export_changed" });
      if (result.status !== 200 && result.status !== 202)
        return problem(context, result.status);
      return context.json(
        membershipRestrictionResult.parse(result),
        result.status,
      );
    },
  );
}
