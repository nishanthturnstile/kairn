import type { JourneyInputIssue } from "@kairn/contracts";
import { journeyInputIssue } from "@kairn/contracts/journeys";
import { ensureActive } from "./api";
import type { VerifiedMobileScope } from "./session";

export const historyKey = ["journeys", "history"] as const;
export const detailKey = (id: string) => ["journeys", "detail", id] as const;

export class JourneyRequestError extends Error {
  readonly status: number;
  readonly issues: JourneyInputIssue[];

  constructor(status: number, issues: JourneyInputIssue[]) {
    super("The journey request did not complete.");
    this.status = status;
    this.issues = issues;
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
  throw new JourneyRequestError(status, issues);
}
