import type { Context } from "hono";

export type RequestEnvironment = { Variables: { requestId: string } };

const problems = {
  400: { title: "Bad Request", code: "invalid_request" },
  404: { title: "Not Found", code: "not_found" },
  500: { title: "Internal Server Error", code: "internal_error" },
  503: { title: "Service Unavailable", code: "service_unavailable" },
} as const;

export function problem<Status extends keyof typeof problems>(
  context: Context<RequestEnvironment>,
  status: Status,
) {
  return context.json(
    {
      type: "about:blank",
      ...problems[status],
      status,
      requestId: context.var.requestId,
    } as const,
    status,
    {
      "Content-Type": "application/problem+json",
      "Cache-Control": "no-store",
    },
  );
}
