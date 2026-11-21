import { apiProblem } from "@kairn/contracts/schemas";
import { createMiddleware } from "hono/factory";
import { problem, type RequestEnvironment } from "./problem.js";

export const requestIdHeader = {
  "X-Request-Id": {
    description: "Server-generated request ID",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
} as const;

export const privateHeaders = {
  ...requestIdHeader,
  "Cache-Control": {
    required: true,
    schema: { type: "string", const: "private, no-store" },
  },
} as const;

export function allowsWriteOrigin(
  headers: Headers,
  origins: readonly string[],
) {
  const origin = headers.get("origin");
  return origin === null
    ? !headers.has("sec-fetch-site")
    : origins.includes(origin);
}

export function errorResponse(description: string, headers = requestIdHeader) {
  return {
    description,
    headers,
    content: { "application/problem+json": { schema: apiProblem } },
  };
}

export function requireJson<Environment extends RequestEnvironment>() {
  return createMiddleware<Environment>(async (context, next) => {
    const mediaType = context.req.header("content-type")?.split(";")[0];
    if (mediaType?.trim().toLowerCase() !== "application/json")
      return problem(context, 415);
    await next();
  });
}
