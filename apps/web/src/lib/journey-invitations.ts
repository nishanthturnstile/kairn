import {
  invitationRecipient,
  journeyInvitationBatchResult,
  journeyInvitationPage,
} from "@kairn/contracts/journeys";
import { useInfiniteQuery } from "@tanstack/react-query";
import { accessRecheckInterval, journeyInvitationsKey } from "./journey-access";
import { journeyResult } from "./journey-api";
import type { AccountScope } from "./session";
import { useSessionAccess } from "./session-access";

export function useJourneyInvitations(
  scope: AccountScope,
  journeyId: string,
  enabled: boolean,
) {
  const { refresh } = useSessionAccess();
  return useInfiniteQuery({
    queryKey: journeyInvitationsKey(scope, journeyId),
    initialPageParam: undefined as string | undefined,
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: accessRecheckInterval,
    async queryFn({ pageParam: cursor, signal }) {
      const result = await scope.api.GET(
        "/api/v1/journeys/{journeyId}/invitations",
        { params: { path: { journeyId }, query: { cursor } }, signal },
      );
      return result.response.status === 404
        ? null
        : journeyInvitationPage.parse(journeyResult(result, scope, refresh));
    },
    getNextPageParam: (page) => page?.nextCursor ?? undefined,
  });
}

export type Recipient = ReturnType<typeof invitationRecipient.parse>;
type Outcome = ReturnType<
  typeof journeyInvitationBatchResult.parse
>["items"][number]["status"];
export const invitationStatusLabels: Record<Outcome, string> = {
  queued: "Invitation queued",
  already_pending: "Already invited",
  already_member: "Already a journey member",
  invalid_email:
    "This recipient is unavailable. Remove this row and try again.",
  duplicate: "Already included in this batch",
  rate_limited: "Send limit reached. Try again later.",
  cancelled: "Invitation cancelled",
};
export type InviteDraft = {
  id: string;
  label: string;
  recipient: Recipient;
  status?: Outcome;
};
export type PendingInviteBatch = { key: string; drafts: InviteDraft[] };

export async function sendJourneyInvitations(
  scope: AccountScope,
  refresh: (rejectedScope: AccountScope) => void,
  journeyId: string,
  batch: PendingInviteBatch,
  signal?: AbortSignal,
) {
  const response = await scope.api.POST(
    "/api/v1/journeys/{journeyId}/invitations",
    {
      params: {
        path: { journeyId },
        header: { "idempotency-key": batch.key },
      },
      body: { recipients: batch.drafts.map(({ recipient }) => recipient) },
      signal,
    },
  );
  const { items } = journeyInvitationBatchResult.parse(
    journeyResult(response, scope, refresh),
  );
  if (items.length !== batch.drafts.length)
    throw new Error("Incomplete invitation result.");
  return items;
}

export function isInviteDraftList(value: unknown): value is InviteDraft[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        invitationRecipient.safeParse(item.recipient).success &&
        (item.status === undefined ||
          Object.hasOwn(invitationStatusLabels, item.status)),
    )
  );
}
