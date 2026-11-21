import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  editorialCapabilityRemoval,
  editorialCapabilityResult,
  journeyHeaders,
  journeyMemberPath,
  updateEditorialCapability,
} from "@kairn/contracts/journeys";
import { bodyLimit } from "hono/body-limit";
import type { JourneyEnvironment, JourneyRouteGuards } from "./journeys.js";
import { errorResponse, privateHeaders, requireJson } from "./openapi.js";
import { problem } from "./problem.js";

export function registerJourneyEditorialRoute(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const service = operations?.updateEditorialCapability;
  api.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/journeys/{journeyId}/members/{memberId}/editorial-capability",
      operationId: "updateJourneyEditorialCapability",
      middleware: [
        protect,
        authenticate,
        enforceWriteOrigin,
        requireJson<JourneyEnvironment>(),
        bodyLimit({ maxSize: 4096 }),
      ],
      request: {
        params: journeyMemberPath,
        headers: journeyHeaders,
        body: {
          required: true,
          content: {
            "application/json": { schema: updateEditorialCapability },
          },
        },
      },
      responses: {
        200: {
          description: "The role was assigned or its removal was confirmed.",
          headers: privateHeaders,
          content: {
            "application/json": { schema: editorialCapabilityResult },
          },
        },
        202: {
          description:
            "The role was removed. Independent confirmation is pending.",
          headers: privateHeaders,
          content: {
            "application/json": { schema: editorialCapabilityRemoval },
          },
        },
        400: errorResponse("The request is invalid.", privateHeaders),
        401: errorResponse(
          "A current verified session is required.",
          privateHeaders,
        ),
        403: errorResponse("The write origin is forbidden.", privateHeaders),
        404: errorResponse(
          "The journey or member is unavailable.",
          privateHeaders,
        ),
        409: errorResponse(
          "The viewer account, membership or role changed.",
          privateHeaders,
        ),
        413: errorResponse("The request exceeds 4096 bytes.", privateHeaders),
        415: errorResponse("A JSON body is required.", privateHeaders),
        503: errorResponse(
          "The service is temporarily unavailable.",
          privateHeaders,
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, memberId } = context.req.valid("param");
      const result = await service(
        context.var.journeys.session,
        journeyId,
        memberId,
        context.req.valid("json"),
      );
      if (result.status === 200)
        return context.json(editorialCapabilityResult.parse(result), 200);
      if (result.status === 202)
        return context.json(editorialCapabilityRemoval.parse(result), 202);
      if (result.status === 409)
        return problem(context, 409, { code: result.code });
      return problem(context, result.status);
    },
  );
}
