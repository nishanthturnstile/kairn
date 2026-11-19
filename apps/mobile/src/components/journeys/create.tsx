import {
  type FieldErrors,
  fieldOrder,
  type JourneyField,
  journeyDraft,
  journeyFormIssues,
  type OffsetChoices,
  validateJourneyDraft,
} from "@kairn/shared/journey-form";
import { useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useFocusEffect, useRouter } from "expo-router";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Keyboard, type TextInput, View } from "react-native";
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
import { Action, AppText, Field, Panel, StatusNotice } from "../ui";
import { SchedulePicker } from "./picker";
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

export function CreateJourney({ scope }: { scope: VerifiedMobileScope }) {
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
    <JourneyScreen>
      <AppText
        text="Create journey"
        variant="title"
        accessibilityRole="header"
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
        <JourneyForm scope={scope} initialAttempt={pending.data} />
      )}
    </JourneyScreen>
  );
}

function JourneyForm({
  scope,
  initialAttempt,
}: {
  scope: VerifiedMobileScope;
  initialAttempt: JourneyAttempt | null;
}) {
  const router = useRouter();
  const { refresh } = useMobileSession();
  const [draft, setDraft] = useState(() => journeyDraft(initialAttempt?.input));
  const [attempt, setAttempt] = useState(initialAttempt);
  const [confirmed, setConfirmed] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [choices, setChoices] = useState<OffsetChoices>({});
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const focused = useRef(false);
  const editRefs = useRef<
    Partial<Record<JourneyField, ComponentRef<typeof TextInput> | null>>
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
    editRefs.current[pendingFocus.current]?.focus();
    pendingFocus.current = undefined;
  }, [errors, saving]);

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
    if (scope.signal.aborted || attempt || saving) return;
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

  function openJourney(id: string) {
    if (!scope.signal.aborted && focused.current)
      router.replace({
        pathname: "/journeys/[journeyId]",
        params: { journeyId: id },
      });
  }

  async function submit() {
    if (submitting.current || scope.signal.aborted || !focused.current) return;
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
    setSaving(true);
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
        if (submitted.key !== proposed.key || !focused.current) {
          setDraft(journeyDraft(submitted.input));
          setChoices({});
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
      if (visible()) {
        setConfirmed(saved.id);
        openJourney(saved.id);
      }
    } catch (error) {
      if (!visible()) return;
      if (
        submitted &&
        error instanceof JourneyRequestError &&
        [400, 403, 404, 409, 413, 415].includes(error.status)
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
      if (visible()) setSaving(false);
    }
  }

  const locked = attempt !== null || saving || confirmed !== undefined;
  const notice = saving
    ? { text: "Saving…", tone: "info" as const }
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
    <>
      <Panel>
        <View style={journeyStyles.contentHeader}>
          <Field
            label="Title"
            ref={editRef("title")}
            error={errors.title}
            value={draft.title}
            onChangeText={(value) => update("title", value)}
            maxLength={120}
            editable={!locked}
          />
          {(["start", "end"] as const).map((part) => {
            const label = part === "start" ? "Start" : "End";
            const offset = `${part}Offset` as const;
            return (
              <View key={part} style={journeyStyles.group}>
                <AppText
                  text={
                    part === "start"
                      ? "Intended start"
                      : "Intended end (optional)"
                  }
                  variant="section"
                  accessibilityRole="header"
                />
                {(["Date", "Time"] as const).map((kind) => {
                  const field = `${part}${kind}` as const;
                  const format = kind === "Date" ? "YYYY-MM-DD" : "HH:mm";
                  return (
                    <View style={journeyStyles.group} key={field}>
                      <Field
                        label={`${label} ${kind.toLowerCase()}`}
                        ref={editRef(field)}
                        error={errors[field]}
                        accessibilityHint={`Enter ${format}`}
                        placeholder={format}
                        value={draft[field]}
                        onChangeText={(value) => update(field, value)}
                        autoCorrect={false}
                        autoCapitalize="none"
                        editable={!locked}
                      />
                      <SchedulePicker
                        mode={kind === "Date" ? "date" : "time"}
                        label={`Pick ${label.toLowerCase()} ${kind.toLowerCase()}`}
                        value={draft[field]}
                        disabled={locked}
                        onChange={(value) => update(field, value)}
                      />
                    </View>
                  );
                })}
                {choices[offset] ? (
                  <View
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
                        label={`${index === 0 ? "First" : "Second"} occurrence (UTC${choice})`}
                        accessibilityRole="radio"
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
            label="Timezone"
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
      <StatusNotice notice={notice} />
      <Action
        label={
          confirmed
            ? "Open journey"
            : saving
              ? "Saving…"
              : attempt
                ? "Retry save"
                : "Save journey"
        }
        variant="primary"
        accessibilityState={{ busy: saving }}
        disabled={saving}
        onPress={() => (confirmed ? openJourney(confirmed) : void submit())}
      />
    </>
  );
}
