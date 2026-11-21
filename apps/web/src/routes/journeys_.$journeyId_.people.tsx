import type { PrivateJourney } from "@kairn/contracts";
import {
  journeyInvitationBatchResult,
  journeyInvitationPage,
  journeyPath,
  journeyPeoplePage,
  membershipRestrictionResult,
} from "@kairn/contracts/journeys";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
  ArrowLeft,
  Clock3,
  Mail,
  MailPlus,
  Send,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InviteComposer } from "../components/journeys/invite-composer";
import { JourneyLoading, JourneyRetry } from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { ProfileAvatar } from "../components/profile-avatar";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import {
  accessRecheckInterval,
  journeyInvitationsKey,
  refreshJourneyViews,
  useJourneyAccess,
} from "../lib/journey-access";
import { JourneyRequestError, journeyResult } from "../lib/journey-api";
import {
  clearDeparture,
  departureNoticeKey,
  readDeparture,
  saveDeparture,
  sendDeparture,
} from "../lib/journey-departure";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";

export const Route = createFileRoute("/journeys_/$journeyId_/people")({
  component: PeopleRoute,
});

const roleLabels = {
  administrator: "Administrator",
  coauthor: "Coauthor",
  publisher: "Publisher",
};
const deliveryLabels = {
  queued: "Invitation queued",
  sent: "Sent",
  failed: "Couldn’t send",
  expired: "Expired",
};
const expiry = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});
type Person = ReturnType<typeof journeyPeoplePage.parse>["items"][number];
type Invitation = ReturnType<
  typeof journeyInvitationPage.parse
>["items"][number];
type Action = (
  | { type: "remove" | "leave"; person: Person }
  | { type: "cancel" | "resend"; invitation: Invitation }
) & { key: string };

function PeopleRoute() {
  const { journeyId } = Route.useParams();
  const valid = journeyPath.safeParse({ journeyId }).success;
  const { scope } = Route.useRouteContext();
  const detail = useJourneyAccess(scope, journeyId, valid);
  if (!valid) return <PeopleUnavailable />;
  if (detail.isFetchedAfterMount && !detail.checking && detail.data === null) {
    const pending = readDeparture(scope, journeyId);
    return pending ? (
      <DepartureRecovery scope={scope} pending={pending} />
    ) : (
      <PeopleUnavailable />
    );
  }
  const journey = detail.isFetchedAfterMount ? detail.data?.journey : undefined;
  return (
    <>
      {detail.offline ? (
        <Alert>
          <AlertTitle>Reconnect to check journey access</AlertTitle>
        </Alert>
      ) : detail.isError ? (
        <JourneyRetry
          title="Couldn’t check journey access"
          busy={detail.checking}
          retry={() => void detail.refetch()}
        />
      ) : (
        (!journey || detail.revalidating) && (
          <JourneyLoading label="Checking journey access" />
        )
      )}
      {journey && (
        <People
          key={journey.id}
          journey={journey}
          scope={scope}
          suspended={detail.revalidating || detail.isError}
        />
      )}
    </>
  );
}

function PeopleUnavailable() {
  return (
    <section className="grid max-w-3xl gap-4">
      <PageHeading title="People" />
      <Alert>
        <AlertTitle>This journey is unavailable</AlertTitle>
      </Alert>
      <Button asChild variant="outline" className="justify-self-start">
        <Link to="/journeys">Go to Journeys</Link>
      </Button>
    </section>
  );
}

function DepartureRecovery({
  scope,
  pending,
}: {
  scope: AccountScope;
  pending: NonNullable<ReturnType<typeof readDeparture>>;
}) {
  const { refresh } = useSessionAccess();
  const navigate = Route.useNavigate();
  const [state, setState] = useState<"checking" | "error" | "unavailable">(
    "checking",
  );
  const { key, journeyId, membershipGeneration, accountId, expiresAt } =
    pending;

  useEffect(() => {
    if (state !== "checking") return;
    const request = new AbortController();
    const record = {
      key,
      journeyId,
      membershipGeneration,
      accountId,
      expiresAt,
    };
    void sendDeparture(scope, record, refresh, request.signal)
      .then(async (confirmation) => {
        request.signal.throwIfAborted();
        clearDeparture(scope, record);
        scope.queryClient.setQueryData(departureNoticeKey(scope), confirmation);
        await navigate({ to: "/journeys", replace: true });
        await refreshJourneyViews(scope);
      })
      .catch((error: unknown) => {
        if (request.signal.aborted || scope.signal.aborted) return;
        if (
          error instanceof JourneyRequestError &&
          (error.status === 404 || error.status === 409)
        ) {
          clearDeparture(scope, record);
          setState("unavailable");
        } else {
          setState("error");
        }
      });
    return () => request.abort();
  }, [
    state,
    scope,
    refresh,
    navigate,
    key,
    journeyId,
    membershipGeneration,
    accountId,
    expiresAt,
  ]);

  if (state === "unavailable") return <PeopleUnavailable />;
  if (state === "error")
    return (
      <JourneyRetry
        title="Couldn’t confirm whether you left"
        retry={() => setState("checking")}
      />
    );
  return <JourneyLoading label="Checking departure" />;
}

function People({
  journey,
  scope,
  suspended,
}: {
  journey: PrivateJourney;
  scope: AccountScope;
  suspended: boolean;
}) {
  const navigate = Route.useNavigate();
  const { refresh } = useSessionAccess();
  const [composing, setComposing] = useState(false);
  const [unconfirmedBatch, setUnconfirmedBatch] = useState(false);
  const [sending, setSending] = useState(false);
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Action>();
  const request = useRef<AbortController>(null);
  const focusReturn = useRef<HTMLElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const journeyId = journey.id;
  const invitationKey = journeyInvitationsKey(scope, journeyId);
  const admin = journey.capabilities.includes("administrator");
  const canInvite = admin && journey.state !== "archived";
  useEffect(() => () => request.current?.abort(), []);

  const members = useInfiniteQuery({
    queryKey: [scope.accountId, "journey-people", journeyId],
    initialPageParam: undefined as string | undefined,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: accessRecheckInterval,
    async queryFn({ pageParam: cursor, signal }) {
      const result = await scope.api.GET(
        "/api/v1/journeys/{journeyId}/people",
        { params: { path: { journeyId }, query: { cursor } }, signal },
      );
      return result.response.status === 404
        ? null
        : journeyPeoplePage.parse(journeyResult(result, scope, refresh));
    },
    getNextPageParam: (page) => page?.nextCursor ?? undefined,
  });
  const invitations = useInfiniteQuery({
    queryKey: invitationKey,
    initialPageParam: undefined as string | undefined,
    enabled: canInvite,
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

  function choose(next: Action, trigger: HTMLElement) {
    if (busy || sending) return;
    focusReturn.current = trigger;
    setFailure("");
    setAction(next);
  }

  async function run(next: Action) {
    if (request.current || suspended) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFailure("");
    const options = { header: { "idempotency-key": next.key } };
    let departure: ReturnType<typeof saveDeparture> | undefined;
    try {
      if ("person" in next) {
        const body = { membershipGeneration: next.person.membershipGeneration };
        if (next.type === "leave" && scope.accountId) {
          const saved = readDeparture(scope, journeyId);
          departure =
            saved?.membershipGeneration === body.membershipGeneration
              ? saved
              : saveDeparture(
                  scope.accountId,
                  journeyId,
                  body.membershipGeneration,
                  next.key,
                );
          const confirmation = await sendDeparture(
            scope,
            departure,
            refresh,
            controller.signal,
          );
          controller.signal.throwIfAborted();
          clearDeparture(scope, departure);
          scope.queryClient.setQueryData(
            departureNoticeKey(scope),
            confirmation,
          );
          await navigate({ to: "/journeys", replace: true });
          await refreshJourneyViews(scope);
          return;
        }
        const response = await scope.api.POST(
          "/api/v1/journeys/{journeyId}/members/{memberId}/remove",
          {
            params: {
              ...options,
              path: { journeyId, memberId: next.person.accountId },
            },
            body,
            signal: controller.signal,
          },
        );
        controller.signal.throwIfAborted();
        const { confirmation } = membershipRestrictionResult.parse(
          journeyResult(response, scope, refresh),
        );
        await refreshJourneyViews(scope);
        controller.signal.throwIfAborted();
        setNotice(
          confirmation === "pending"
            ? "Access removed. Confirmation is pending."
            : "Access removed.",
        );
        setPending(confirmation === "pending" ? next : undefined);
      } else {
        const route =
          next.type === "cancel"
            ? "/api/v1/journeys/{journeyId}/invitations/{invitationId}/cancel"
            : "/api/v1/journeys/{journeyId}/invitations/{invitationId}/resend";
        const response = await scope.api.POST(route, {
          params: {
            ...options,
            path: { journeyId, invitationId: next.invitation.id },
          },
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        const [outcome] = journeyInvitationBatchResult.parse(
          journeyResult(response, scope, refresh),
        ).items;
        const copy =
          next.type === "cancel"
            ? "Invitation cancelled."
            : outcome.status === "queued"
              ? "Replacement invitation queued."
              : outcome.status === "rate_limited"
                ? "You can’t resend this yet. Try again later."
                : outcome.status === "already_member"
                  ? "This person has joined the journey."
                  : "A current invitation is already on the list.";
        setNotice(copy);
        await scope.queryClient.invalidateQueries({ queryKey: invitationKey });
      }
      setAction(undefined);
    } catch (error) {
      if (controller.signal.aborted || scope.signal.aborted) return;
      const code =
        error instanceof JourneyRequestError ? error.code : undefined;
      if (
        departure &&
        error instanceof JourneyRequestError &&
        (error.status === 404 || error.status === 409)
      )
        clearDeparture(scope, departure);
      if (code === "invitation_accepted") {
        setAction(undefined);
        setNotice(
          "This person already joined. You can manage their access under Members.",
        );
        await refreshJourneyViews(scope);
      } else if (code === "last_administrator") {
        setFailure("This journey needs an active administrator.");
      } else if (code === "membership_changed") {
        setAction(undefined);
        setNotice("This membership changed. The roster has been refreshed.");
        await refreshJourneyViews(scope);
      } else {
        setFailure("Couldn’t confirm this change. Try again.");
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const roster =
    members.isFetchedAfterMount && !members.isError
      ? members.data?.pages.flatMap((page) => page?.items ?? [])
      : undefined;
  const pendingRows =
    invitations.isFetchedAfterMount && !invitations.isError
      ? invitations.data?.pages.flatMap((page) => page?.items ?? [])
      : undefined;

  if (members.data?.pages.some((page) => page === null))
    return (
      <Alert>
        <AlertTitle>This journey is unavailable</AlertTitle>
      </Alert>
    );
  return (
    <section
      hidden={suspended}
      className={
        suspended
          ? undefined
          : "@container/journey-people mx-auto grid w-full min-w-0 max-w-5xl grid-cols-1 gap-5"
      }
    >
      <div>
        {sending || busy ? (
          <Button variant="ghost" disabled>
            Back to journey
          </Button>
        ) : (
          <Button asChild variant="ghost">
            <Link to="/journeys/$journeyId" params={{ journeyId }}>
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              Back to journey
            </Link>
          </Button>
        )}
      </div>
      <header
        ref={heading}
        tabIndex={-1}
        className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-card bg-muted p-4 @min-[34rem]/journey-people:p-6"
      >
        <div className="min-w-0 max-w-full wrap-anywhere">
          <PageHeading title="People" description={journey.title} />
        </div>
        {canInvite && !composing && (
          <Button
            type="button"
            ref={inviteButton}
            onClick={() => setComposing(true)}
          >
            <MailPlus aria-hidden="true" data-icon="inline-start" />
            {unconfirmedBatch ? "Review pending send" : "Invite people"}
          </Button>
        )}
      </header>
      {canInvite && (
        <InviteComposer
          journeyId={journeyId}
          title={journey.title}
          scope={scope}
          open={composing}
          suspended={suspended}
          onUncertain={setUnconfirmedBatch}
          onClose={() => {
            setComposing(false);
            requestAnimationFrame(() => inviteButton.current?.focus());
          }}
          onBusy={setSending}
          onSent={() =>
            void scope.queryClient.invalidateQueries({
              queryKey: invitationKey,
            })
          }
        />
      )}
      {notice && (
        <Alert role="status" variant={pending ? "warning" : "default"}>
          <AlertDescription>{notice}</AlertDescription>
          {pending && (
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={busy}
              onClick={() => void run(pending)}
            >
              Check confirmation
            </Button>
          )}
        </Alert>
      )}
      {failure && !action && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <div
        className={cn(
          "grid min-w-0 grid-cols-1 items-start gap-4",
          canInvite &&
            "@min-[42rem]/journey-people:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]",
        )}
      >
        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-primary">
              <UsersRound className="size-4" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-semibold">Members</h2>
          </CardHeader>
          <CardContent className="grid min-w-0 grid-cols-1 gap-3">
            {members.isError ? (
              <JourneyRetry
                title="Couldn’t load members"
                busy={members.isFetching}
                retry={() => void members.refetch()}
              />
            ) : roster ? (
              <>
                <ul className="grid">
                  {roster.map((person) => {
                    const you = person.accountId === scope.accountId;
                    const capabilities = person.capabilities
                      .map((role) => roleLabels[role])
                      .join(", ");
                    return (
                      <li
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border py-3"
                        key={person.accountId}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <ProfileAvatar name={person.displayName} />
                          <div className="min-w-0 wrap-anywhere">
                            <p className="font-semibold">
                              {person.displayName}
                              {you ? " (You)" : ""}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {capabilities || "Participant"}
                            </p>
                          </div>
                        </div>
                        {(you || admin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={sending || busy}
                            aria-label={
                              you ? undefined : `Remove ${person.displayName}`
                            }
                            onClick={(event) =>
                              choose(
                                {
                                  type: you ? "leave" : "remove",
                                  person,
                                  key: crypto.randomUUID(),
                                },
                                event.currentTarget,
                              )
                            }
                          >
                            {you ? "Leave journey" : "Remove"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {members.hasNextPage && (
                  <Button
                    variant="outline"
                    disabled={members.isFetchingNextPage}
                    onClick={() => void members.fetchNextPage()}
                  >
                    Load more members
                  </Button>
                )}
              </>
            ) : (
              <JourneyLoading label="Loading members" />
            )}
          </CardContent>
        </Card>
        {canInvite &&
          !invitations.data?.pages.some((page) => page === null) && (
            <Card className="min-w-0">
              <CardHeader className="flex flex-wrap items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-primary">
                  <Mail className="size-4" aria-hidden="true" />
                </span>
                <h2 className="text-xl font-semibold">Invitations</h2>
              </CardHeader>
              <CardContent className="@container/people-invitations grid min-w-0 grid-cols-1 gap-3">
                {invitations.isError ? (
                  <JourneyRetry
                    title="Couldn’t load invitations"
                    busy={invitations.isFetching}
                    retry={() => void invitations.refetch()}
                  />
                ) : pendingRows ? (
                  <>
                    {pendingRows.length ? (
                      <ul className="grid gap-2">
                        {pendingRows.map((invitation) => {
                          const label =
                            invitation.displayName ??
                            invitation.email ??
                            "Recipient";
                          const delivery =
                            invitation.decision === "expired"
                              ? "expired"
                              : invitation.delivery;
                          return (
                            <li
                              key={invitation.id}
                              className="grid min-w-0 gap-2 rounded-control bg-background px-3 py-2 @min-[32rem]/people-invitations:flex @min-[32rem]/people-invitations:items-center @min-[32rem]/people-invitations:justify-between"
                            >
                              <div className="grid min-w-0 gap-1 wrap-anywhere">
                                <p className="font-semibold">{label}</p>
                                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 font-semibold",
                                      delivery === "failed"
                                        ? "bg-card text-destructive"
                                        : "bg-muted text-foreground",
                                    )}
                                  >
                                    {delivery === "sent" ? (
                                      <Send
                                        className="size-3.5 shrink-0"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      delivery !== "failed" && (
                                        <Clock3
                                          className="size-3.5 shrink-0"
                                          aria-hidden="true"
                                        />
                                      )
                                    )}
                                    {deliveryLabels[delivery]}
                                  </span>
                                  <p className="text-muted-foreground">
                                    {invitation.decision === "expired"
                                      ? "Expired on "
                                      : "Expires "}
                                    <time dateTime={invitation.expiresAt}>
                                      {expiry.format(
                                        new Date(invitation.expiresAt),
                                      )}
                                    </time>
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1 @min-[32rem]/people-invitations:shrink-0">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={sending || busy}
                                  aria-label={`Resend invitation to ${label}`}
                                  onClick={(event) =>
                                    choose(
                                      {
                                        type: "resend",
                                        invitation,
                                        key: crypto.randomUUID(),
                                      },
                                      event.currentTarget,
                                    )
                                  }
                                >
                                  {invitation.delivery === "failed"
                                    ? "Retry send"
                                    : "Resend"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={sending || busy}
                                  aria-label={`Cancel invitation to ${label}`}
                                  onClick={(event) =>
                                    choose(
                                      {
                                        type: "cancel",
                                        invitation,
                                        key: crypto.randomUUID(),
                                      },
                                      event.currentTarget,
                                    )
                                  }
                                >
                                  Cancel invitation
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>No pending invitations.</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    )}
                    {invitations.hasNextPage && (
                      <Button
                        variant="outline"
                        disabled={invitations.isFetchingNextPage}
                        onClick={() => void invitations.fetchNextPage()}
                      >
                        Load more invitations
                      </Button>
                    )}
                  </>
                ) : (
                  <JourneyLoading label="Loading invitations" />
                )}
              </CardContent>
            </Card>
          )}
      </div>
      {action && (
        <Sheet
          open={
            !suspended &&
            (("invitation" in action && canInvite) ||
              ("person" in action && (action.type === "leave" || admin)))
          }
          onOpenChange={(open) => {
            if (!open && !busy) setAction(undefined);
          }}
        >
          <SheetContent
            showCloseButton={false}
            className="overflow-auto p-5 data-[side=right]:w-full"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (focusReturn.current?.isConnected) focusReturn.current.focus();
              else heading.current?.focus();
            }}
          >
            <SheetHeader className="p-0">
              <SheetTitle>
                {action.type === "remove"
                  ? "Remove member"
                  : action.type === "leave"
                    ? "Leave journey"
                    : action.type === "resend"
                      ? "Resend invitation"
                      : "Cancel invitation"}
              </SheetTitle>
              <SheetDescription>
                {action.type === "remove" && "person" in action
                  ? `${action.person.displayName} will immediately lose access to ${journey.title}.`
                  : action.type === "leave"
                    ? `You’ll immediately lose access to ${journey.title}.`
                    : action.type === "resend"
                      ? "The new invitation will replace the previous link."
                      : "The email may stay in the recipient’s inbox. Its link will no longer work."}
              </SheetDescription>
            </SheetHeader>
            {failure && (
              <Alert variant="destructive">
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={action.type === "resend" ? "default" : "destructive"}
                disabled={busy}
                onClick={() => void run(action)}
              >
                {busy
                  ? "Working…"
                  : action.type === "remove"
                    ? "Remove member"
                    : action.type === "leave"
                      ? "Leave journey"
                      : action.type === "resend"
                        ? "Resend invitation"
                        : "Cancel invitation"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setAction(undefined)}
              >
                Go back
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
