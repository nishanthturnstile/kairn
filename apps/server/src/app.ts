import { randomUUID } from "node:crypto";
import { logger } from "@kairn/backend";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { problem, type RequestEnvironment } from "./http/problem.js";
import { createV1Api, getOpenApiDocument } from "./http/v1.js";

interface AppDependencies {
  authHandler: (request: Request, requestId: string) => Promise<Response>;
  checkReadiness: () => Promise<void>;
  renderUnavailableReader?: () => string;
}

export function createApp({
  authHandler,
  checkReadiness,
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
  if (renderUnavailableReader) {
    app.get("/read/*", (context) =>
      context.html(renderUnavailableReader(), 404, {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      }),
    );
  }
  app.use("/api/auth/*", bodyLimit({ maxSize: 16_384 }));
  app.on(["GET", "POST"], "/api/auth/*", (context) =>
    authHandler(context.req.raw, context.var.requestId),
  );

  const v1 = createV1Api(checkReadiness);
  const document = getOpenApiDocument(v1);
  app.get("/api/v1/openapi.json", (context) => context.json(document));
  app.route("/", v1);
  return app;
}
