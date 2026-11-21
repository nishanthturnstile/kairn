import type { JourneyInputIssue } from "@kairn/contracts";
import { journeyInputIssue } from "@kairn/contracts/journeys";
import type { AccountScope } from "./session";

export class JourneyRequestError extends Error {
  readonly status: number;
  readonly issues: JourneyInputIssue[];

  constructor(status: number, issues: JourneyInputIssue[]) {
    super("The journey request did not complete.");
    this.status = status;
    this.issues = issues;
  }
}

export const historyKey = (scope: AccountScope) => [
  scope.accountId,
  "journey-history",
];

export function journeyResult<Result>(
  result: {
    data?: Result;
    error?: { code: string; issues?: unknown };
    response: Response;
  },
  scope: AccountScope,
  refresh: (rejectedScope: AccountScope) => void,
) {
  scope.signal.throwIfAborted();
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
