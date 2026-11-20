import type { OnboardingIntent } from "@kairn/contracts";
import {
  canReleaseJourneyAttempt,
  type FieldErrors,
  fieldOrder,
  type JourneyDraft,
  type JourneyField,
  journeyDraft,
  journeyFormIssues,
  type OffsetChoices,
  validateJourneyDraft,
} from "@kairn/shared/journey-form";
import { useQuery } from "@tanstack/react-query";
import {
  type ComponentProps,
  type SubmitEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../lib/journey-api";
import {
  claimJourneyAttempt,
  clearJourneyAttempt,
  type JourneyAttempt,
  loadJourneyAttempt,
} from "../../lib/journey-attempt";
import { journeyIntentCopy } from "../../lib/journey-intent-copy";
import type { AccountScope } from "../../lib/session";
import { useSessionAccess } from "../../lib/session-access";
import { PageHeading } from "../page-heading";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { JourneyBackLink, JourneyLoading, JourneyRetry } from "./states";

const zones = new Set(["UTC", ...(Intl.supportedValuesOf?.("timeZone") ?? [])]);

interface CreatePageProps {
  scope: AccountScope;
  accountId: string;
  intent?: OnboardingIntent;
  openJourney: (journeyId: string) => void;
}

export function CreateJourneyPage(props: CreatePageProps) {
  const pending = useQuery({
    queryKey: [props.accountId, "pending-journey"],
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: () => loadJourneyAttempt(props.accountId),
  });
  return (
    <section className="grid max-w-xl gap-6 sm:gap-8">
      <JourneyBackLink />
      <PageHeading
        title="Create journey"
        description={props.intent && journeyIntentCopy[props.intent].guidance}
      />
      {pending.isError ? (
        <JourneyRetry
          title="Couldn’t recover your saved attempt"
          busy={pending.isFetching}
          retry={() => void pending.refetch()}
        />
      ) : !pending.isFetchedAfterMount || pending.isPending ? (
        <JourneyLoading label="Checking for an unfinished save" />
      ) : (
        <JourneyForm {...props} initialAttempt={pending.data} />
      )}
    </section>
  );
}

function JourneyForm({
  scope,
  accountId,
  openJourney,
  initialAttempt,
}: CreatePageProps & { initialAttempt: JourneyAttempt | null }) {
  const { refresh } = useSessionAccess();
  const [draft, setDraft] = useState(() => journeyDraft(initialAttempt?.input));
  const [attempt, setAttempt] = useState(initialAttempt);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [choices, setChoices] = useState<OffsetChoices>({});
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const pendingFocus = useRef<JourneyField | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (saving || !pendingFocus.current || !errors[pendingFocus.current])
      return;
    document.getElementById(`journey-${pendingFocus.current}`)?.focus();
    pendingFocus.current = null;
  }, [errors, saving]);

  function showErrors(fields: FieldErrors) {
    pendingFocus.current = fieldOrder.find((field) => fields[field]) ?? null;
    setErrors(fields);
  }

  function update(field: JourneyField, value: string) {
    setFeedback("");
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    const resetStart =
      field === "startDate" || field === "startTime" || field === "timeZone";
    const resetEnd =
      field === "endDate" || field === "endTime" || field === "timeZone";
    if (resetStart || resetEnd) {
      setChoices((previous) => ({
        startOffset: resetStart ? undefined : previous.startOffset,
        endOffset: resetEnd ? undefined : previous.endOffset,
      }));
      setErrors((previous) => ({
        ...previous,
        startDate: resetStart ? undefined : previous.startDate,
        startTime: resetStart ? undefined : previous.startTime,
        startOffset: resetStart ? undefined : previous.startOffset,
        endDate: resetEnd ? undefined : previous.endDate,
        endTime: resetEnd || resetStart ? undefined : previous.endTime,
        endOffset: resetEnd ? undefined : previous.endOffset,
      }));
    }
    setDraft((previous) => ({
      ...previous,
      [field]: value,
      startOffset: resetStart
        ? ""
        : field === "startOffset"
          ? value
          : previous.startOffset,
      endOffset: resetEnd
        ? ""
        : field === "endOffset"
          ? value
          : previous.endOffset,
    }));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || scope.signal.aborted) return;
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

    submitting.current = true;
    setSaving(true);
    setFeedback("");
    setErrors({});
    const visible = () => mounted.current && !scope.signal.aborted;
    try {
      if (!submitted && result?.input) {
        const proposal = { key: crypto.randomUUID(), input: result.input };
        submitted = await claimJourneyAttempt(accountId, proposal);
        if (!visible()) return;
        if (!submitted) throw new Error("Missing journey attempt.");
        setAttempt(submitted);
        if (submitted.key !== proposal.key) {
          setDraft(journeyDraft(submitted.input));
          setChoices({});
          return;
        }
      }
      if (!submitted) return;
      const response = await scope.api.POST("/api/v1/journeys", {
        params: { header: { "idempotency-key": submitted.key } },
        body: submitted.input,
      });
      const saved = journeyResult(response, scope, refresh);
      await clearJourneyAttempt(accountId, submitted.key).catch(() => {});
      if (scope.signal.aborted) return;
      void scope.queryClient.invalidateQueries({ queryKey: historyKey(scope) });
      if (visible()) openJourney(saved.id);
    } catch (error) {
      if (!visible()) return;
      if (
        submitted &&
        error instanceof JourneyRequestError &&
        canReleaseJourneyAttempt(error.status, error.issues)
      ) {
        try {
          await clearJourneyAttempt(accountId, submitted.key);
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
        if (!Object.keys(fields.errors).length) {
          setFeedback(
            error.status === 404
              ? "This journey is unavailable."
              : "Couldn’t save this journey. Check the details and try again.",
          );
        }
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

  const locked = attempt !== null || saving;
  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid min-w-0 gap-5 rounded-card control-border bg-card p-4 sm:p-6"
    >
      <FieldGroup>
        <JourneyInput
          field="title"
          label="Title"
          value={draft.title}
          error={errors.title}
          onEdit={update}
          maxLength={120}
          disabled={locked}
          required
        />
        <ScheduleFields
          part="start"
          draft={draft}
          errors={errors}
          choices={choices.startOffset}
          update={update}
          disabled={locked}
        />
        <ScheduleFields
          part="end"
          draft={draft}
          errors={errors}
          choices={choices.endOffset}
          update={update}
          disabled={locked}
        />
        <JourneyInput
          field="timeZone"
          label="Timezone"
          value={draft.timeZone}
          error={errors.timeZone}
          onEdit={update}
          list="journey-timezones"
          autoComplete="off"
          spellCheck={false}
          disabled={locked}
          required
        />
        <datalist id="journey-timezones">
          {[...zones].map((zone) => (
            <option value={zone} key={zone} />
          ))}
        </datalist>
      </FieldGroup>
      {feedback ? (
        <Alert variant="destructive">
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : (
        attempt &&
        !saving && (
          <Alert role="status">
            <AlertDescription>
              Retry your unfinished save using these details.
            </AlertDescription>
          </Alert>
        )
      )}
      {saving && <output className="sr-only">Saving…</output>}
      <div className="grid gap-2">
        <p id="journey-visibility" className="text-sm text-muted-foreground">
          Only you can see this journey when you save it.
        </p>
        <Button
          type="submit"
          className="justify-self-start"
          disabled={saving}
          aria-describedby="journey-visibility"
        >
          {saving ? "Saving…" : attempt ? "Retry save" : "Save journey"}
        </Button>
      </div>
    </form>
  );
}

function JourneyInput({
  field,
  label,
  error,
  onEdit,
  ...props
}: ComponentProps<typeof Input> & {
  field: JourneyField;
  label: string;
  error?: string;
  onEdit: (field: JourneyField, value: string) => void;
}) {
  const id = `journey-${field}`;
  return (
    <Field className="min-w-0" data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onEdit(field, event.currentTarget.value)}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Field>
  );
}

function ScheduleFields({
  part,
  draft,
  errors,
  choices,
  update,
  disabled,
}: {
  part: "start" | "end";
  draft: JourneyDraft;
  errors: FieldErrors;
  choices?: [string, string];
  update: (field: JourneyField, value: string) => void;
  disabled: boolean;
}) {
  const date = `${part}Date` as const;
  const time = `${part}Time` as const;
  const offset = `${part}Offset` as const;
  const label = part === "start" ? "Start" : "End";
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-semibold">
        {part === "start" ? "Intended start" : "Intended end (optional)"}
      </legend>
      <FieldGroup className="sm:grid-cols-2">
        <JourneyInput
          field={date}
          label={`${label} date`}
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          value={draft[date]}
          error={errors[date]}
          onEdit={update}
          disabled={disabled}
          required={part === "start"}
        />
        <JourneyInput
          field={time}
          label={`${label} time`}
          type="time"
          value={draft[time]}
          error={errors[time]}
          onEdit={update}
          disabled={disabled}
          required={part === "start"}
        />
        {(choices || draft[offset]) && (
          <Field
            data-invalid={errors[offset] ? true : undefined}
            className="sm:col-span-2"
          >
            <FieldLabel htmlFor={`journey-${offset}`}>
              {label} time occurrence
            </FieldLabel>
            <select
              id={`journey-${offset}`}
              value={draft[offset]}
              onChange={(event) => update(offset, event.currentTarget.value)}
              disabled={disabled}
              aria-invalid={errors[offset] ? true : undefined}
              aria-describedby={
                errors[offset] ? `journey-${offset}-error` : undefined
              }
              className="min-h-touch w-full min-w-0 rounded-control control-border bg-card px-3 py-2 aria-invalid:border-destructive"
            >
              <option value="">Choose an occurrence</option>
              {choices ? (
                choices.map((choice, index) => (
                  <option value={choice} key={choice}>
                    {index === 0 ? "First" : "Second"} occurrence (UTC{choice})
                  </option>
                ))
              ) : (
                <option value={draft[offset]}>UTC{draft[offset]}</option>
              )}
            </select>
            {errors[offset] && (
              <p
                className="text-sm text-destructive"
                id={`journey-${offset}-error`}
              >
                {errors[offset]}
              </p>
            )}
          </Field>
        )}
      </FieldGroup>
    </fieldset>
  );
}
