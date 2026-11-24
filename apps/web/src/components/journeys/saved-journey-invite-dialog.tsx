import {
  journeyInvitationBatchResult,
  type journeyInvitationPage,
} from "@kairn/contracts/journeys";
import { cn } from "cn";
import { UserRoundPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useReceiptToast } from "@/components/ui/toast";
import { journeyInvitationsKey } from "@/lib/journey-access";
import { journeyResult } from "@/lib/journey-api";
import {
  type InviteDraft,
  useJourneyInvitations,
} from "@/lib/journey-invitations";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import {
  JourneyInvitationStatus,
  queueJourneyInvitations,
  useJourneyInvitationDelivery,
} from "./batch-invitations";
import { InviteComposer } from "./invite-composer";
import { JourneyLoading, JourneyRetry } from "./states";

type Invitation = ReturnType<
  typeof journeyInvitationPage.parse
>["items"][number];
const deliveryLabels = {
  queued: "Queued",
  sent: "Sent",
  failed: "Delivery failed",
  expired: "Expired",
};

export function SavedJourneyInviteDialog({
  scope,
  journeyId,
  title,
  focusOnMount,
}: {
  scope: AccountScope;
  journeyId: string;
  title: string;
  focusOnMount?: boolean;
}) {
  const notify = useReceiptToast();
  const { refresh } = useSessionAccess();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    const frame = requestAnimationFrame(() => trigger.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusOnMount]);
  const [drafts, setDrafts] = useState<InviteDraft[]>([]);
  const [confirm, setConfirm] = useState<{ id: string; key: string }>();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string>();
  const cancellation = useRef(false);
  const confirmation = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const invitations = useJourneyInvitations(scope, journeyId, open);
  const { delivery, sending } = useJourneyInvitationDelivery(scope, journeyId);
  const items =
    invitations.data?.pages.flatMap((page) => page?.items ?? []) ?? [];
  const scrollable = items.length > 3;
  const currentList =
    invitations.isFetchedAfterMount &&
    invitations.dataUpdatedAt >= openedAt &&
    !invitations.isError;
  const canManage =
    currentList && !invitations.data?.pages.some((page) => page === null);
  const active = items.filter(({ decision }) => decision === "pending");
  const invitedEmails = new Set(
    active.flatMap(({ email }) => (email ? [email.toLowerCase()] : [])),
  );
  const unsent = drafts.filter(
    ({ recipient }) =>
      !("email" in recipient) || !invitedEmails.has(recipient.email),
  );

  function send() {
    if (!canManage || delivery?.pending || cancelling || !unsent.length) return;
    try {
      queueJourneyInvitations(
        scope,
        refresh,
        journeyId,
        { key: crypto.randomUUID(), drafts: unsent },
        notify,
      );
      setDrafts([]);
      setError(undefined);
      setOpen(false);
    } catch {
      if (!scope.signal.aborted)
        setError("Couldn’t start sending invitations. Try again.");
    }
  }

  async function cancel(invitation: Invitation) {
    if (!canManage || confirm?.id !== invitation.id || cancellation.current)
      return;
    cancellation.current = true;
    setCancelling(true);
    setError(undefined);
    try {
      const response = await scope.api.POST(
        "/api/v1/journeys/{journeyId}/invitations/{invitationId}/cancel",
        {
          params: {
            header: { "idempotency-key": confirm.key },
            path: { journeyId, invitationId: invitation.id },
          },
          signal: AbortSignal.any([scope.signal, AbortSignal.timeout(8000)]),
        },
      );
      const [outcome] = journeyInvitationBatchResult.parse(
        journeyResult(response, scope, refresh),
      ).items;
      if (outcome?.status !== "cancelled")
        throw new Error("Cancellation was not confirmed.");
      await scope.queryClient.invalidateQueries({
        queryKey: journeyInvitationsKey(scope, journeyId),
      });
      scope.signal.throwIfAborted();
      setConfirm(undefined);
      notify("Invitation cancelled.");
      listHeading.current?.focus();
    } catch {
      if (!scope.signal.aborted)
        setError("Couldn’t confirm the cancellation. Try again.");
    } finally {
      cancellation.current = false;
      if (!scope.signal.aborted) setCancelling(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next && cancelling) details.cancel();
        else {
          if (next) setOpenedAt(Date.now());
          else setError(undefined);
          setOpen(next);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            ref={trigger}
            type="button"
            variant="outline"
            className="bg-secondary"
          />
        }
      >
        <UserRoundPlus aria-hidden="true" data-icon="inline-start" />
        Invite people
      </DialogTrigger>
      <DialogContent
        finalFocus={trigger}
        className="w-[min(32rem,calc(100%-16px))]"
      >
        <DialogTitle>Invite people</DialogTitle>
        <DialogDescription>
          Add people as Participants or manage existing invitations.
        </DialogDescription>
        <section className="grid min-w-0 gap-2 border-b border-border py-3">
          <h2 ref={listHeading} tabIndex={-1} className="font-semibold">
            Invitations
          </h2>
          {invitations.isError ? (
            <JourneyRetry
              title="Couldn’t load invitations"
              busy={invitations.isFetching}
              retry={() => void invitations.refetch()}
            />
          ) : !currentList ? (
            <JourneyLoading label="Loading invitations" />
          ) : !canManage ? (
            <p className="text-sm text-muted-foreground">
              Invitations are unavailable.
            </p>
          ) : items.length ? (
            <ul
              aria-label="Existing invitations"
              tabIndex={scrollable ? 0 : undefined}
              className={cn(
                "grid min-w-0 divide-y divide-border",
                scrollable &&
                  "max-h-[min(13rem,35dvh)] overflow-y-auto scroll-py-1 [scrollbar-color:var(--color-input)_transparent] [scrollbar-gutter:stable]",
              )}
            >
              {items.map((invitation) => {
                const label =
                  invitation.displayName ?? invitation.email ?? "Recipient";
                const confirming = confirm?.id === invitation.id;
                return (
                  <li key={invitation.id} className="grid min-w-0 gap-2 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold wrap-anywhere">{label}</p>
                        <p className="text-sm text-muted-foreground">
                          {
                            deliveryLabels[
                              invitation.decision === "expired"
                                ? "expired"
                                : invitation.delivery
                            ]
                          }
                        </p>
                      </div>
                      {invitation.decision === "pending" && !confirming && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={cancelling || sending}
                          aria-label={`Cancel invitation to ${label}`}
                          onClick={() => {
                            setConfirm({
                              id: invitation.id,
                              key: crypto.randomUUID(),
                            });
                            setError(undefined);
                            requestAnimationFrame(() =>
                              confirmation.current?.focus(),
                            );
                          }}
                        >
                          Cancel invitation
                        </Button>
                      )}
                    </div>
                    {confirming && invitation.decision === "pending" && (
                      <div className="grid gap-2 rounded-control border border-border p-2">
                        <p className="text-sm">
                          Cancel this invitation? The link will stop working.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            ref={confirmation}
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={cancelling}
                            focusableWhenDisabled={cancelling}
                            onClick={() => void cancel(invitation)}
                          >
                            {cancelling
                              ? "Cancelling…"
                              : "Confirm cancellation"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={cancelling}
                            onClick={() => {
                              setConfirm(undefined);
                              setError(undefined);
                              listHeading.current?.focus();
                            }}
                          >
                            Keep invitation
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No existing invitations.
            </p>
          )}
          {canManage && invitations.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={invitations.isFetchingNextPage}
              onClick={() => void invitations.fetchNextPage()}
            >
              Load more invitations
            </Button>
          )}
        </section>
        {canManage && (
          <JourneyInvitationStatus scope={scope} journeyId={journeyId} />
        )}
        <InviteComposer
          journeyId={journeyId}
          title={title}
          scope={scope}
          open={open}
          suspended={!canManage || cancelling}
          onClose={() => setOpen(false)}
          dialogDraft={{ drafts, change: setDrafts, invitedEmails }}
        />
        {error && (
          <Alert variant="warning">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button
            type="button"
            disabled={
              !canManage ||
              Boolean(delivery?.pending) ||
              cancelling ||
              !unsent.length
            }
            onClick={send}
          >
            Send invitations
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
