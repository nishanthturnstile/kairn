import type { JourneyInputIssue } from "@kairn/contracts";
import { journeyInputIssue } from "@kairn/contracts/journeys";
import { ensureActive } from "./api";
import type { VerifiedMobileScope } from "./session";

export const historyKey = ["journeys", "history"] as const;
export const detailKey = (id: string) => ["journeys", "detail", id] as const;
export const journeyInvitationsKey = (id: string) =>
  ["journeys", "invitations", id] as const;

export class JourneyRequestError extends Error {
  readonly status: number;
  readonly issues: JourneyInputIssue[];
  readonly code?: string;

  constructor(status: number, issues: JourneyInputIssue[], code?: string) {
    super("The journey request did not complete.");
    this.status = status;
    this.issues = issues;
    this.code = code;
  }
}

export function journeyResult<Result>(
  result: {
    data?: Result;
    error?: { code: string; issues?: unknown };
    response: Response;
  },
  scope: VerifiedMobileScope,
  refresh: (rejectedScope: VerifiedMobileScope) => void,
) {
  ensureActive(scope.signal);
  if (result.data !== undefined) return result.data;
  const { status } = result.response;
  if (status === 401 || result.error?.code === "account_changed")
    refresh(scope);
  const issues: JourneyInputIssue[] = [];
  if (Array.isArray(result.error?.issues)) {
    for (const issue of result.error.issues) {
      const parsed = journeyInputIssue.safeParse(issue);
      if (parsed.success) issues.push(parsed.data);
    }
  }
  throw new JourneyRequestError(status, issues, result.error?.code);
}

export async function refreshJourneyViews(scope: VerifiedMobileScope) {
  await scope.queryClient.cancelQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "journeys" || queryKey[0] === "dashboard",
  });
  ensureActive(scope.signal);
  void scope.queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "journeys" || queryKey[0] === "dashboard",
  });
}
