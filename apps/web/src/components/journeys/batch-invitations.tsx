import { journeyPath } from "@kairn/contracts/journeys";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useReceiptToast } from "@/components/ui/toast";
import { journeyInvitationsKey } from "@/lib/journey-access";
import { JourneyRequestError } from "@/lib/journey-api";
import {
  isInviteDraftList,
  type PendingInviteBatch,
  sendJourneyInvitations,
} from "@/lib/journey-invitations";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";

type Delivery = {
  sourceKey: string;
  pending?: PendingInviteBatch;
  unavailable?: number;
};

function storageKey(scope: AccountScope, journeyId: string) {
  return `kairn:journey-invitations:${scope.accountId}:${journeyId}`;
}

function readDelivery(scope: AccountScope, journeyId: string): Delivery | null {
  try {
    const raw = sessionStorage.getItem(storageKey(scope, journeyId));
    if (!raw) return null;
    const value: Delivery = JSON.parse(raw);
    if (!journeyPath.safeParse({ journeyId: value.sourceKey }).success)
      return null;
    if (
      value.pending &&
      (!journeyPath.safeParse({ journeyId: value.pending.key }).success ||
        !isInviteDraftList(value.pending.drafts) ||
        !value.pending.drafts.length)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

function saveDelivery(
  scope: AccountScope,
  journeyId: string,
  delivery: Delivery,
) {
  const key = storageKey(scope, journeyId);
  if (delivery.pending || delivery.unavailable)
    sessionStorage.setItem(key, JSON.stringify(delivery));
  else sessionStorage.removeItem(key);
}

async function submitDelivery(
  scope: AccountScope,
  refresh: (scope: AccountScope) => void,
  journeyId: string,
  delivery: Delivery,
  signal: AbortSignal,
): Promise<{ updated: Delivery; receipt?: string }> {
  const { pending } = delivery;
  if (!pending) return { updated: delivery };
  let updated: Delivery;
  let receipt: string | undefined;
  try {
    const items = await sendJourneyInvitations(
      scope,
      refresh,
      journeyId,
      pending,
      AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    );
    signal.throwIfAborted();
    void scope.queryClient.invalidateQueries({
      queryKey: journeyInvitationsKey(scope, journeyId),
    });
    const retry = pending.drafts.filter(
      (_, index) => items[index].status === "rate_limited",
    );
    updated = {
      sourceKey: delivery.sourceKey,
      pending: retry.length
        ? { key: crypto.randomUUID(), drafts: retry }
        : undefined,
      unavailable:
        (delivery.unavailable ?? 0) +
        items.filter(
          ({ status }) => status === "invalid_email" || status === "cancelled",
        ).length,
    };
    if (!updated.pending && !updated.unavailable)
      receipt = items.some(({ status }) => status === "queued")
        ? "Invitations sent."
        : "No new invitations were sent.";
  } catch (error) {
    signal.throwIfAborted();
    if (
      !(error instanceof JourneyRequestError) ||
      error.code === "account_changed"
    )
      return { updated: delivery };
    if (error.status === 429)
      updated = {
        ...delivery,
        pending: { ...pending, key: crypto.randomUUID() },
      };
    else if ([400, 403, 404, 409, 422].includes(error.status))
      updated = {
        sourceKey: delivery.sourceKey,
        unavailable: (delivery.unavailable ?? 0) + pending.drafts.length,
      };
    else return { updated: delivery };
  }
  saveDelivery(scope, journeyId, updated);
  return { updated, receipt };
}

type DeliveryStatus = {
  delivery: Delivery | null;
  sending?: boolean;
};

const deliveryKey = (scope: AccountScope, journeyId: string) =>
  [scope.accountId, "gpx-invitation-delivery", journeyId] as const;

function dispatchDelivery(
  scope: AccountScope,
  refresh: (scope: AccountScope) => void,
  journeyId: string,
  delivery: Delivery,
  notify?: (title: string) => void,
) {
  const key = deliveryKey(scope, journeyId);
  if (scope.queryClient.getQueryData<DeliveryStatus>(key)?.sending) return;
  scope.queryClient.setQueryData<DeliveryStatus>(key, {
    delivery,
    sending: true,
  });

  void submitDelivery(scope, refresh, journeyId, delivery, scope.signal)
    .then(({ updated, receipt }) => {
      if (scope.signal.aborted) return;
      scope.queryClient.setQueryData<DeliveryStatus>(key, {
        delivery: updated,
      });
      if (receipt) notify?.(receipt);
    })
    .catch(() => {
      if (!scope.signal.aborted)
        scope.queryClient.setQueryData<DeliveryStatus>(key, { delivery });
    });
}

export function queueJourneyInvitations(
  scope: AccountScope,
  refresh: (scope: AccountScope) => void,
  journeyId: string,
  batch: PendingInviteBatch,
  notify?: (title: string) => void,
) {
  const prior = readDelivery(scope, journeyId);
  if (prior?.sourceKey === batch.key && prior.pending?.key !== batch.key)
    return;
  if (prior?.pending && prior.sourceKey !== batch.key)
    throw new Error("An invitation batch already awaits confirmation.");
  const delivery =
    prior?.sourceKey === batch.key
      ? prior
      : { sourceKey: batch.key, pending: batch };
  saveDelivery(scope, journeyId, delivery);
  dispatchDelivery(scope, refresh, journeyId, delivery, notify);
}

export function useJourneyInvitationDelivery(
  scope: AccountScope,
  journeyId: string,
) {
  return useQuery<DeliveryStatus>({
    queryKey: deliveryKey(scope, journeyId),
    enabled: false,
    initialData: () => ({ delivery: readDelivery(scope, journeyId) }),
  }).data;
}

export function JourneyInvitationStatus({
  scope,
  journeyId,
}: {
  scope: AccountScope;
  journeyId: string;
}) {
  const { refresh } = useSessionAccess();
  const notify = useReceiptToast();
  const key = deliveryKey(scope, journeyId);
  const { delivery, sending } = useJourneyInvitationDelivery(scope, journeyId);

  function dismiss() {
    if (!delivery) return;
    const updated = { ...delivery, unavailable: undefined };
    try {
      saveDelivery(scope, journeyId, updated);
    } catch {
      // Dismiss the notice for this visit if tab storage is unavailable.
    }
    scope.queryClient.setQueryData<DeliveryStatus>(key, { delivery: updated });
  }

  if (!delivery?.pending && !delivery?.unavailable) return null;
  return (
    <Alert variant="warning" role="status">
      <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {delivery?.pending && (
          <span>
            {sending
              ? "Sending invitations…"
              : "Some invitations are awaiting confirmation."}
          </span>
        )}
        {!!delivery?.unavailable && (
          <span>
            Some recipients couldn’t be invited. Check their details and try
            again.
          </span>
        )}
        {!!delivery?.unavailable && !delivery.pending && (
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Dismiss
          </Button>
        )}
        {delivery?.pending && !sending && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              dispatchDelivery(scope, refresh, journeyId, delivery, notify)
            }
          >
            Retry invitations
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
