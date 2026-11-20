import { apiProblem } from "@kairn/contracts/schemas";

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
