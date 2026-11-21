import { createRoute, type OpenAPIHono, type z } from "@hono/zod-openapi";
import {
  acceptJourneyInvitation,
  createdJourney,
  createJourneyHeaders,
  exchangeJourneyInvitation,
  issueJourneyInvitations,
  journeyHeaders,
  journeyInvitationBatchResult,
  journeyInvitationContinuation,
  journeyInvitationOperation,
  journeyInvitationPage,
  journeyInvitationPath,
  journeyInvitationReview,
  journeyInviteeMatches,
  journeyPageQuery,
  journeyPath,
  reviewJourneyInvitation,
  searchJourneyInvitees,
} from "@kairn/contracts/journeys";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type {
  JourneyEnvironment,
  JourneyOperations,
  JourneyRouteGuards,
} from "./journeys.js";
import { errorResponse, privateHeaders, requireJson } from "./openapi.js";
import { problem } from "./problem.js";

const journeyInvitationsPath = "/api/v1/journeys/{journeyId}/invitations";
const invitationPath = "/api/v1/journey-invitations";

const errors = {
  400: errorResponse("The request is invalid.", privateHeaders),
  401: errorResponse("A current verified session is required.", privateHeaders),
  404: errorResponse(
    "The journey or invitation is unavailable.",
    privateHeaders,
  ),
  409: errorResponse(
    "The account changed, the operation key belongs to another request, or the invitation has been accepted.",
    privateHeaders,
  ),
  500: errorResponse("An unexpected server error occurred.", privateHeaders),
  503: errorResponse("The service is temporarily unavailable.", privateHeaders),
};

const writeErrors = {
  ...errors,
  403: errorResponse("The write origin is forbidden.", privateHeaders),
};

const manageErrors = {
  429: errorResponse(
    "The organiser has reached the invitation operation limit.",
    privateHeaders,
  ),
};

const jsonErrors = {
  ...writeErrors,
  413: errorResponse("The request exceeds 4096 bytes.", privateHeaders),
  415: errorResponse("A JSON body is required.", privateHeaders),
};

const referrer = createMiddleware<JourneyEnvironment>(async (context, next) => {
  await next();
  context.header("Referrer-Policy", "no-referrer");
});
function body<Schema extends z.ZodType>(schema: Schema) {
  return {
    required: true,
    content: { "application/json": { schema } },
  } as const;
}

function response<Schema extends z.ZodType>(
  description: string,
  schema: Schema,
) {
  return {
    description,
    headers: privateHeaders,
    content: { "application/json": { schema } },
  };
}

type Managed = Awaited<
  ReturnType<NonNullable<JourneyOperations["invitations"]>["manage"]>
>;

function manageResponse(context: Context<JourneyEnvironment>, result: Managed) {
  if (result.status !== 200) {
    const code = "code" in result ? result.code : undefined;
    return problem(context, result.status, code ? { code } : undefined);
  }
  return context.json(journeyInvitationBatchResult.parse(result.result), 200);
}

export function registerJourneyInvitationRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const invitations = operations?.invitations;
  const json = requireJson<JourneyEnvironment>();
  const maxBodySize = bodyLimit({ maxSize: 4096 });
  const reads = [protect, referrer, authenticate];
  const writes = [...reads, enforceWriteOrigin];
  const jsonWrites = [...writes, json, maxBodySize];

  api.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/journeys/{journeyId}/invitees/search",
      operationId: "searchJourneyInvitees",
      middleware: jsonWrites,
      request: {
        headers: journeyHeaders,
        params: journeyPath,
        body: body(searchJourneyInvitees),
      },
      responses: {
        ...jsonErrors,
        ...manageErrors,
        200: response(
          "Opted-in members with short-lived invitation selections.",
          journeyInviteeMatches,
        ),
      },
    }),
    async (context) => {
      if (!invitations) return problem(context, 503);
      const result = await invitations.search(
        context.var.journeys.session,
        context.req.valid("param").journeyId,
        context.req.valid("json").query,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(journeyInviteeMatches.parse(result), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: journeyInvitationsPath,
      operationId: "listJourneyInvitations",
      middleware: reads,
      request: {
        headers: journeyHeaders,
        params: journeyPath,
        query: journeyPageQuery,
      },
      responses: {
        ...errors,
        200: response(
          "Pending and expired invitations visible to a current administrator.",
          journeyInvitationPage,
        ),
      },
    }),
    async (context) => {
      if (!invitations) return problem(context, 503);
      const result = await invitations.list(
        context.var.journeys.session,
        context.req.valid("param").journeyId,
        context.req.valid("query").cursor,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(journeyInvitationPage.parse(result.page), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: journeyInvitationsPath,
      operationId: "issueJourneyInvitations",
      middleware: [...writes, json, bodyLimit({ maxSize: 16_384 })],
      request: {
        headers: createJourneyHeaders,
        params: journeyPath,
        body: body(issueJourneyInvitations),
      },
      responses: {
        ...jsonErrors,
        ...manageErrors,
        413: errorResponse("The request exceeds 16384 bytes.", privateHeaders),
        200: response(
          "The recorded outcome for each address in request order.",
          journeyInvitationBatchResult,
        ),
      },
    }),
    async (context) => {
      if (!invitations) return problem(context, 503);
      return manageResponse(
        context,
        await invitations.manage(
          context.var.journeys.session,
          context.req.valid("param").journeyId,
          context.req.valid("header")["idempotency-key"],
          { type: "issue", ...context.req.valid("json") },
        ),
      );
    },
  );

  for (const type of ["resend", "cancel"] as const) {
    api.openapi(
      createRoute({
        method: "post",
        path: `${journeyInvitationsPath}/{invitationId}/${type}`,
        operationId:
          type === "resend"
            ? "resendJourneyInvitation"
            : "cancelJourneyInvitation",
        middleware: writes,
        request: {
          headers: createJourneyHeaders,
          params: journeyInvitationPath,
        },
        responses: {
          ...writeErrors,
          ...manageErrors,
          200: response(
            "The recorded decision for the scoped invitation.",
            journeyInvitationBatchResult,
          ),
        },
      }),
      async (context) => {
        if (!invitations) return problem(context, 503);
        const { journeyId, invitationId } = context.req.valid("param");
        return manageResponse(
          context,
          await invitations.manage(
            context.var.journeys.session,
            journeyId,
            context.req.valid("header")["idempotency-key"],
            { type, invitationId },
          ),
        );
      },
    );
  }

  api.openapi(
    createRoute({
      method: "post",
      path: `${invitationPath}/continue`,
      operationId: "exchangeJourneyInvitation",
      middleware: [
        protect,
        referrer,
        enforceWriteOrigin,
        json,
        maxBodySize,
      ] as const,
      request: { body: body(exchangeJourneyInvitation) },
      responses: {
        ...jsonErrors,
        200: response(
          "A brief opaque continuation for private review.",
          journeyInvitationContinuation,
        ),
      },
    }),
    async (context) => {
      if (!invitations) return problem(context, 503);
      const result = await invitations.exchange(
        context.req.valid("json").token,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(journeyInvitationContinuation.parse(result), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: `${invitationPath}/review`,
      operationId: "reviewJourneyInvitation",
      middleware: jsonWrites,
      request: { headers: journeyHeaders, body: body(reviewJourneyInvitation) },
      responses: {
        ...jsonErrors,
        200: response(
          "A verified recipient's private invitation review or a generic state.",
          journeyInvitationReview,
        ),
      },
    }),
    async (context) => {
      if (!invitations) return problem(context, 503);
      const result = await invitations.review(
        context.var.journeys.session,
        context.req.valid("json").continuation,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(journeyInvitationReview.parse(result.review), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: `${invitationPath}/accept`,
      operationId: "acceptJourneyInvitation",
      middleware: jsonWrites,
      request: { headers: journeyHeaders, body: body(acceptJourneyInvitation) },
      responses: {
        ...jsonErrors,
        200: response(
          "The ID of the existing journey joined as a Participant.",
          createdJourney,
        ),
      },
    }),
    async (context) => {
      if (!invitations) return problem(context, 503);
      const { continuation, operationId } = context.req.valid("json");
      const result = await invitations.accept(
        context.var.journeys.session,
        continuation,
        operationId,
      );
      if (result.status !== 200) {
        const code = "code" in result ? result.code : undefined;
        return problem(context, result.status, code ? { code } : undefined);
      }
      return context.json(createdJourney.parse(result), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: `${invitationPath}/acceptance-status`,
      operationId: "getJourneyInvitationAcceptance",
      middleware: jsonWrites,
      request: {
        headers: journeyHeaders,
        body: body(journeyInvitationOperation),
      },
      responses: {
        ...jsonErrors,
        200: response(
          "A committed acceptance whose membership generation is still current.",
          createdJourney,
        ),
      },
    }),
    async (context) => {
      if (!invitations) return problem(context, 503);
      const result = await invitations.acceptanceStatus(
        context.var.journeys.session,
        context.req.valid("json").operationId,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(createdJourney.parse(result), 200);
    },
  );
}
