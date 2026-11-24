import type { JourneyInputIssue } from "@kairn/contracts";
import type { ApiProblemCode } from "@kairn/contracts/schemas";
import type { Context } from "hono";

export type RequestEnvironment = { Variables: { requestId: string } };

const problems = {
  400: { title: "Bad Request", code: "invalid_request" },
  401: { title: "Unauthorized", code: "unauthorized" },
  403: { title: "Forbidden", code: "origin_rejected" },
  404: { title: "Not Found", code: "not_found" },
  409: { title: "Conflict", code: "idempotency_conflict" },
  412: { title: "Precondition Failed", code: "recording_review_changed" },
  413: { title: "Content Too Large", code: "request_too_large" },
  415: { title: "Unsupported Media Type", code: "unsupported_media_type" },
  416: { title: "Range Not Satisfiable", code: "invalid_request" },
  429: { title: "Too Many Requests", code: "rate_limited" },
  500: { title: "Internal Server Error", code: "internal_error" },
  503: { title: "Service Unavailable", code: "service_unavailable" },
} as const;

export function problem<Status extends keyof typeof problems>(
  context: Pick<Context<RequestEnvironment>, "json" | "var">,
  status: Status,
  details?: { code?: ApiProblemCode; issues?: JourneyInputIssue[] },
) {
  return context.json(
    {
      type: "about:blank",
      ...problems[status],
      ...details,
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
