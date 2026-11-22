import type { OnboardingIntent } from "@kairn/contracts";
import {
  canReleaseJourneyAttempt,
  type FieldErrors,
  fieldOrder,
  type JourneyField,
  journeyDraft,
  journeyFormIssues,
  type OffsetChoices,
  validateJourneyDraft,
} from "@kairn/shared/journey-form";
import { journeyIntentCopy } from "@kairn/shared/journey-intent-copy";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useFocusEffect, useRouter } from "expo-router";
import {
  type ComponentRef,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Keyboard,
  type Pressable,
  type ScrollView,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../../api";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import type { JourneyAttempt } from "../../storage/journey-attempt";
import { openAccountWorkspace } from "../../storage/workspace";
import { dashboardKey } from "../../workspace-keys";
import {
  Action,
  AppText,
  Field,
  Panel,
  StatusNotice,
} from "../fold/primitives";
import { JourneyFlowHeading, journeyFlowStyles } from "./flow";
import { focusInvalidSchedule, ScheduleField } from "./picker";
import { JourneyRetry, JourneyScreen, journeyStyles } from "./states";

type AttemptStore = Awaited<
  ReturnType<typeof openAccountWorkspace>
>["journeyAttempts"];

async function withAttempts<Result>(
  scope: VerifiedMobileScope,
  operation: (attempts: AttemptStore) => Promise<Result>,
) {
  ensureActive(scope.signal);
  const workspace = await openAccountWorkspace(scope.accountId);
  try {
    ensureActive(scope.signal);
    return await operation(workspace.journeyAttempts);
  } finally {
    await workspace.close();
  }
}

export function CreateJourney({
  scope,
  intent,
}: {
  scope: VerifiedMobileScope;
  intent?: OnboardingIntent;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const pending = useQuery({
    queryKey: ["pending-journey"],
    refetchOnMount: "always",
    async queryFn({ signal }) {
      const attempt = await withAttempts(scope, (attempts) => attempts.read());
      ensureActive(scope.signal);
      ensureActive(signal);
      return attempt;
    },
  });
  return (
    <JourneyScreen density="compact" scrollRef={scroll}>
      <JourneyFlowHeading
        title="Create journey"
        description="Give your journey a name and choose when it starts."
      />
      {pending.isError ? (
        <JourneyRetry
          text="Couldn’t recover your saved attempt."
          busy={pending.isFetching}
          retry={() => void pending.refetch()}
        />
      ) : !pending.isFetchedAfterMount || pending.isPending ? (
        <StatusNotice
          notice={{ text: "Checking for an unfinished save", tone: "info" }}
        />
      ) : (
        <JourneyForm
          scope={scope}
          intent={intent}
          initialAttempt={pending.data}
          scroll={scroll}
        />
      )}
    </JourneyScreen>
  );
}

function JourneyForm({
  scope,
  intent,
  initialAttempt,
  scroll,
}: {
  scope: VerifiedMobileScope;
  intent?: OnboardingIntent;
  initialAttempt: JourneyAttempt | null;
  scroll: RefObject<ComponentRef<typeof ScrollView> | null>;
}) {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const compactPickers = width >= 365 && fontScale <= 1.35;
  const { refresh, canSubmit } = useMobileSession();
  const [draft, setDraft] = useState(() => journeyDraft(initialAttempt?.input));
  const [attempt, setAttempt] = useState(initialAttempt);
  const [confirmed, setConfirmed] = useState<{
    id: string;
    invitePeople: boolean;
  }>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [choices, setChoices] = useState<OffsetChoices>({});
  const [feedback, setFeedback] = useState("");
  const [savingAction, setSavingAction] = useState<{
    invitePeople: boolean;
    retry: boolean;
  } | null>(null);
  const saving = savingAction !== null;
  const [addingEnd, setAddingEnd] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const focused = useRef(false);
  const editRefs = useRef<
    Partial<Record<JourneyField, ComponentRef<typeof TextInput> | null>>
  >({});
  const occurrenceRefs = useRef<
    Partial<Record<keyof OffsetChoices, ComponentRef<typeof Pressable> | null>>
  >({});
  const occurrenceGroups = useRef<
    Partial<Record<keyof OffsetChoices, ComponentRef<typeof View> | null>>
  >({});
  const pendingFocus = useRef<JourneyField | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  useEffect(() => {
    if (saving || !pendingFocus.current || !errors[pendingFocus.current])
      return;
    const field = pendingFocus.current;
    pendingFocus.current = undefined;
    if (field !== "startOffset" && field !== "endOffset") {
      if (
        field === "startDate" ||
        field === "endDate" ||
        field === "startTime" ||
        field === "endTime"
      ) {
        focusInvalidSchedule(
          editRefs.current[field],
          field.endsWith("Date") ? "date" : "time",
          draft[field],
        );
      } else editRefs.current[field]?.focus();
      return;
    }
    const choice = occurrenceRefs.current[field];
    const group = occurrenceGroups.current[field];
    const content = scroll.current?.getInnerViewRef();
    if (!choice || !group || !content) return;
    group.measureLayout(content, (_x, y) => {
      if (
        occurrenceRefs.current[field] !== choice ||
        !focused.current ||
        !canSubmit(scope)
      )
        return;
      scroll.current?.scrollTo({ y, animated: false });
      requestAnimationFrame(() => {
        if (
          occurrenceRefs.current[field] === choice &&
          focused.current &&
          canSubmit(scope)
        )
          AccessibilityInfo.sendAccessibilityEvent(choice, "focus");
      });
    });
  }, [draft, canSubmit, errors, saving, scope, scroll]);

  function editRef(field: JourneyField) {
    return (input: ComponentRef<typeof TextInput> | null) => {
      editRefs.current[field] = input;
    };
  }

  function showErrors(fields: FieldErrors) {
    pendingFocus.current = fieldOrder.find((field) => fields[field]);
    setErrors(fields);
  }

  function update(field: JourneyField, value: string) {
    if (!canSubmit(scope) || attempt || saving) return;
    setFeedback("");
    const resetStart =
      field === "startDate" || field === "startTime" || field === "timeZone";
    const resetEnd =
      field === "endDate" || field === "endTime" || field === "timeZone";
    setErrors((previous) => {
      const next = { ...previous, [field]: undefined };
      if (resetStart) {
        delete next.startDate;
        delete next.startTime;
        delete next.startOffset;
        delete next.endTime;
      }
      if (resetEnd) {
        delete next.endDate;
        delete next.endTime;
        delete next.endOffset;
      }
      return next;
    });
    if (resetStart || resetEnd)
      setChoices((previous) => ({
        startOffset: resetStart ? undefined : previous.startOffset,
        endOffset: resetEnd ? undefined : previous.endOffset,
      }));
    setDraft((previous) => ({
      ...previous,
      ...(resetStart && { startOffset: "" }),
      ...(resetEnd && { endOffset: "" }),
      [field]: value,
    }));
  }

  function openJourney({ id, invitePeople }: NonNullable<typeof confirmed>) {
    if (canSubmit(scope) && focused.current)
      router.replace({
        pathname: invitePeople
          ? "/journeys/[journeyId]/invite"
          : "/journeys/[journeyId]",
        params: { journeyId: id },
      });
  }

  async function submit(invitePeople: boolean) {
    if (submitting.current || !canSubmit(scope) || !focused.current) return;
    let submitted = attempt;
    const result = submitted ? undefined : validateJourneyDraft(draft);
    if (result?.errors) {
      showErrors(result.errors);
      return;
    }
    if (
      result?.input &&
      ((choices.startOffset && !draft.startOffset) ||
        (choices.endOffset && !draft.endOffset))
    ) {
      showErrors({
        startOffset:
          choices.startOffset && !draft.startOffset
            ? "Choose which occurrence you meant."
            : undefined,
        endOffset:
          choices.endOffset && !draft.endOffset
            ? "Choose which occurrence you meant."
            : undefined,
      });
      return;
    }

    Keyboard.dismiss();
    submitting.current = true;
    setSavingAction({ invitePeople, retry: attempt !== null });
    setFeedback("");
    setErrors({});
    const visible = () => mounted.current && !scope.signal.aborted;
    try {
      if (!submitted && result?.input) {
        const proposed = { key: randomUUID(), input: result.input };
        submitted = await withAttempts(scope, (attempts) =>
          attempts.claim(proposed),
        );
        if (!visible()) return;
        setAttempt(submitted);
        if (
          submitted.key !== proposed.key ||
          !focused.current ||
          !canSubmit(scope)
        ) {
          setDraft(journeyDraft(submitted.input));
          setChoices({});
          setAddingEnd(false);
          return;
        }
      }
      if (!submitted) return;
      const { key, input } = submitted;
      const response = await scope.api.POST("/api/v1/journeys", {
        params: { header: { "idempotency-key": key } },
        body: input,
      });
      const saved = journeyResult(response, scope, refresh);
      await withAttempts(scope, (attempts) => attempts.clear(key)).catch(
        () => {},
      );
      if (scope.signal.aborted) return;
      void scope.queryClient.invalidateQueries({ queryKey: historyKey });
      void scope.queryClient.invalidateQueries({ queryKey: dashboardKey });
      if (visible()) {
        const destination = { id: saved.id, invitePeople };
        setConfirmed(destination);
        openJourney(destination);
      }
    } catch (error) {
      if (!visible()) return;
      if (
        submitted &&
        error instanceof JourneyRequestError &&
        canReleaseJourneyAttempt(error.status, error.issues)
      ) {
        const { key } = submitted;
        try {
          await withAttempts(scope, (attempts) => attempts.clear(key));
        } catch {
          if (visible())
            setFeedback("Couldn’t update the saved attempt on this device.");
          return;
        }
        if (!visible()) return;
        setAttempt(null);
        const fields = journeyFormIssues(error.issues);
        setChoices((previous) => ({ ...previous, ...fields.choices }));
        showErrors(fields.errors);
        if (!Object.keys(fields.errors).length)
          setFeedback(
            error.status === 404
              ? "This journey is unavailable."
              : "Couldn’t save this journey. Check the details and try again.",
          );
      } else {
        setFeedback(
          submitted
            ? "We couldn’t confirm the save. Retry with the same details."
            : "Couldn’t save the attempt on this device. Try again.",
        );
      }
    } finally {
      submitting.current = false;
      if (visible()) setSavingAction(null);
    }
  }

  const locked = attempt !== null || saving || confirmed !== undefined;
  const hasEnd = Boolean(
    addingEnd ||
      draft.endDate ||
      draft.endTime ||
      draft.endOffset ||
      errors.endDate ||
      errors.endTime ||
      errors.endOffset ||
      choices.endOffset,
  );
  const startPreview = previewMinute(draft.startDate, draft.startTime);
  const endPreview = previewMinute(draft.endDate, draft.endTime);

  function toggleEnd() {
    if (locked || !canSubmit(scope)) return;
    if (hasEnd) {
      Keyboard.dismiss();
      update("endDate", "");
      update("endTime", "");
    }
    setAddingEnd(!hasEnd);
  }
  const retry = savingAction?.retry ?? attempt !== null;
  const notice = saving
    ? {
        text: savingAction.invitePeople
          ? "Saving before invitations…"
          : "Saving journey…",
        tone: "info" as const,
      }
    : confirmed
      ? { text: "Journey saved.", tone: "success" as const }
      : feedback
        ? { text: feedback, tone: "error" as const }
        : attempt
          ? {
              text: "Retry your unfinished save using these details.",
              tone: "info" as const,
            }
          : null;
  return (
    <View style={styles.editor}>
      <View style={journeyFlowStyles.section}>
        <AppText
          text="Journey details"
          variant="section"
          accessibilityRole="header"
        />
        <Field
          label="Title"
          ref={editRef("title")}
          error={errors.title}
          value={draft.title}
          onChangeText={(value) => update("title", value)}
          placeholder="e.g. A weekend in Coorg"
          maxLength={120}
          editable={!locked}
          returnKeyType="next"
          onSubmitEditing={() => editRefs.current.startDate?.focus()}
        />
      </View>
      <Panel>
        <View style={styles.scheduleFields}>
          <View style={journeyFlowStyles.heading}>
            <AppText
              text="Schedule"
              variant="section"
              accessibilityRole="header"
            />
            <AppText
              text={
                intent
                  ? journeyIntentCopy[intent].guidance
                  : "Use the journey’s local time."
              }
              variant="caption"
              subdued
            />
          </View>
          {(["start", "end"] as const).map((part) => {
            const label = part === "start" ? "Start" : "End";
            const offset = `${part}Offset` as const;
            return (
              <View key={part} style={styles.scheduleFields}>
                {part === "end" && (!locked || hasEnd) && (
                  <View style={styles.optionalAction}>
                    <Action
                      label={hasEnd ? "Remove end date" : "Add end date"}
                      variant="text"
                      size="compact"
                      accessibilityState={{ expanded: hasEnd }}
                      disabled={locked}
                      onPress={toggleEnd}
                    />
                  </View>
                )}
                {(part === "start" || hasEnd) &&
                  (["Date", "Time"] as const).map((kind) => {
                    const field = `${part}${kind}` as const;
                    return (
                      <ScheduleField
                        key={field}
                        mode={kind === "Date" ? "date" : "time"}
                        label={`${label} ${kind.toLowerCase()}`}
                        ref={editRef(field)}
                        value={draft[field]}
                        disabled={locked}
                        compact={compactPickers}
                        error={errors[field]}
                        onChange={(value) => update(field, value)}
                      />
                    );
                  })}
                {choices[offset] ? (
                  <View
                    ref={(node) => {
                      occurrenceGroups.current[offset] = node;
                    }}
                    collapsable={false}
                    accessibilityRole="radiogroup"
                    style={journeyStyles.group}
                  >
                    <AppText
                      text={`${label} time occurrence`}
                      variant="label"
                    />
                    {errors[offset] && (
                      <StatusNotice
                        notice={{ text: errors[offset], tone: "error" }}
                      />
                    )}
                    {choices[offset].map((choice, index) => (
                      <Action
                        key={choice}
                        ref={
                          index === 0
                            ? (node) => {
                                occurrenceRefs.current[offset] = node;
                              }
                            : undefined
                        }
                        label={`${index === 0 ? "First" : "Second"} occurrence (UTC${choice})`}
                        accessibilityRole="radio"
                        accessibilityLabel={`${label} time, ${index === 0 ? "first" : "second"} occurrence (UTC${choice})`}
                        accessibilityHint={errors[offset]}
                        accessibilityState={{
                          checked: draft[offset] === choice,
                        }}
                        variant={
                          draft[offset] === choice ? "primary" : "secondary"
                        }
                        disabled={locked}
                        onPress={() => update(offset, choice)}
                      />
                    ))}
                  </View>
                ) : (
                  draft[offset] && (
                    <AppText
                      text={`${label} time offset · UTC${draft[offset]}`}
                      subdued
                    />
                  )
                )}
              </View>
            );
          })}
          <Field
            label="Time zone"
            ref={editRef("timeZone")}
            error={errors.timeZone}
            value={draft.timeZone}
            onChangeText={(value) => update("timeZone", value)}
            autoCorrect={false}
            autoCapitalize="none"
            editable={!locked}
          />
        </View>
      </Panel>
      <View style={styles.preview}>
        <AppText
          text="Journey preview"
          variant="label"
          accessibilityRole="header"
        />
        <AppText text={draft.title.trim() || "Untitled journey"} />
        <AppText
          text={`Start · ${startPreview ?? "Date and time needed"}`}
          variant="caption"
          subdued
        />
        <AppText
          text={`End · ${endPreview ?? (hasEnd ? "Date and time needed" : "Open-ended")}`}
          variant="caption"
          subdued
        />
        {draft.timeZone.trim() && (
          <AppText
            text={`Time zone · ${draft.timeZone.trim()}`}
            variant="caption"
            subdued
          />
        )}
      </View>
      <View style={journeyFlowStyles.actions}>
        <StatusNotice notice={notice} />
        {!confirmed && (
          <AppText
            text="Only you can see this journey when you save it."
            variant="caption"
            subdued
          />
        )}
        <Action
          label={
            confirmed
              ? confirmed.invitePeople
                ? "Invite people"
                : "Open journey"
              : savingAction && !savingAction.invitePeople
                ? "Saving…"
                : retry
                  ? "Retry save"
                  : "Save journey"
          }
          variant="primary"
          feedback={
            savingAction && !savingAction.invitePeople
              ? "pending"
              : confirmed
                ? "success"
                : "idle"
          }
          disabled={saving}
          onPress={() =>
            confirmed ? openJourney(confirmed) : void submit(false)
          }
        />
        {!confirmed && (
          <Action
            label={
              savingAction?.invitePeople
                ? "Saving before invitations…"
                : retry
                  ? "Retry save & invite people"
                  : "Create & invite people"
            }
            accessibilityState={{ busy: savingAction?.invitePeople }}
            disabled={saving}
            onPress={() => void submit(true)}
          />
        )}
      </View>
    </View>
  );
}

function previewMinute(date: string, time: string) {
  const local = `${date}T${time}`;
  const instant = new Date(`${local}Z`);
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.toISOString().slice(0, 16) !== local
  )
    return null;
  const shown = formatJourneyLocalMinute(local);
  return `${shown.date} · ${shown.time}`;
}

const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  editor: { gap: space.step16 },
  scheduleFields: { gap: space.step12 },
  optionalAction: { alignItems: "flex-start" },
  preview: {
    borderRadius: radius.card,
    backgroundColor: color.actionWash,
    padding: space.step12,
    gap: space.step4,
  },
}));
