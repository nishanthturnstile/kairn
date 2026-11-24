import type { PrivateJourney } from "@kairn/contracts";
import {
  editorialCapability,
  editorialCapabilityResult,
  journeyInvitationBatchResult,
  type journeyInvitationPage,
  journeyPeoplePage,
  membershipRestrictionResult,
} from "@kairn/contracts/journeys";
import {
  createEditorialAttemptStore,
  type EditorialAction,
  editorialActionLabel,
  editorialAttemptActionLabel,
  editorialAttemptNotice,
  editorialChangeDescription,
  editorialChangeNotice,
  editorialRoleKey,
  editorialRoles,
} from "@kairn/shared/journey-editorial";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { Clock3, Mail, MailPlus, Send, UsersRound } from "lucide-react";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  accessRecheckInterval,
  journeyInvitationsKey,
  refreshJourneyViews,
} from "../../lib/journey-access";
import { JourneyRequestError, journeyResult } from "../../lib/journey-api";
import {
  clearDeparture,
  departureNoticeKey,
  readDeparture,
  saveDeparture,
  sendDeparture,
} from "../../lib/journey-departure";
import { useJourneyInvitations } from "../../lib/journey-invitations";
import type { AccountScope } from "../../lib/session";
import { useSessionAccess } from "../../lib/session-access";
import { ProfileAvatar } from "../profile-avatar";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Empty, EmptyHeader, EmptyTitle } from "../ui/empty";
import { InviteComposer } from "./invite-composer";
import { JourneyLoading, JourneyRetry } from "./states";

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
const roleAttemptStore = createEditorialAttemptStore(
  (key) => sessionStorage.getItem(key),
  (key, value) => sessionStorage.setItem(key, value),
);
type Action =
  | ((
      | { type: "remove" | "leave"; person: Person }
      | { type: "cancel" | "resend"; invitation: Invitation }
    ) & { key: string })
  | EditorialAction;

function actionTitle(action: Action) {
  switch (action.type) {
    case "editorial":
      return editorialActionLabel(action.capability, action.enabled);
    case "remove":
      return "Remove member";
    case "leave":
      return "Leave journey";
    case "resend":
      return "Resend invitation";
    case "cancel":
      return "Cancel invitation";
  }
}

function actionDescription(action: Action, journeyTitle: string) {
  switch (action.type) {
    case "editorial":
      return `${action.person.displayName} · ${editorialChangeDescription(
        action.capability,
        action.enabled,
      )}`;
    case "remove":
      return `${action.person.displayName} will immediately lose access to ${journeyTitle}.`;
    case "leave":
      return `You’ll immediately lose access to ${journeyTitle}.`;
    case "resend":
      return "The new invitation will replace the previous link.";
    case "cancel":
      return "The email may stay in the recipient’s inbox. Its link will no longer work.";
  }
}

export function JourneyPeopleDialog({
  journey,
  scope,
  suspension,
  wideTrigger,
  triggerRef,
}: {
  journey: PrivateJourney;
  scope: AccountScope;
  suspension?: ReactNode;
  wideTrigger?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState<number>();
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next && busy) details.cancel();
        else {
          if (next) setOpenedAt(Date.now());
          setOpen(next);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size={wideTrigger ? "lg" : "default"}
            className={wideTrigger ? "w-full justify-between" : undefined}
          />
        }
      >
        <UsersRound aria-hidden="true" data-icon="inline-start" />
        View people
      </DialogTrigger>
      <DialogContent
        keepMounted
        className="w-[min(60rem,calc(100%-16px))]"
        initialFocus={title}
      >
        <DialogTitle ref={title} tabIndex={-1}>
          People
        </DialogTitle>
        {open && !suspension && (
          <DialogDescription>{journey.title}</DialogDescription>
        )}
        {open && suspension}
        {openedAt !== undefined && (
          <People
            journey={journey}
            scope={scope}
            openedAt={openedAt}
            suspended={!open || Boolean(suspension)}
            onBusy={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function JourneyDepartureRecovery({
  scope,
  pending,
}: {
  scope: AccountScope;
  pending: NonNullable<ReturnType<typeof readDeparture>>;
}) {
  const { refresh } = useSessionAccess();
  const navigate = useNavigate();
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

  if (state === "unavailable")
    return (
      <Alert>
        <AlertTitle>This journey is unavailable</AlertTitle>
      </Alert>
    );
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
  onBusy,
  openedAt,
}: {
  journey: PrivateJourney;
  scope: AccountScope;
  suspended: boolean;
  openedAt: number;
  onBusy: (busy: boolean) => void;
}) {
  const navigate = useNavigate();
  const { refresh } = useSessionAccess();
  const [composing, setComposing] = useState(false);
  const [unconfirmedBatch, setUnconfirmedBatch] = useState(false);
  const [sending, setSending] = useState(false);
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Action>();
  const [roleEditor, setRoleEditor] = useState<string>();
  const roleStorageKey = `kairn.editorial.${scope.accountId}.${journey.id}`;
  const [roleAttempts, setRoleAttempts] = useState(() =>
    roleAttemptStore.load(roleStorageKey),
  );
  const request = useRef<AbortController>(null);
  const focusReturn = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const presented = useRef(false);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const journeyId = journey.id;
  const invitationKey = journeyInvitationsKey(scope, journeyId);
  const admin = journey.capabilities.includes("administrator");
  const canInvite = admin && journey.state !== "archived";
  useEffect(() => {
    if (suspended || presented.current || !heading.current) return;
    presented.current = true;
    if (document.activeElement === document.body) heading.current.focus();
  }, [suspended]);
  useLayoutEffect(() => {
    onBusy(busy || sending);
    return () => onBusy(false);
  }, [busy, sending, onBusy]);
  useEffect(() => () => request.current?.abort(), []);

  const members = useInfiniteQuery({
    queryKey: [scope.accountId, "journey-people", journeyId],
    enabled: !suspended,
    staleTime: 0,
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
  const invitations = useJourneyInvitations(
    scope,
    journeyId,
    canInvite && !suspended,
  );

  function choose(next: Action, trigger: HTMLElement) {
    if (busy || sending) return;
    focusReturn.current = trigger;
    setFailure("");
    setAction(next);
  }

  async function run(next: Action) {
    const allowed =
      "invitation" in next ? canInvite : next.type === "leave" || admin;
    if (
      request.current ||
      suspended ||
      !allowed ||
      members.dataUpdatedAt < openedAt ||
      members.data?.pages.some((page) => page === null)
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFailure("");
    let departure: ReturnType<typeof saveDeparture> | undefined;
    try {
      if (next.type === "editorial") {
        const { person, capability, expectedRevision, enabled } = next;
        setRoleAttempts(
          roleAttemptStore.update(roleStorageKey, next, "uncertain"),
        );
        const response = await scope.api.POST(
          "/api/v1/journeys/{journeyId}/members/{memberId}/editorial-capability",
          {
            params: { path: { journeyId, memberId: person.accountId } },
            body: {
              membershipGeneration: person.membershipGeneration,
              capability,
              expectedRevision,
              enabled,
            },
            signal: controller.signal,
          },
        );
        controller.signal.throwIfAborted();
        const result = editorialCapabilityResult.parse(
          journeyResult(response, scope, refresh),
        );
        const awaitingConfirmation =
          !result.enabled && result.confirmation === "pending";
        setNotice(
          awaitingConfirmation
            ? ""
            : editorialChangeNotice(capability, result.enabled),
        );
        setRoleAttempts(
          roleAttemptStore.update(
            roleStorageKey,
            next,
            awaitingConfirmation ? "pending" : undefined,
          ),
        );
        await refreshJourneyViews(scope);
      } else if ("person" in next) {
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
              header: { "idempotency-key": next.key },
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
            header: { "idempotency-key": next.key },
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
      } else if (
        code === "membership_changed" ||
        code === "capability_changed" ||
        (next.type === "editorial" &&
          error instanceof JourneyRequestError &&
          error.status === 404)
      ) {
        setAction(undefined);
        if (next.type === "editorial")
          setRoleAttempts(roleAttemptStore.update(roleStorageKey, next));
        setNotice(
          next.type === "editorial"
            ? "Roles or membership changed. The roster has been refreshed."
            : "This membership changed. The roster has been refreshed.",
        );
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
    members.isFetchedAfterMount &&
    members.dataUpdatedAt >= openedAt &&
    !members.isError
      ? members.data?.pages.flatMap((page) => page?.items ?? [])
      : undefined;
  const pendingRows =
    invitations.isFetchedAfterMount &&
    invitations.dataUpdatedAt >= openedAt &&
    !invitations.isError
      ? invitations.data?.pages.flatMap((page) => page?.items ?? [])
      : undefined;

  if (
    members.dataUpdatedAt >= openedAt &&
    members.data?.pages.some((page) => page === null)
  )
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
          : "@container/journey-people mx-auto grid w-full min-w-0 max-w-5xl grid-cols-1 gap-4"
      }
    >
      {canInvite && roster && !composing && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            ref={inviteButton}
            onClick={() => setComposing(true)}
          >
            <MailPlus aria-hidden="true" data-icon="inline-start" />
            {unconfirmedBatch ? "Review pending send" : "Invite people"}
          </Button>
        </div>
      )}
      {canInvite && (
        <InviteComposer
          journeyId={journeyId}
          title={journey.title}
          scope={scope}
          open={composing}
          suspended={suspended || !roster}
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
      {notice && roster && (!pending || admin) && (
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
      {admin &&
        roster &&
        roleAttempts.map((attempt) => (
          <Alert
            key={editorialRoleKey(attempt.action)}
            role="status"
            variant="warning"
          >
            <AlertDescription>
              {editorialAttemptNotice(attempt)}
            </AlertDescription>
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={busy || sending || Boolean(action)}
              aria-label={editorialAttemptActionLabel(attempt)}
              onClick={() => void run(attempt.action)}
            >
              {attempt.state === "pending"
                ? "Check confirmation"
                : "Retry role change"}
            </Button>
          </Alert>
        ))}
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
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-xl font-semibold outline-none"
            >
              Members
            </h2>
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
                    const revisions = person.editorialRevisions;
                    const editor = `${person.accountId}:${person.membershipGeneration}`;
                    const rolesOpen = roleEditor === editor;
                    const availableRoles = editorialCapability.options.filter(
                      (capability) =>
                        journey.state !== "archived" ||
                        person.capabilities.includes(capability),
                    );
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
                        <div className="flex min-w-0 flex-wrap gap-1">
                          {admin && revisions && availableRoles.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={sending || busy}
                              aria-label={`Manage roles for ${person.displayName}`}
                              aria-expanded={rolesOpen}
                              onClick={() =>
                                setRoleEditor(rolesOpen ? undefined : editor)
                              }
                            >
                              Manage roles
                            </Button>
                          )}
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
                        </div>
                        {admin && revisions && rolesOpen && (
                          <fieldset className="grid min-w-0 basis-full gap-2 rounded-control bg-muted px-3 py-2">
                            <legend className="sr-only">
                              Roles for {person.displayName}
                            </legend>
                            {availableRoles.map((capability) => {
                              const assigned =
                                person.capabilities.includes(capability);
                              const role = editorialRoles[capability];
                              return (
                                <div
                                  key={capability}
                                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-1"
                                >
                                  <div className="min-w-0">
                                    <p className="font-semibold">
                                      {role.label}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      Can {role.permission}.
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={sending || busy}
                                    onClick={(event) =>
                                      choose(
                                        {
                                          type: "editorial",
                                          person,
                                          capability,
                                          enabled: !assigned,
                                          expectedRevision:
                                            revisions[capability],
                                        },
                                        event.currentTarget,
                                      )
                                    }
                                  >
                                    {editorialActionLabel(
                                      capability,
                                      !assigned,
                                    )}
                                  </Button>
                                </div>
                              );
                            })}
                          </fieldset>
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
        <Dialog
          open={
            !suspended &&
            Boolean(roster) &&
            (("invitation" in action && canInvite) ||
              ("person" in action && (action.type === "leave" || admin)))
          }
          onOpenChange={(open, details) => {
            if (!open && busy) details.cancel();
            else if (!open) setAction(undefined);
          }}
        >
          <DialogContent
            className="w-[min(32rem,calc(100%-16px))]"
            finalFocus={() =>
              focusReturn.current?.isConnected
                ? focusReturn.current
                : heading.current
            }
          >
            <DialogTitle>{actionTitle(action)}</DialogTitle>
            <DialogDescription>
              {actionDescription(action, journey.title)}
            </DialogDescription>
            {failure && (
              <Alert variant="destructive">
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={
                  action.type === "resend" ||
                  (action.type === "editorial" && action.enabled)
                    ? "default"
                    : "destructive"
                }
                disabled={busy}
                feedback={busy ? "pending" : "idle"}
                onClick={() => void run(action)}
              >
                {busy ? "Working…" : actionTitle(action)}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setAction(undefined)}
              >
                Go back
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
