import {
  invitationEmail,
  type invitationRecipient,
  journeyInvitationBatchResult,
  journeyInviteeMatches,
} from "@kairn/contracts/journeys";
import { randomUUID } from "expo-crypto";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  type Pressable,
  type TextInput,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../../api";
import { JourneyRequestError, journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { Action, AppText, Field, Panel, StatusNotice } from "../ui";
import { JourneyPersonMark, peopleStyles } from "./people-presentation";

type Recipient = ReturnType<typeof invitationRecipient.parse>;
type Match = ReturnType<typeof journeyInviteeMatches.parse>["items"][number];
type Status = ReturnType<
  typeof journeyInvitationBatchResult.parse
>["items"][number]["status"];
type Draft = {
  id: string;
  label: string;
  recipient: Recipient;
  status?: Status;
};

const statusLabels: Record<Status, string> = {
  queued: "Invitation queued",
  already_member: "Already a journey member",
  already_pending: "Already invited",
  cancelled: "Invitation cancelled",
  duplicate: "Already included in this batch",
  invalid_email: "Recipient unavailable. Remove this entry and try again.",
  rate_limited: "Send limit reached. Try again later.",
};

export function InviteComposer(props: Parameters<typeof useInviteComposer>[0]) {
  return useInviteComposer(props).content;
}

export function useInviteComposer({
  scope,
  journeyId,
  title,
  open,
  enabled,
  afterCreation,
  onClose,
  onBusy,
  onSent,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
  title: string;
  open: boolean;
  enabled: boolean;
  afterCreation?: boolean;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onSent: () => void;
}) {
  const { canSubmit, refresh } = useMobileSession();
  const [mode, setMode] = useState<"search" | "email">("search");
  const [value, setValue] = useState("");
  const [matches, setMatches] = useState<Match[]>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const removeControls = useRef(
    new Map<string, ComponentRef<typeof Pressable>>(),
  );
  const searchRequest = useRef<AbortController>(undefined);
  const pending = useRef<{ key: string; entries: Draft[] }>(undefined);
  const posting = useRef(false);
  const editable = enabled && !sending && !unconfirmed;
  const unsent = drafts.filter(
    ({ status }) =>
      status === undefined ||
      status === "rate_limited" ||
      status === "invalid_email",
  );
  const succeeded = drafts.some(
    ({ status }) => status === "queued" || status === "already_pending",
  );

  useEffect(() => {
    if (open) AccessibilityInfo.announceForAccessibility("Invite people");
    return () => searchRequest.current?.abort();
  }, [open]);

  function change(next: string) {
    searchRequest.current?.abort();
    setSearching(false);
    setMatches(undefined);
    setValue(next);
    setFieldError("");
  }

  function selectMode(next: typeof mode, focus = false) {
    if (!editable) return;
    if (next !== mode) {
      setMode(next);
      change("");
    }
    if (focus) input.current?.focus();
  }

  function removeDraft(id: string) {
    if (!editable) return;
    const index = unsent.findIndex((draft) => draft.id === id);
    const nextId = (unsent[index + 1] ?? unsent[index - 1])?.id;
    setDrafts((previous) => previous.filter((draft) => draft.id !== id));
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (!enabled || !canSubmit(scope)) return;
        requestAnimationFrame(() => {
          const target =
            (nextId && removeControls.current.get(nextId)) || input.current;
          if (target && canSubmit(scope))
            AccessibilityInfo.sendAccessibilityEvent(target, "focus");
        });
      })
      .catch(() => {});
  }

  function add(recipient: Recipient, label: string) {
    if (!editable) return;
    if (drafts.length >= 10) {
      setFieldError("You can invite up to 10 people in a batch.");
      return;
    }
    const duplicate = drafts.some(
      (draft) =>
        ("email" in recipient &&
          "email" in draft.recipient &&
          recipient.email === draft.recipient.email) ||
        ("selection" in recipient &&
          "selection" in draft.recipient &&
          recipient.selection === draft.recipient.selection),
    );
    if (duplicate) {
      setFieldError("That recipient is already on the list.");
      return;
    }
    setDrafts((previous) => [
      ...previous,
      { id: randomUUID(), label, recipient },
    ]);
    change("");
    input.current?.focus();
  }

  async function resolveInput() {
    if (!editable || !canSubmit(scope)) return;
    const query = value.trim();
    if (mode === "email") {
      const parsed = invitationEmail.safeParse(query.toLowerCase());
      if (parsed.success) add({ email: parsed.data }, parsed.data);
      else setFieldError("Enter a valid email address.");
      return;
    }
    if (query.length < 3) {
      setFieldError("Enter at least 3 characters or an exact email address.");
      return;
    }
    searchRequest.current?.abort();
    const request = new AbortController();
    searchRequest.current = request;
    setMatches(undefined);
    setSearching(true);
    setFieldError("");
    try {
      const result = journeyResult(
        await scope.api.POST("/api/v1/journeys/{journeyId}/invitees/search", {
          params: { path: { journeyId } },
          body: { query },
          signal: request.signal,
        }),
        scope,
        refresh,
      );
      ensureActive(request.signal);
      setMatches(journeyInviteeMatches.parse(result).items);
    } catch (error) {
      if (!request.signal.aborted && !scope.signal.aborted)
        setFieldError(
          error instanceof JourneyRequestError && error.status === 429
            ? "Too many searches. Try again in a minute."
            : "Couldn’t search for people. Try again.",
        );
    } finally {
      if (!request.signal.aborted) setSearching(false);
    }
  }

  async function send() {
    const batch = pending.current ?? { key: randomUUID(), entries: unsent };
    if (
      posting.current ||
      !enabled ||
      !canSubmit(scope) ||
      !batch.entries.length
    )
      return;
    posting.current = true;
    Keyboard.dismiss();
    searchRequest.current?.abort();
    setSearching(false);
    setSending(true);
    onBusy(true);
    setFailure("");
    try {
      if (!canSubmit(scope)) return;
      pending.current = batch;
      const result = journeyResult(
        await scope.api.POST("/api/v1/journeys/{journeyId}/invitations", {
          params: {
            path: { journeyId },
            header: { "idempotency-key": batch.key },
          },
          body: { recipients: batch.entries.map(({ recipient }) => recipient) },
        }),
        scope,
        refresh,
      );
      const { items } = journeyInvitationBatchResult.parse(result);
      if (items.length !== batch.entries.length)
        throw new Error("Incomplete invitation result.");
      const statuses = new Map(
        batch.entries.map((draft, index) => [draft.id, items[index].status]),
      );
      setDrafts((previous) =>
        previous.map((draft) =>
          statuses.has(draft.id)
            ? { ...draft, status: statuses.get(draft.id) }
            : draft,
        ),
      );
      const queued = items.filter(({ status }) => status === "queued").length;
      setMessage(
        `${queued} ${queued === 1 ? "invitation" : "invitations"} queued.`,
      );
      pending.current = undefined;
      setUnconfirmed(false);
      onSent();
      const firstFailure = items.find(
        ({ status }) => status === "invalid_email" || status === "rate_limited",
      );
      if (firstFailure)
        AccessibilityInfo.announceForAccessibility(
          statusLabels[firstFailure.status],
        );
    } catch (error) {
      if (scope.signal.aborted) return;
      const known =
        error instanceof JourneyRequestError &&
        [404, 429].includes(error.status);
      if (known) pending.current = undefined;
      setUnconfirmed(!known);
      setFailure(
        known
          ? error.status === 404
            ? "This journey is unavailable for invitations."
            : "Send limit reached. Try again later."
          : "Couldn’t confirm this batch. Retry to check the same invitations.",
      );
    } finally {
      posting.current = false;
      setSending(false);
      onBusy(false);
    }
  }

  function close() {
    if (posting.current) return;
    if (!unconfirmed) {
      change("");
      setDrafts([]);
      setMessage("");
      setFailure("");
      setMode("search");
    }
    onClose();
  }

  const content = open ? (
    <View style={peopleStyles.list}>
      {!afterCreation && (
        <View style={peopleStyles.intro}>
          <AppText
            text="Invite people"
            variant="title"
            accessibilityRole="header"
          />
          <AppText text={title} subdued />
        </View>
      )}
      <Panel>
        <AppText
          text="Add recipients"
          variant="section"
          accessibilityRole="header"
        />
        <View style={peopleStyles.actions}>
          <View style={peopleStyles.actionCell}>
            <Action
              label="Find on Kairn"
              variant={mode === "search" ? "primary" : "secondary"}
              accessibilityState={{ selected: mode === "search" }}
              disabled={!editable}
              onPress={() => selectMode("search")}
            />
          </View>
          <View style={peopleStyles.actionCell}>
            <Action
              label="Invite by email"
              variant={mode === "email" ? "primary" : "secondary"}
              accessibilityState={{ selected: mode === "email" }}
              disabled={!editable}
              onPress={() => selectMode("email")}
            />
          </View>
        </View>
        <Field
          ref={input}
          label={mode === "email" ? "Email address" : "Name or exact email"}
          value={value}
          error={fieldError || undefined}
          onChangeText={change}
          onSubmitEditing={() => void resolveInput()}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={mode === "email" ? "email-address" : "default"}
          returnKeyType={mode === "email" ? "done" : "search"}
          maxLength={254}
          editable={editable}
        />
        <View style={styles.lookupAction}>
          <Action
            label={
              mode === "email"
                ? "Add email"
                : searching
                  ? "Searching…"
                  : "Search"
            }
            disabled={!editable || searching}
            onPress={() => void resolveInput()}
          />
        </View>
        {matches?.length === 0 && (
          <View style={styles.result}>
            <AppText text="No matches" variant="label" />
            <AppText
              text="Only people who enable invitation search in Account appear here."
              subdued
            />
            <Action
              label="Use email instead"
              variant="text"
              disabled={!editable}
              onPress={() => selectMode("email", true)}
            />
          </View>
        )}
        {matches?.map((match) =>
          match.ambiguous ? (
            <AppText
              key={match.selection}
              text={`${match.displayName} · Search by exact email to choose.`}
              subdued
            />
          ) : (
            <Action
              key={match.selection}
              label={`Add ${match.displayName}`}
              disabled={!editable}
              onPress={() =>
                add({ selection: match.selection }, match.displayName)
              }
            />
          ),
        )}
      </Panel>
      <View style={peopleStyles.intro}>
        <View style={styles.recipientHeading}>
          <AppText
            text="Recipients"
            variant="section"
            accessibilityRole="header"
          />
          <AppText
            text={String(drafts.length)}
            accessibilityLabel={`${drafts.length} ${drafts.length === 1 ? "recipient" : "recipients"}`}
            accessibilityLiveRegion={
              Platform.OS === "android" ? "polite" : undefined
            }
            variant="caption"
            style={styles.count}
          />
        </View>
        {drafts.length === 0 && <AppText text="No recipients yet" subdued />}
        {drafts.map((draft) => (
          <View key={draft.id} style={[peopleStyles.row, styles.recipient]}>
            <JourneyPersonMark
              name={"selection" in draft.recipient ? draft.label : undefined}
            />
            <View style={peopleStyles.rowCopy}>
              <AppText text={draft.label} variant="label" />
              {draft.status && (
                <AppText
                  text={statusLabels[draft.status]}
                  variant="caption"
                  subdued
                />
              )}
            </View>
            {unsent.includes(draft) && (
              <Action
                ref={(control) => {
                  if (control) removeControls.current.set(draft.id, control);
                  else removeControls.current.delete(draft.id);
                }}
                label="×"
                accessibilityLabel={`Remove ${draft.label}`}
                variant="text"
                disabled={!editable}
                onPress={() => removeDraft(draft.id)}
              />
            )}
          </View>
        ))}
        <View style={peopleStyles.rowDivider}>
          <AppText
            text="People can view the journey and its schedule after joining as Participants."
            variant="caption"
            subdued
          />
        </View>
      </View>
      <StatusNotice
        notice={
          failure
            ? { text: failure, tone: "error" }
            : message
              ? { text: message, tone: "success" }
              : null
        }
      />
      <View style={peopleStyles.actions}>
        <View style={peopleStyles.actionCell}>
          <Action
            label={
              afterCreation && unconfirmed
                ? "Open journey"
                : succeeded && !unconfirmed
                  ? "Done"
                  : afterCreation
                    ? "Skip for now"
                    : "Close"
            }
            disabled={sending || !enabled}
            onPress={close}
          />
        </View>
        <View style={peopleStyles.actionCell}>
          <Action
            label={
              sending
                ? "Sending…"
                : unconfirmed
                  ? "Retry batch"
                  : "Send invitations"
            }
            variant="primary"
            disabled={!enabled || sending || (!unconfirmed && !unsent.length)}
            onPress={() => void send()}
          />
        </View>
      </View>
    </View>
  ) : null;
  return { content, close };
}

const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  lookupAction: { alignItems: "flex-end" },
  result: {
    gap: space.step8,
    backgroundColor: color.canvas,
    borderRadius: radius.control,
    padding: space.step12,
  },
  recipientHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.step8,
  },
  count: {
    color: color.action,
    backgroundColor: color.surface,
    borderRadius: radius.tag,
    paddingHorizontal: space.step8,
    paddingVertical: space.step4,
  },
  recipient: {
    paddingHorizontal: space.step8,
    paddingVertical: space.step4,
    borderRadius: radius.control,
    backgroundColor: color.surface,
  },
}));
