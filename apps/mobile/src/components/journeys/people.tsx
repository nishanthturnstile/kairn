import type { components } from "@kairn/contracts";
import {
  editorialCapability,
  editorialCapabilityResult,
  journeyInvitationBatchResult,
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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useNetworkState } from "expo-network";
import { useIsFocused, usePreventRemove, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, type ScrollView, View } from "react-native";
import { ensureActive } from "../../api";
import { authOrigin } from "../../auth";
import { sessionStoragePrefix } from "../../auth-origin";
import {
  JourneyRequestError,
  journeyInvitationsKey,
  journeyResult,
  refreshJourneyViews,
} from "../../journey-api";
import {
  departureKey,
  type MembershipAttempt,
  membershipAttemptLifetime,
  readMembershipAttempt,
  saveMembershipAttempt,
} from "../../membership-attempt";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { Avatar, Badge } from "../fold/identity";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import { useInviteComposer } from "./invite-composer";
import { peopleStyles } from "./people-presentation";
import { JourneyRetry, JourneyScreen, journeyStyles } from "./states";

type Person = components["schemas"]["JourneyPersonV1"];
type RosterPage = components["schemas"]["JourneyPeoplePageV1"];
type InvitationPage = components["schemas"]["JourneyInvitationPageV1"];
type Invitation = InvitationPage["items"][number];
type Management = {
  type: "resend" | "cancel";
  invitationId: string;
  label: string;
  key: string;
};
type Confirmation =
  | { type: "leave" | "remove"; person: Person }
  | Management
  | EditorialAction;

const roleStorageOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const roleAttemptStore = createEditorialAttemptStore(
  (key) => SecureStore.getItem(key, roleStorageOptions),
  (key, value) => SecureStore.setItem(key, value, roleStorageOptions),
);

const roleLabels = {
  administrator: "Organiser",
  coauthor: "Coauthor",
  publisher: "Publisher",
};
const deliveryLabels = {
  queued: "Invitation queued",
  sent: "Sent",
  failed: "Couldn’t send",
  expired: "Expired",
};
const expiryFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function JourneyPeople({
  scope,
  journeyId,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
}) {
  const router = useRouter();
  const focused = useIsFocused();
  const online = useNetworkState().isConnected !== false;
  const { state, canSubmit, refresh } = useMobileSession();
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [confirming, setConfirming] = useState<Confirmation>();
  const [pending, setPending] = useState(() =>
    readMembershipAttempt(scope, journeyId),
  );
  const [removalReceipt, setRemovalReceipt] = useState<MembershipAttempt>();
  const [management, setManagement] = useState<Management>();
  const [roleEditor, setRoleEditor] = useState<string>();
  const roleStorageKey = `${sessionStoragePrefix(authOrigin ?? "")}_editorial_${scope.accountId}_${journeyId}`;
  const [roleAttempts, setRoleAttempts] = useState(() =>
    roleAttemptStore.load(roleStorageKey),
  );
  const [leaving, setLeaving] = useState(false);
  const lock = useRef(false);
  const sendingLock = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const canRead = focused && online;
  const active = canRead && state === "verified";
  usePreventRemove((busy || sending) && state === "verified", () => {});
  useEffect(() => {
    if (!confirming) return;
    scroll.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(confirmationTitle(confirming));
  }, [confirming]);

  const access = useQuery({
    queryKey: ["journeys", "people-access", journeyId],
    enabled: canRead,
    refetchOnMount: "always",
    refetchInterval: active ? 30_000 : false,
    async queryFn({ signal }) {
      const result = await scope.api.GET("/api/v1/journeys/{journeyId}", {
        params: { path: { journeyId } },
        signal,
      });
      if (result.response.status === 404) {
        ensureActive(scope.signal);
        ensureActive(signal);
        void scope.queryClient.invalidateQueries({
          queryKey: ["journeys", "history"],
        });
        void scope.queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        return null;
      }
      return journeyResult(result, scope, refresh);
    },
  });
  const journey =
    active &&
    access.isFetchedAfterMount &&
    !access.isError &&
    !access.isFetching
      ? access.data
      : undefined;
  const admin = Boolean(journey?.capabilities.includes("administrator"));
  const mayInvite = admin && journey?.state === "draft";
  const readRoster = canRead && !access.isError && Boolean(access.data);
  const readInvitations =
    readRoster &&
    access.data?.state === "draft" &&
    access.data.capabilities.includes("administrator");
  const invitationKey = journeyInvitationsKey(journeyId);
  const members = useInfiniteQuery({
    queryKey: ["journeys", "people", journeyId],
    enabled: readRoster,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: RosterPage | null) =>
      page?.nextCursor ?? undefined,
    refetchOnMount: "always",
    refetchInterval: readRoster ? 30_000 : false,
    async queryFn({ pageParam, signal }) {
      const response = await scope.api.GET(
        "/api/v1/journeys/{journeyId}/people",
        {
          params: { path: { journeyId }, query: { cursor: pageParam } },
          signal,
        },
      );
      if (response.response.status === 404) {
        ensureActive(signal);
        ensureActive(scope.signal);
        return null;
      }
      return journeyResult(response, scope, refresh);
    },
  });
  const invitations = useInfiniteQuery({
    queryKey: invitationKey,
    enabled: readInvitations,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: InvitationPage | null) =>
      page?.nextCursor ?? undefined,
    refetchOnMount: "always",
    refetchInterval: readInvitations ? 30_000 : false,
    async queryFn({ pageParam, signal }) {
      const response = await scope.api.GET(
        "/api/v1/journeys/{journeyId}/invitations",
        {
          params: { path: { journeyId }, query: { cursor: pageParam } },
          signal,
        },
      );
      if (response.response.status === 404) {
        ensureActive(signal);
        ensureActive(scope.signal);
        return null;
      }
      return journeyResult(response, scope, refresh);
    },
  });
  const rows =
    members.isFetchedAfterMount && !members.isError
      ? members.data?.pages
      : undefined;
  const missing = journey === null || rows?.includes(null);
  const inviteRows =
    mayInvite && invitations.isFetchedAfterMount && !invitations.isError
      ? invitations.data?.pages
      : undefined;
  const availability = Boolean(journey && !missing);
  const disabled = busy || sending || access.isFetching || !availability;
  const invitationActionsDisabled = disabled || invitations.isRefetching;

  function savePending(value?: MembershipAttempt) {
    saveMembershipAttempt(scope, journeyId, value);
    setPending(value);
  }

  async function perform(
    operation: MembershipAttempt | Management | EditorialAction,
  ) {
    if (lock.current || sendingLock.current || !active || !canSubmit(scope))
      return;
    if (operation.type === "editorial" && !admin) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    setConfirming(undefined);
    try {
      if (operation.type === "editorial") {
        const { person, capability, expectedRevision, enabled } = operation;
        setRoleAttempts(
          roleAttemptStore.update(roleStorageKey, operation, "uncertain"),
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
          },
        );
        const result = editorialCapabilityResult.parse(
          journeyResult(response, scope, refresh),
        );
        const awaitingConfirmation =
          !result.enabled && result.confirmation === "pending";
        setRoleAttempts(
          roleAttemptStore.update(
            roleStorageKey,
            operation,
            awaitingConfirmation ? "pending" : undefined,
          ),
        );
        setNotice(
          awaitingConfirmation
            ? ""
            : editorialChangeNotice(capability, result.enabled),
        );
        await refreshJourneyViews(scope);
      } else if ("memberId" in operation) {
        const params = { header: { "idempotency-key": operation.key } };
        savePending(operation);
        const body = { membershipGeneration: operation.membershipGeneration };
        const response =
          operation.type === "leave"
            ? await scope.api.POST("/api/v1/journeys/{journeyId}/leave", {
                params: { ...params, path: { journeyId } },
                body,
              })
            : await scope.api.POST(
                "/api/v1/journeys/{journeyId}/members/{memberId}/remove",
                {
                  params: {
                    ...params,
                    path: { journeyId, memberId: operation.memberId },
                  },
                  body,
                },
              );
        const { confirmation } = membershipRestrictionResult.parse(
          journeyResult(response, scope, refresh),
        );
        savePending();
        if (operation.type === "leave") {
          scope.queryClient.setQueryData(departureKey, confirmation);
        } else {
          setRemovalReceipt(confirmation === "pending" ? operation : undefined);
          setNotice(
            confirmation === "pending"
              ? "Access removed. Confirmation is pending."
              : "Access removed.",
          );
        }
        await refreshJourneyViews(scope);
      } else {
        setManagement(operation);
        const response = await scope.api.POST(
          operation.type === "cancel"
            ? "/api/v1/journeys/{journeyId}/invitations/{invitationId}/cancel"
            : "/api/v1/journeys/{journeyId}/invitations/{invitationId}/resend",
          {
            params: {
              header: { "idempotency-key": operation.key },
              path: { journeyId, invitationId: operation.invitationId },
            },
          },
        );
        const [outcome] = journeyInvitationBatchResult.parse(
          journeyResult(response, scope, refresh),
        ).items;
        setNotice(
          operation.type === "cancel"
            ? "Invitation cancelled."
            : outcome.status === "queued"
              ? "Replacement invitation queued."
              : outcome.status === "rate_limited"
                ? "You can’t resend this yet. Try again later."
                : outcome.status === "already_member"
                  ? "This person has joined the journey."
                  : "A current invitation is already on the list.",
        );
        setManagement(undefined);
        void scope.queryClient.invalidateQueries({ queryKey: invitationKey });
      }
      if ("memberId" in operation && operation.type === "leave") {
        setLeaving(true);
      }
    } catch (error) {
      if (scope.signal.aborted) return;
      if (
        error instanceof JourneyRequestError &&
        [404, 409, 429].includes(error.status)
      ) {
        if (operation.type === "editorial") {
          setRoleAttempts(roleAttemptStore.update(roleStorageKey, operation));
        } else if ("memberId" in operation) {
          savePending();
          if (removalReceipt?.key === operation.key)
            setRemovalReceipt(undefined);
        } else setManagement(undefined);
        setFailure(
          operation.type === "editorial" && error.status !== 429
            ? "Roles or membership changed. The roster has been refreshed."
            : error.code === "last_administrator"
              ? "This journey needs an active organiser before you can leave."
              : error.code === "invitation_accepted"
                ? "This person already joined. You can manage their access under Members."
                : error.code === "membership_changed"
                  ? "This membership changed. The roster has been refreshed."
                  : error.status === 429
                    ? "Try again later."
                    : "This action is no longer available.",
        );
        void refreshJourneyViews(scope).catch(() => {});
      } else {
        setFailure(
          "Couldn’t confirm this action. Retry to check the same request.",
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const unresolved = pending ?? management;
  const recovery = unresolved ?? removalReceipt;
  const composerAllowed = Boolean(mayInvite && availability && active);
  const composer = useInviteComposer({
    scope,
    journeyId,
    title: access.data?.title ?? "",
    open: composing,
    enabled: composerAllowed,
    onBusy: (value) => {
      sendingLock.current = value;
      setSending(value);
    },
    onClose: closeComposer,
    onSent: () =>
      void scope.queryClient.invalidateQueries({ queryKey: invitationKey }),
  });
  function closeComposer() {
    if (sendingLock.current) return;
    setComposing(false);
    AccessibilityInfo.announceForAccessibility("People");
  }
  function confirm(operation: Confirmation) {
    if (operation.type === "editorial") {
      void perform(operation);
    } else if ("person" in operation) {
      void perform({
        type: operation.type,
        key: randomUUID(),
        memberId: operation.person.accountId,
        membershipGeneration: operation.person.membershipGeneration,
        expiresAt: Date.now() + membershipAttemptLifetime,
      });
    } else void perform(operation);
  }
  if (leaving && !busy && focused && state === "verified")
    return <LeaveJourney />;
  return (
    <>
      <JourneyScreen scrollRef={scroll}>
        <View style={peopleStyles.intro}>
          <View style={journeyStyles.group}>
            <AppText text="People" variant="title" accessibilityRole="header" />
            {availability && journey && (
              <AppText text={journey.title} subdued />
            )}
          </View>
          {mayInvite && availability && (
            <Action
              label="Invite people"
              variant="primary"
              disabled={disabled}
              onPress={() => setComposing(true)}
            />
          )}
        </View>
        {confirming &&
          availability &&
          journey &&
          (confirming.type === "leave" ||
            (confirming.type === "remove" || confirming.type === "editorial"
              ? admin
              : mayInvite)) && (
            <Panel>
              <AppText
                text={confirmationTitle(confirming)}
                variant="section"
                accessibilityRole="header"
              />
              <AppText text={confirmationMessage(confirming, journey.title)} />
              <Action
                label={confirmationTitle(confirming)}
                variant={
                  confirming.type === "resend" ||
                  (confirming.type === "editorial" && confirming.enabled)
                    ? "primary"
                    : "danger"
                }
                disabled={
                  "person" in confirming ? disabled : invitationActionsDisabled
                }
                onPress={() => confirm(confirming)}
              />
              <Action label="Back" onPress={() => setConfirming(undefined)} />
            </Panel>
          )}
        {!!failure && active && (
          <StatusNotice notice={{ text: failure, tone: "error" }} />
        )}
        {!!notice && active && (
          <StatusNotice notice={{ text: notice, tone: "info" }} />
        )}
        {active && recovery && (
          <Action
            label={
              busy
                ? "Checking action…"
                : unresolved
                  ? "Retry previous action"
                  : "Check removal confirmation"
            }
            disabled={busy || sending}
            onPress={() => void perform(recovery)}
          />
        )}
        {admin &&
          roleAttempts.map((attempt) => (
            <View
              key={editorialRoleKey(attempt.action)}
              style={journeyStyles.group}
            >
              <StatusNotice
                notice={{ text: editorialAttemptNotice(attempt), tone: "info" }}
              />
              <Action
                label={
                  attempt.state === "pending"
                    ? "Check confirmation"
                    : "Retry role change"
                }
                accessibilityLabel={editorialAttemptActionLabel(attempt)}
                disabled={disabled || Boolean(unresolved || confirming)}
                onPress={() => void perform(attempt.action)}
              />
            </View>
          ))}
        {!online ? (
          <StatusNotice
            notice={{
              text: "Reconnect to check access to this journey.",
              tone: "info",
            }}
          />
        ) : access.isError || members.isError ? (
          <JourneyRetry
            text="Couldn’t check this journey’s people."
            busy={access.isFetching || members.isFetching}
            retry={() => {
              void access.refetch();
              if (journey) void members.refetch();
            }}
          />
        ) : missing ? (
          <StatusNotice
            notice={{ text: "This journey is unavailable.", tone: "info" }}
          />
        ) : !availability ? (
          <StatusNotice
            notice={{ text: "Checking journey access", tone: "info" }}
          />
        ) : (
          <>
            <Panel>
              <AppText
                text="Members"
                variant="section"
                accessibilityRole="header"
              />
              {!rows && <AppText text="Loading members" subdued />}
              {rows
                ?.flatMap((page) => page?.items ?? [])
                .map((person) => {
                  const you = person.accountId === scope.accountId;
                  const revisions = person.editorialRevisions;
                  const editor = `${person.accountId}:${person.membershipGeneration}`;
                  const rolesOpen = roleEditor === editor;
                  const availableRoles = editorialCapability.options.filter(
                    (capability) =>
                      journey?.state !== "archived" ||
                      person.capabilities.includes(capability),
                  );
                  return (
                    <View
                      key={person.accountId}
                      style={[journeyStyles.group, peopleStyles.rowDivider]}
                    >
                      <View style={peopleStyles.row}>
                        <Avatar name={person.displayName} />
                        <View style={peopleStyles.rowCopy}>
                          <AppText
                            text={`${person.displayName}${you ? " (You)" : ""}`}
                            variant="label"
                          />
                          <AppText
                            text={
                              person.capabilities
                                .map((role) => roleLabels[role])
                                .join(", ") || "Participant"
                            }
                            variant="caption"
                            subdued
                          />
                        </View>
                      </View>
                      {admin && revisions && availableRoles.length > 0 && (
                        <Action
                          label="Manage roles"
                          variant="text"
                          accessibilityLabel={`Manage roles for ${person.displayName}`}
                          accessibilityState={{ expanded: rolesOpen }}
                          disabled={
                            disabled || Boolean(unresolved || confirming)
                          }
                          onPress={() =>
                            setRoleEditor(rolesOpen ? undefined : editor)
                          }
                        />
                      )}
                      {admin &&
                        revisions &&
                        rolesOpen &&
                        availableRoles.map((capability) => {
                          const role = editorialRoles[capability];
                          const enabled =
                            !person.capabilities.includes(capability);
                          return (
                            <View key={capability} style={journeyStyles.group}>
                              <AppText text={role.label} variant="label" />
                              <AppText
                                text={`Can ${role.permission}.`}
                                variant="caption"
                                subdued
                              />
                              <Action
                                label={editorialActionLabel(
                                  capability,
                                  enabled,
                                )}
                                disabled={
                                  disabled || Boolean(unresolved || confirming)
                                }
                                onPress={() =>
                                  setConfirming({
                                    type: "editorial",
                                    person,
                                    capability,
                                    enabled,
                                    expectedRevision: revisions[capability],
                                  })
                                }
                              />
                            </View>
                          );
                        })}
                      {(you || admin) && (
                        <Action
                          label={you ? "Leave journey" : "Remove"}
                          variant="text"
                          accessibilityLabel={
                            you
                              ? "Leave journey"
                              : `Remove ${person.displayName}`
                          }
                          disabled={
                            disabled || Boolean(unresolved || confirming)
                          }
                          onPress={() =>
                            setConfirming({
                              type: you ? "leave" : "remove",
                              person,
                            })
                          }
                        />
                      )}
                    </View>
                  );
                })}
              {members.hasNextPage && (
                <Action
                  label="Load more members"
                  disabled={members.isFetching}
                  onPress={() => void members.fetchNextPage()}
                />
              )}
            </Panel>
            {mayInvite && (
              <Panel>
                <AppText
                  text="Invitations"
                  variant="section"
                  accessibilityRole="header"
                />
                {invitations.isError ? (
                  <JourneyRetry
                    text="Couldn’t load invitations."
                    retry={() => void invitations.refetch()}
                    busy={invitations.isFetching}
                  />
                ) : !inviteRows ? (
                  <AppText text="Loading invitations" subdued />
                ) : (
                  <>
                    {!inviteRows.some((page) => page?.items.length) && (
                      <AppText text="No pending invitations." subdued />
                    )}
                    {inviteRows
                      .flatMap((page) => page?.items ?? [])
                      .map((invitation) => (
                        <InvitationRow
                          key={invitation.id}
                          invitation={invitation}
                          disabled={
                            invitationActionsDisabled ||
                            Boolean(unresolved || confirming)
                          }
                          onAction={(type, label) =>
                            setConfirming({
                              type,
                              invitationId: invitation.id,
                              label,
                              key: randomUUID(),
                            })
                          }
                        />
                      ))}
                    {invitations.hasNextPage && (
                      <Action
                        label="Load more invitations"
                        disabled={invitations.isFetching}
                        onPress={() => void invitations.fetchNextPage()}
                      />
                    )}
                  </>
                )}
              </Panel>
            )}
          </>
        )}
        <Action
          label="Back to Journeys"
          variant="text"
          disabled={busy || sending}
          onPress={() => router.dismissTo("/journeys")}
        />
      </JourneyScreen>
      <Modal
        visible={composing && focused}
        onRequestClose={composer.close}
        presentationStyle="fullScreen"
      >
        <JourneyScreen top safeBottom>
          {composerAllowed ? (
            composer.content
          ) : (
            <Panel>
              <StatusNotice
                notice={{
                  text: !online
                    ? "Reconnect to check access to this journey."
                    : access.isError
                      ? "Couldn’t check access to this journey."
                      : journey && !mayInvite
                        ? "This journey is unavailable for invitations."
                        : missing
                          ? "This journey is unavailable."
                          : "Checking journey access",
                  tone: "info",
                }}
              />
              {(access.isError || missing) && online && (
                <Action
                  label="Try again"
                  disabled={sending}
                  onPress={() => void access.refetch()}
                />
              )}
              <Action
                label="Close"
                disabled={sending}
                onPress={composer.close}
              />
            </Panel>
          )}
        </JourneyScreen>
      </Modal>
    </>
  );
}

function LeaveJourney() {
  const router = useRouter();
  useEffect(() => {
    router.dismissTo("/journeys");
  }, [router]);
  return (
    <JourneyScreen>
      <StatusNotice notice={{ text: "Opening Journeys", tone: "info" }} />
    </JourneyScreen>
  );
}

function confirmationTitle(action: Confirmation) {
  if (action.type === "editorial")
    return editorialActionLabel(action.capability, action.enabled);
  if (action.type === "leave") return "Leave journey";
  if (action.type === "remove") return "Remove access";
  return action.type === "resend" ? "Resend invitation" : "Cancel invitation";
}

function confirmationMessage(action: Confirmation, title: string) {
  if (action.type === "editorial")
    return `${action.person.displayName} · ${editorialChangeDescription(
      action.capability,
      action.enabled,
    )}`;
  if ("person" in action)
    return action.type === "leave"
      ? `Leave ${title}? You’ll lose access immediately.`
      : `${action.person.displayName} will lose access to ${title} immediately.`;
  if (action.type === "resend")
    return `Send a new link to ${action.label}? The previous link will stop working.`;
  return `Cancel the invitation to ${action.label}? The email can stay in their inbox, but the link will stop working.`;
}

function InvitationRow({
  invitation,
  disabled,
  onAction,
}: {
  invitation: Invitation;
  disabled: boolean;
  onAction: (type: Management["type"], label: string) => void;
}) {
  const label = invitation.displayName ?? invitation.email ?? "Invitee";
  const expired = invitation.decision === "expired";
  const delivery = expired ? "expired" : invitation.delivery;
  const failed = delivery === "failed";
  return (
    <View style={peopleStyles.invitation}>
      <View style={peopleStyles.row}>
        <Avatar name={invitation.displayName ?? undefined} />
        <View style={peopleStyles.rowCopy}>
          <AppText text={label} variant="label" />
          <View style={peopleStyles.actions}>
            <Badge text={deliveryLabels[delivery]} error={failed} />
            <AppText
              text={`${expired ? "Expired on" : "Expires"} ${expiryFormat.format(new Date(invitation.expiresAt))}`}
              variant="caption"
              subdued
            />
          </View>
        </View>
      </View>
      <View style={peopleStyles.actions}>
        <Action
          label={failed ? "Retry send" : "Resend"}
          accessibilityLabel={
            failed ? `Retry send to ${label}` : `Resend invitation to ${label}`
          }
          disabled={disabled}
          onPress={() => onAction("resend", label)}
        />
        {invitation.decision === "pending" && (
          <Action
            label="Cancel invitation"
            variant="text"
            accessibilityLabel={`Cancel invitation to ${label}`}
            disabled={disabled}
            onPress={() => onAction("cancel", label)}
          />
        )}
      </View>
    </View>
  );
}
