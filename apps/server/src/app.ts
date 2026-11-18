import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { problem, type RequestEnvironment } from "./http/problem.js";
import { createV1Api, getOpenApiDocument } from "./http/v1.js";

interface AppDependencies {
  authHandler: (request: Request) => Promise<Response>;
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
  });

  app.onError((error, context) => {
    if (error instanceof HTTPException && error.status === 400) {
      return problem(context, 400);
    }
    console.error("Unhandled HTTP request", context.var.requestId);
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
  app.on(["GET", "POST"], "/api/auth/*", (context) =>
    authHandler(context.req.raw),
  );

  const v1 = createV1Api(checkReadiness);
  const document = getOpenApiDocument(v1);
  app.get("/api/v1/openapi.json", (context) => context.json(document));
  app.route("/", v1);
  return app;
}
