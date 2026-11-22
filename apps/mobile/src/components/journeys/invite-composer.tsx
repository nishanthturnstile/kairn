import {
  invitationEmail,
  type invitationRecipient,
  journeyInvitationBatchResult,
  journeyInviteeMatches,
} from "@kairn/contracts/journeys";
import { invitationBatchNotice } from "@kairn/shared/journey-invitations";
import { randomUUID } from "expo-crypto";
import {
  type ComponentRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../../api";
import { JourneyRequestError, journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { Avatar } from "../fold/identity";
import {
  Action,
  AppText,
  Field,
  focusOutline,
  Panel,
  StatusNotice,
  touchTarget,
} from "../fold/primitives";
import { journeyFlowStyles } from "./flow";
import { peopleStyles } from "./people-presentation";

type Recipient = ReturnType<typeof invitationRecipient.parse>;
type InviteMode = "search" | "email";
const inviteMethods = [
  { mode: "search", label: "Find on Kairn" },
  { mode: "email", label: "Invite by email" },
] as const;
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
  const { width, fontScale } = useWindowDimensions();
  const inlineMethods = width >= 360 && fontScale <= 1.35;
  const [mode, setMode] = useState<InviteMode>("search");
  const [value, setValue] = useState("");
  const [matches, setMatches] = useState<Match[]>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState<ReturnType<
    typeof invitationBatchNotice
  > | null>(null);
  const [failure, setFailure] = useState("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const removeControls = useRef(
    new Map<string, ComponentRef<typeof Pressable>>(),
  );
  const searchRequest = useRef<AbortController>(undefined);
  const visible = useRef(false);
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
  const finished =
    afterCreation &&
    succeeded &&
    unsent.length === 0 &&
    !unconfirmed &&
    !sending;

  useEffect(() => {
    if (open && !afterCreation)
      AccessibilityInfo.announceForAccessibility("Invite people");
  }, [open, afterCreation]);

  useLayoutEffect(() => {
    visible.current = open && enabled;
    if (!visible.current) {
      setSearching(false);
      if (input.current?.isFocused()) Keyboard.dismiss();
    }
    return () => {
      visible.current = false;
      searchRequest.current?.abort();
    };
  }, [open, enabled]);

  function change(next: string) {
    searchRequest.current?.abort();
    setSearching(false);
    setMatches(undefined);
    setValue(next);
    setFieldError("");
  }

  function selectMode(next: InviteMode, focus = false) {
    if (!editable) return;
    if (next !== mode) {
      setMode(next);
      change("");
    }
    if (focus) input.current?.focus();
  }

  function restoreRecipientFocus(nextId?: string) {
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (!enabled) return;
        requestAnimationFrame(() => {
          const target =
            (nextId && removeControls.current.get(nextId)) || input.current;
          if (target && visible.current && canSubmit(scope))
            AccessibilityInfo.sendAccessibilityEvent(target, "focus");
        });
      })
      .catch(() => {});
  }

  function removeDraft(id: string) {
    if (!editable) return;
    const index = unsent.findIndex((draft) => draft.id === id);
    const nextId = (unsent[index + 1] ?? unsent[index - 1])?.id;
    setDrafts((previous) => previous.filter((draft) => draft.id !== id));
    restoreRecipientFocus(nextId);
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
    if (afterCreation) {
      Keyboard.dismiss();
      if ("selection" in recipient) restoreRecipientFocus();
      if (Platform.OS === "ios")
        AccessibilityInfo.announceForAccessibilityWithOptions(
          `${label} added to recipients.`,
          { queue: true },
        );
    } else input.current?.focus();
  }

  async function resolveInput() {
    if (!editable || !canSubmit(scope)) return;
    const query = value.trim();
    if (mode === "email") {
      const parsed = invitationEmail.safeParse(query.toLowerCase());
      if (parsed.success) add({ email: parsed.data }, parsed.data);
      else {
        setFieldError("Enter a valid email address.");
        input.current?.focus();
      }
      return;
    }
    if (query.length < 3) {
      setFieldError("Enter at least 3 characters or an exact email address.");
      input.current?.focus();
      return;
    }
    searchRequest.current?.abort();
    const request = new AbortController();
    searchRequest.current = request;
    if (afterCreation) Keyboard.dismiss();
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
      const items = journeyInviteeMatches.parse(result).items;
      setMatches(items);
      if (Platform.OS === "ios" && visible.current)
        AccessibilityInfo.announceForAccessibilityWithOptions(
          matchesSummary(items),
          { queue: true },
        );
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
      setMessage(invitationBatchNotice(items));
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
      setMessage(null);
      setFailure("");
      setMode("search");
    }
    onClose();
  }

  const findLabel = mode === "email" ? "Email address" : "Name or exact email";
  const openLabel =
    afterCreation && unconfirmed
      ? "Open journey"
      : succeeded && !unconfirmed
        ? "Done"
        : afterCreation
          ? "Skip for now"
          : "Close";
  const dismissAction = (
    <Action label={openLabel} disabled={sending || !enabled} onPress={close} />
  );
  const sendAction = (
    <Action
      label={
        finished
          ? "Done"
          : sending
            ? "Sending…"
            : unconfirmed
              ? "Retry batch"
              : "Send invitations"
      }
      variant="primary"
      accessibilityState={{ busy: sending }}
      feedback={sending ? "pending" : finished ? "success" : "idle"}
      disabled={
        !enabled || (!finished && (sending || (!unconfirmed && !unsent.length)))
      }
      onPress={finished ? close : () => void send()}
    />
  );
  const finder = (
    <>
      <AppText
        text="Add recipients"
        variant="section"
        accessibilityRole="header"
      />
      {afterCreation ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Invitation method"
          style={[styles.methods, inlineMethods && styles.methodsRow]}
        >
          {inviteMethods.map((method) => (
            <InviteMethod
              key={method.mode}
              label={method.label}
              selected={mode === method.mode}
              disabled={!editable}
              inline={inlineMethods}
              onSelect={() => selectMode(method.mode)}
            />
          ))}
        </View>
      ) : (
        <View style={peopleStyles.actions}>
          {inviteMethods.map((method) => (
            <View key={method.mode} style={peopleStyles.actionCell}>
              <Action
                label={method.label}
                variant={mode === method.mode ? "primary" : "secondary"}
                accessibilityState={{ selected: mode === method.mode }}
                disabled={!editable}
                onPress={() => selectMode(method.mode)}
              />
            </View>
          ))}
        </View>
      )}
      <Field
        ref={input}
        label={findLabel}
        placeholder={
          afterCreation
            ? mode === "email"
              ? "e.g. mira@example.com"
              : "e.g. Mira Rao"
            : undefined
        }
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
      <View style={!afterCreation && styles.lookupAction}>
        <Action
          label={
            mode === "email" ? "Add email" : searching ? "Searching…" : "Search"
          }
          accessibilityState={{ busy: searching }}
          disabled={!editable || searching}
          onPress={() => void resolveInput()}
        />
      </View>
      {matches && (
        <View accessibilityLiveRegion="polite">
          <AppText text={matchesSummary(matches)} variant="caption" subdued />
        </View>
      )}
      {matches?.length === 0 && (
        <View style={styles.result}>
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
        ) : afterCreation ? (
          <View
            key={match.selection}
            style={[
              peopleStyles.row,
              styles.match,
              !inlineMethods && styles.stackedRecipient,
            ]}
          >
            <View style={[peopleStyles.row, inlineMethods && styles.identity]}>
              <Avatar name={match.displayName} />
              <View style={peopleStyles.rowCopy}>
                <AppText text={match.displayName} variant="label" />
              </View>
            </View>
            <Action
              label="Add"
              accessibilityLabel={`Add ${match.displayName}`}
              size="compact"
              disabled={!editable}
              onPress={() =>
                add({ selection: match.selection }, match.displayName)
              }
            />
          </View>
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
    </>
  );
  const content = open ? (
    <View style={afterCreation ? styles.flowContent : peopleStyles.list}>
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
      {afterCreation ? (
        <View style={journeyFlowStyles.section}>{finder}</View>
      ) : (
        <Panel>{finder}</Panel>
      )}
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
        {afterCreation && (
          <AppText text={title} variant="label" style={styles.journeyName} />
        )}
        {drafts.length === 0 && <AppText text="No recipients yet" subdued />}
        {drafts.map((draft) => (
          <View
            key={draft.id}
            style={[
              peopleStyles.row,
              styles.recipient,
              afterCreation && !inlineMethods && styles.stackedRecipient,
            ]}
          >
            <View
              style={[
                peopleStyles.row,
                (!afterCreation || inlineMethods) && styles.identity,
              ]}
            >
              <Avatar
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
            </View>
            {unsent.includes(draft) && (
              <Action
                ref={(control) => {
                  if (control) removeControls.current.set(draft.id, control);
                  else removeControls.current.delete(draft.id);
                }}
                label={afterCreation ? "Remove" : "×"}
                accessibilityLabel={`Remove ${draft.label}`}
                size={afterCreation ? "compact" : "standard"}
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
        notice={failure ? { text: failure, tone: "error" } : message}
      />
      {afterCreation ? (
        <View style={journeyFlowStyles.actions}>
          {sendAction}
          {!finished && dismissAction}
        </View>
      ) : (
        <View style={peopleStyles.actions}>
          <View style={peopleStyles.actionCell}>{dismissAction}</View>
          <View style={peopleStyles.actionCell}>{sendAction}</View>
        </View>
      )}
    </View>
  ) : null;
  return { content, close };
}

function matchesSummary(matches: Match[]) {
  return matches.length
    ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} found.`
    : "No matches";
}

function InviteMethod({
  label,
  selected,
  disabled,
  inline,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  inline: boolean;
  onSelect: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onSelect}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.method,
        inline && styles.inlineMethod,
        (selected || pressed) && styles.methodSelected,
        focused && styles.methodFocused,
      ]}
    >
      <AppText
        text={label}
        variant="label"
        subdued={disabled}
        style={styles.methodLabel}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    flowContent: { gap: space.step16 },
    lookupAction: { alignItems: "flex-end" },
    methods: {
      borderWidth: border.control,
      borderColor: color.boundary,
      borderRadius: radius.card,
      padding: space.step4,
      gap: space.step4,
      backgroundColor: color.surface,
    },
    methodsRow: { flexDirection: "row" },
    method: {
      minWidth: touchTarget,
      minHeight: touchTarget,
      padding: space.step8,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
      borderWidth: border.control,
      borderColor: "transparent",
    },
    inlineMethod: { flex: 1 },
    methodLabel: { textAlign: "center" },
    methodSelected: {
      backgroundColor: color.actionWash,
      borderColor: color.action,
    },
    methodFocused: focusOutline(color.focus),
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
    journeyName: {
      borderBottomWidth: border.control,
      borderBottomColor: color.boundary,
      paddingBottom: space.step8,
    },
    match: {
      borderBottomWidth: border.control,
      borderBottomColor: color.boundary,
      paddingVertical: space.step4,
    },
    identity: { flex: 1, minWidth: 0 },
    stackedRecipient: { flexDirection: "column", alignItems: "stretch" },
    recipient: {
      paddingHorizontal: space.step8,
      paddingVertical: space.step4,
      borderRadius: radius.control,
      backgroundColor: color.surface,
    },
  }),
);
