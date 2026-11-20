import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { VerifiedSession } from "@kairn/backend";
import type {
  CreateJourney,
  JourneyHistory,
  JourneyHistoryQuery,
  JourneyInputIssue,
  PrivateJourney,
} from "@kairn/contracts";
import {
  createdJourney,
  createJourney,
  createJourneyHeaders,
  journeyHeaders,
  journeyHistory,
  journeyHistoryQuery,
  journeyInputField,
  journeyPath,
  privateJourney,
} from "@kairn/contracts/journeys";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { allowsWriteOrigin, errorResponse, privateHeaders } from "./openapi.js";
import { problem, type RequestEnvironment } from "./problem.js";

interface Unavailable {
  status: 503;
}

export interface JourneyOperations {
  writeOrigins: readonly string[];
  verifySession(
    headers: Headers,
  ): Promise<
    ({ status: 200 } & VerifiedSession) | { status: 401 } | Unavailable
  >;
  create(
    session: VerifiedSession,
    key: string,
    input: CreateJourney & { intendedEnd: string | null },
  ): Promise<
    | { status: 200 | 201; id: string }
    | { status: 400; issue: JourneyInputIssue }
    | { status: 401 | 404 | 409 }
    | Unavailable
  >;
  history(
    session: VerifiedSession,
    query: JourneyHistoryQuery,
  ): Promise<
    | { status: 200; history: JourneyHistory }
    | { status: 400 | 401 }
    | Unavailable
  >;
  detail(
    session: VerifiedSession,
    journeyId: string,
  ): Promise<
    | { status: 200; journey: PrivateJourney; asOf: string }
    | { status: 401 | 404 }
    | Unavailable
  >;
}

type JourneyEnvironment = {
  Variables: RequestEnvironment["Variables"] & {
    journeys: { operations: JourneyOperations; session: VerifiedSession };
  };
};

const journeysPath = "/api/v1/journeys";

const errors = {
  400: errorResponse(
    "Invalid input. Issues identify fields and safe validation codes.",
    privateHeaders,
  ),
  401: errorResponse("A current verified session is required.", privateHeaders),
  404: errorResponse("The journey is unavailable.", privateHeaders),
  409: errorResponse(
    "The verified account changed (account_changed).",
    privateHeaders,
  ),
  500: errorResponse("An unexpected server error occurred.", privateHeaders),
  503: errorResponse(
    "Recovery is closed or the service is temporarily unavailable.",
    privateHeaders,
  ),
};

export function createJourneysApi(operations?: JourneyOperations) {
  const api = new OpenAPIHono<JourneyEnvironment>({
    defaultHook: (result, context) => {
      if (result.success) return;
      const fields = new Set(
        result.error.issues.map(({ path }) => {
          const field = journeyInputField.safeParse(path[0]);
          return field.success ? field.data : "body";
        }),
      );
      return problem(context, 400, {
        issues: [...fields].map((field) => ({ field, code: "invalid_value" })),
      });
    },
  });
  api.onError((error, context) => {
    if (error instanceof HTTPException) {
      if (error.status === 413) return problem(context, 413);
      if (error.status === 415) return problem(context, 415);
      if (error.status === 400)
        return problem(context, 400, {
          issues: [{ field: "body", code: "invalid_value" }],
        });
    }
    throw error;
  });

  const protect = createMiddleware<JourneyEnvironment>(
    async (context, next) => {
      await next();
      context.header("Cache-Control", "private, no-store");
    },
  );
  const authenticate = createMiddleware<JourneyEnvironment>(
    async (context, next) => {
      if (!operations) return problem(context, 503);
      const session = await operations.verifySession(context.req.raw.headers);
      if (session.status !== 200) return problem(context, session.status);

      // Ignore header casing for UUID comparisons and validate its syntax separately.
      const expected = journeyHeaders.safeParse(context.req.header());
      if (!expected.success) {
        return problem(context, 400, {
          issues: [{ field: "x-expected-account", code: "invalid_value" }],
        });
      }
      const expectedAccount = expected.data["x-expected-account"];
      if (
        expectedAccount &&
        expectedAccount.toLowerCase() !== session.accountId.toLowerCase()
      )
        return problem(context, 409, { code: "account_changed" });

      const { accountId, sessionId } = session;
      context.set("journeys", {
        operations,
        session: { accountId, sessionId },
      });
      await next();
    },
  );
  const enforceWriteOrigin = createMiddleware<JourneyEnvironment>(
    async (context, next) => {
      if (
        !allowsWriteOrigin(
          context.req.raw.headers,
          context.var.journeys.operations.writeOrigins,
        )
      )
        return problem(context, 403);
      await next();
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: journeysPath,
      operationId: "createJourney",
      middleware: [
        protect,
        authenticate,
        enforceWriteOrigin,
        bodyLimit({ maxSize: 4096 }),
      ] as const,
      request: {
        headers: createJourneyHeaders,
        body: {
          required: true,
          content: { "application/json": { schema: createJourney } },
        },
      },
      responses: {
        ...errors,
        200: {
          description:
            "A matching creation attempt already committed and the journey is accessible.",
          headers: privateHeaders,
          content: { "application/json": { schema: createdJourney } },
        },
        201: {
          description: "A private journey was created.",
          headers: {
            ...privateHeaders,
            Location: {
              required: true,
              description: "Relative API path to the created journey",
              schema: { type: "string" },
            },
          },
          content: { "application/json": { schema: createdJourney } },
        },
        403: errorResponse("The write origin is forbidden.", privateHeaders),
        409: errorResponse(
          "The key belongs to a different payload (idempotency_conflict) or the verified account changed (account_changed).",
          privateHeaders,
        ),
        413: errorResponse("The body exceeds 4096 bytes.", privateHeaders),
        415: errorResponse("A JSON body is required.", privateHeaders),
      },
    }),
    async (context) => {
      const input = context.req.valid("json");
      const { operations, session } = context.var.journeys;
      const key = context.req.valid("header")["idempotency-key"].toLowerCase();
      const created = await operations.create(session, key, {
        ...input,
        intendedEnd: input.intendedEnd ?? null,
      });
      if (created.status === 400)
        return problem(context, 400, { issues: [created.issue] });
      if (!("id" in created)) return problem(context, created.status);
      const body = createdJourney.parse(created);
      if (created.status === 201)
        context.header("Location", `${journeysPath}/${body.id}`);
      return context.json(body, created.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: journeysPath,
      operationId: "listJourneys",
      description:
        "Omit section and cursor for initial history. Use view=timeline to group journeys by schedule. Supply section and cursor to continue one section.",
      middleware: [protect, authenticate] as const,
      request: { headers: journeyHeaders, query: journeyHistoryQuery },
      responses: {
        ...errors,
        200: {
          description: "The verified account's private history page or pages.",
          headers: privateHeaders,
          content: { "application/json": { schema: journeyHistory } },
        },
      },
    }),
    async (context) => {
      const { operations, session } = context.var.journeys;
      const result = await operations.history(
        session,
        context.req.valid("query"),
      );
      if (result.status === 400)
        return problem(context, 400, {
          issues: [{ field: "cursor", code: "invalid_cursor" }],
        });
      if (result.status !== 200) return problem(context, result.status);
      return context.json(journeyHistory.parse(result.history), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/journeys/{journeyId}",
      operationId: "getJourney",
      middleware: [protect, authenticate] as const,
      request: { headers: journeyHeaders, params: journeyPath },
      responses: {
        ...errors,
        200: {
          description:
            "Private metadata for a journey the caller is a current member of.",
          headers: {
            ...privateHeaders,
            "X-Kairn-As-Of": {
              description: "Server time used to evaluate the journey schedule.",
              required: true,
              schema: { type: "string", format: "date-time" },
            },
          },
          content: { "application/json": { schema: privateJourney } },
        },
      },
    }),
    async (context) => {
      const { operations, session } = context.var.journeys;
      const result = await operations.detail(
        session,
        context.req.valid("param").journeyId,
      );
      if (result.status !== 200) return problem(context, result.status);
      context.header("X-Kairn-As-Of", result.asOf);
      return context.json(privateJourney.parse(result.journey), 200);
    },
  );

  return api;
}
