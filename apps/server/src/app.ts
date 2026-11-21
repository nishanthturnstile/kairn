import { randomUUID } from "node:crypto";
import { logger } from "@kairn/backend";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { JourneyOperations } from "./http/journeys.js";
import { problem, type RequestEnvironment } from "./http/problem.js";
import { createV1Api, getOpenApiDocument } from "./http/v1.js";
import type { WorkspaceOperations } from "./http/workspace.js";

interface AppDependencies {
  authHandler: (request: Request, requestId: string) => Promise<Response>;
  checkReadiness: () => Promise<void>;
  journeys?: JourneyOperations;
  workspace?: WorkspaceOperations;
  renderUnavailableReader?: () => string;
}

export function createApp({
  authHandler,
  checkReadiness,
  journeys,
  workspace,
  renderUnavailableReader,
}: AppDependencies) {
  const app = new Hono<RequestEnvironment>();
  app.use("*", async (context, next) => {
    const requestId = randomUUID();
    context.set("requestId", requestId);
    await next();
    context.header("X-Request-Id", requestId);
    logger.info(
      { requestId, method: context.req.method, status: context.res.status },
      "HTTP request completed",
    );
  });

  app.onError((error, context) => {
    if (error instanceof HTTPException && error.status === 400) {
      return problem(context, 400);
    }
    logger.error(
      { requestId: context.var.requestId },
      "Unhandled HTTP request",
    );
    return problem(context, 500);
  });
  app.notFound((context) => problem(context, 404));

  app.get("/", (context) => context.json({ service: "kairn-server" }));
  app.get("/api", (context) => context.json({ service: "kairn-server" }));
  app.on("GET", ["/read", "/read/*"], async (context) => {
    context.header("Cache-Control", "private, no-store");
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Robots-Tag", "noindex");
    if (!workspace) return context.redirect("/account", 303);
    const session = await workspace.verifySession(context.req.raw.headers);
    if (session.status !== 200) return context.redirect("/account", 303);
    const progress = await workspace.onboarding(session);
    if (progress.status === 401) return context.redirect("/account", 303);
    if (progress.status !== 200 || progress.progress.state === "pending")
      return context.redirect("/onboarding", 303);
    if (!renderUnavailableReader) {
      const response = problem(context, 404);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    return context.html(renderUnavailableReader(), 404);
  });
  app.use("/api/auth/*", bodyLimit({ maxSize: 16_384 }));
  app.on(["GET", "POST"], "/api/auth/*", (context) =>
    authHandler(context.req.raw, context.var.requestId),
  );

  const v1 = createV1Api(checkReadiness, journeys, workspace);
  const document = getOpenApiDocument(v1);
  app.get("/api/v1/openapi.json", (context) => context.json(document));
  app.route("/", v1);
  return app;
}
