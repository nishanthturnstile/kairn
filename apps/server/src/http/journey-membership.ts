import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  createJourneyHeaders,
  journeyMemberPath,
  journeyPath,
  membershipRestrictionResult,
  restrictJourneyMembership,
} from "@kairn/contracts/journeys";
import { bodyLimit } from "hono/body-limit";
import type { JourneyEnvironment, JourneyRouteGuards } from "./journeys.js";
import { errorResponse, privateHeaders, requireJson } from "./openapi.js";
import { problem } from "./problem.js";

const replies = {
  200: {
    description:
      "Access is removed and the independent journal confirmed the restriction.",
    headers: privateHeaders,
    content: { "application/json": { schema: membershipRestrictionResult } },
  },
  202: {
    description: "Access is removed. Independent confirmation is pending.",
    headers: privateHeaders,
    content: { "application/json": { schema: membershipRestrictionResult } },
  },
  400: errorResponse("The request is invalid.", privateHeaders),
  401: errorResponse("A current verified session is required.", privateHeaders),
  403: errorResponse("The write origin is forbidden.", privateHeaders),
  404: errorResponse("The journey or member is unavailable.", privateHeaders),
  409: errorResponse(
    "The last administrator cannot depart, the membership or account changed, or the operation key belongs to another request.",
    privateHeaders,
  ),
  413: errorResponse("The request exceeds 4096 bytes.", privateHeaders),
  415: errorResponse("A JSON body is required.", privateHeaders),
  503: errorResponse("The service is temporarily unavailable.", privateHeaders),
};

export function registerJourneyMembershipRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const middleware = [
    protect,
    authenticate,
    enforceWriteOrigin,
    requireJson<JourneyEnvironment>(),
    bodyLimit({ maxSize: 4096 }),
  ];
  const service = operations?.restrictMembership;
  for (const route of [
    {
      path: "/api/v1/journeys/{journeyId}/members/{memberId}/remove",
      operationId: "removeJourneyMember",
      params: journeyMemberPath,
    },
    {
      path: "/api/v1/journeys/{journeyId}/leave",
      operationId: "leaveJourney",
      params: journeyPath,
    },
  ] as const) {
    api.openapi(
      createRoute({
        method: "post",
        path: route.path,
        operationId: route.operationId,
        middleware,
        request: {
          params: route.params,
          headers: createJourneyHeaders,
          body: {
            required: true,
            content: {
              "application/json": { schema: restrictJourneyMembership },
            },
          },
        },
        responses: replies,
      }),
      async (context) => {
        if (!service) return problem(context, 503);
        const params = context.req.valid("param");
        const result = await service(
          context.var.journeys.session,
          params.journeyId,
          "memberId" in params ? params.memberId : null,
          context.req.valid("json").membershipGeneration,
          context.req.valid("header")["idempotency-key"],
        );
        if (result.status === 409)
          return problem(context, 409, { code: result.code });
        if (result.status !== 200 && result.status !== 202)
          return problem(context, result.status);
        return context.json(
          membershipRestrictionResult.parse(result),
          result.status,
        );
      },
    );
  }
}
