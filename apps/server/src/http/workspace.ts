import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { VerifiedSession } from "@kairn/backend";
import type {
  AdvanceOnboarding,
  DashboardSummary,
  OnboardingProgress,
} from "@kairn/contracts";
import { dashboardSummary, journeyHeaders } from "@kairn/contracts/journeys";
import {
  accountProfile,
  advanceOnboarding,
  onboardingProgress,
  updateProfile,
} from "@kairn/contracts/schemas";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { JourneyOperations } from "./journeys.js";
import { allowsWriteOrigin, errorResponse, privateHeaders } from "./openapi.js";
import { problem, type RequestEnvironment } from "./problem.js";

export interface WorkspaceOperations {
  verifySession: JourneyOperations["verifySession"];
  writeOrigins: readonly string[];
  onboarding(
    session: VerifiedSession,
    confirmation?: AdvanceOnboarding,
  ): Promise<
    { status: 200; progress: OnboardingProgress } | { status: 401 | 409 | 503 }
  >;
  profile(
    session: VerifiedSession,
    displayName?: string,
  ): Promise<
    { status: 200; profile: { displayName: string } } | { status: 401 | 503 }
  >;
  dashboard(
    session: VerifiedSession,
  ): Promise<
    { status: 200; summary: DashboardSummary } | { status: 401 | 503 }
  >;
}

type WorkspaceEnvironment = {
  Variables: RequestEnvironment["Variables"] & {
    workspace: { operations: WorkspaceOperations; session: VerifiedSession };
  };
};

const expectedAccount = journeyHeaders.required();
const errors = {
  400: errorResponse("The request is invalid.", privateHeaders),
  401: errorResponse("A current verified session is required.", privateHeaders),
  409: errorResponse(
    "The account or onboarding checkpoint changed.",
    privateHeaders,
  ),
  503: errorResponse("The service is temporarily unavailable.", privateHeaders),
};
const progressResponse = {
  description: "The verified account’s current onboarding checkpoint.",
  headers: privateHeaders,
  content: { "application/json": { schema: onboardingProgress } },
};
const profileResponse = {
  description: "The current account’s display profile.",
  headers: privateHeaders,
  content: { "application/json": { schema: accountProfile } },
};
const writeErrors = {
  ...errors,
  403: errorResponse("The write origin is forbidden.", privateHeaders),
  413: errorResponse("The body exceeds 1024 bytes.", privateHeaders),
  415: errorResponse("A JSON body is required.", privateHeaders),
};

export function createWorkspaceApi(operations?: WorkspaceOperations) {
  const api = new OpenAPIHono<WorkspaceEnvironment>({
    defaultHook: (result, context) => {
      if (!result.success) return problem(context, 400);
    },
  });
  api.onError((error, context) => {
    if (error instanceof HTTPException) {
      if (error.status === 400) return problem(context, 400);
      if (error.status === 413) return problem(context, 413);
    }
    throw error;
  });
  const protect = createMiddleware<WorkspaceEnvironment>(
    async (context, next) => {
      await next();
      context.header("Cache-Control", "private, no-store");
    },
  );
  const authenticate = createMiddleware<WorkspaceEnvironment>(
    async (context, next) => {
      if (!operations) return problem(context, 503);
      const session = await operations.verifySession(context.req.raw.headers);
      if (session.status !== 200) return problem(context, session.status);
      const account = expectedAccount.safeParse(context.req.header());
      if (!account.success) return problem(context, 400);
      if (
        account.data["x-expected-account"].toLowerCase() !==
        session.accountId.toLowerCase()
      )
        return problem(context, 409, { code: "account_changed" });
      context.set("workspace", { operations, session });
      await next();
    },
  );
  const guardWrite = createMiddleware<WorkspaceEnvironment>(
    async (context, next) => {
      if (
        !allowsWriteOrigin(
          context.req.raw.headers,
          context.var.workspace.operations.writeOrigins,
        )
      )
        return problem(context, 403);
      if (
        context.req.header("content-type")?.split(";")[0] !== "application/json"
      )
        return problem(context, 415);
      await next();
    },
  );
  const writeMiddleware = [
    protect,
    authenticate,
    guardWrite,
    bodyLimit({ maxSize: 1024 }),
  ] as const;

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/onboarding",
      operationId: "getOnboarding",
      request: { headers: expectedAccount },
      middleware: [protect, authenticate] as const,
      responses: { ...errors, 200: progressResponse },
    }),
    async (context) => {
      const { operations, session } = context.var.workspace;
      const result = await operations.onboarding(session);
      if (result.status !== 200) return problem(context, result.status);
      return context.json(onboardingProgress.parse(result.progress), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/onboarding",
      operationId: "confirmOnboardingStep",
      request: {
        headers: expectedAccount,
        body: {
          required: true,
          content: { "application/json": { schema: advanceOnboarding } },
        },
      },
      middleware: [...writeMiddleware] as const,
      responses: { ...writeErrors, 200: progressResponse },
    }),
    async (context) => {
      const { operations, session } = context.var.workspace;
      const result = await operations.onboarding(
        session,
        context.req.valid("json"),
      );
      if (result.status === 409)
        return problem(context, 409, { code: "checkpoint_changed" });
      if (result.status !== 200) return problem(context, result.status);
      return context.json(onboardingProgress.parse(result.progress), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/profile",
      operationId: "getAccountProfile",
      request: { headers: expectedAccount },
      middleware: [protect, authenticate] as const,
      responses: { ...errors, 200: profileResponse },
    }),
    async (context) => {
      const { operations, session } = context.var.workspace;
      const result = await operations.profile(session);
      if (result.status !== 200) return problem(context, result.status);
      return context.json(accountProfile.parse(result.profile), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "patch",
      path: "/api/v1/profile",
      operationId: "updateAccountProfile",
      request: {
        headers: expectedAccount,
        body: {
          required: true,
          content: { "application/json": { schema: updateProfile } },
        },
      },
      middleware: [...writeMiddleware] as const,
      responses: { ...writeErrors, 200: profileResponse },
    }),
    async (context) => {
      const { operations, session } = context.var.workspace;
      const result = await operations.profile(
        session,
        context.req.valid("json").displayName,
      );
      if (result.status !== 200) return problem(context, result.status);
      return context.json(accountProfile.parse(result.profile), 200);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/dashboard",
      operationId: "getDashboard",
      request: { headers: expectedAccount },
      middleware: [protect, authenticate] as const,
      responses: {
        ...errors,
        200: {
          description: "A bounded overview of the verified account’s journeys.",
          headers: privateHeaders,
          content: { "application/json": { schema: dashboardSummary } },
        },
      },
    }),
    async (context) => {
      const { operations, session } = context.var.workspace;
      const result = await operations.dashboard(session);
      if (result.status !== 200) return problem(context, result.status);
      return context.json(dashboardSummary.parse(result.summary), 200);
    },
  );

  return api;
}
