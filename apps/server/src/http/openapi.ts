import { apiProblem } from "@kairn/contracts/schemas";

export const requestIdHeader = {
  "X-Request-Id": {
    description: "Server-generated request ID",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
} as const;

export function errorResponse(description: string, headers = requestIdHeader) {
  return {
    description,
    headers,
    content: { "application/problem+json": { schema: apiProblem } },
  };
}
