import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  journeyHeaders,
  journeySourcePath,
  journeySourceReview,
  sourceReviewNarrowing,
  sourceReviewWithdrawal,
  updateSourceReview,
} from "@kairn/contracts/journeys";
import { bodyLimit } from "hono/body-limit";
import type { JourneyEnvironment, JourneyRouteGuards } from "./journeys.js";
import { errorResponse, privateHeaders, requireJson } from "./openapi.js";
import { problem } from "./problem.js";

const path = "/api/v1/journeys/{journeyId}/sources/{sourceId}/review";
const request = { params: journeySourcePath, headers: journeyHeaders };
const errors = {
  400: errorResponse("The request is invalid.", privateHeaders),
  401: errorResponse("A current verified session is required.", privateHeaders),
  404: errorResponse("The source or journey is unavailable.", privateHeaders),
  409: errorResponse(
    "The viewer account or source grant changed.",
    privateHeaders,
  ),
  503: errorResponse("The service is temporarily unavailable.", privateHeaders),
};

export function registerSourceReviewRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const service = operations?.sourceReview;
  api.openapi(
    createRoute({
      method: "get",
      path,
      operationId: "readJourneySourceReview",
      middleware: [protect, authenticate],
      request,
      responses: {
        ...errors,
        200: {
          description: "The current source review permission.",
          headers: privateHeaders,
          content: { "application/json": { schema: journeySourceReview } },
        },
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, sourceId } = context.req.valid("param");
      const result = await service.read(
        context.var.journeys.session,
        journeyId,
        sourceId,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(journeySourceReview.parse(result.review), 200);
    },
  );

  const restrictionResult = z.union([
    sourceReviewNarrowing,
    sourceReviewWithdrawal,
  ]);
  const updatedReview = z.union([journeySourceReview, restrictionResult]);
  api.openapi(
    createRoute({
      method: "post",
      path,
      operationId: "updateJourneySourceReview",
      middleware: [
        protect,
        authenticate,
        enforceWriteOrigin,
        requireJson<JourneyEnvironment>(),
        bodyLimit({ maxSize: 4096 }),
      ],
      request: {
        ...request,
        body: {
          required: true,
          content: { "application/json": { schema: updateSourceReview } },
        },
      },
      responses: {
        ...errors,
        200: {
          description:
            "Sharing changed or the source restriction was confirmed.",
          headers: privateHeaders,
          content: { "application/json": { schema: updatedReview } },
        },
        202: {
          description:
            "The source permission was restricted. Independent confirmation is pending.",
          headers: privateHeaders,
          content: { "application/json": { schema: restrictionResult } },
        },
        403: errorResponse("The write origin is forbidden.", privateHeaders),
        413: errorResponse("The request exceeds 4096 bytes.", privateHeaders),
        415: errorResponse("A JSON body is required.", privateHeaders),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, sourceId } = context.req.valid("param");
      const result = await service.update(
        context.var.journeys.session,
        journeyId,
        sourceId,
        context.req.valid("json"),
      );
      if (result.status === 200)
        return context.json(updatedReview.parse(result), 200);
      if (result.status === 202)
        return context.json(restrictionResult.parse(result), 202);
      if (result.status === 409)
        return problem(context, 409, { code: "source_grant_changed" });
      return problem(context, result.status);
    },
  );
}
