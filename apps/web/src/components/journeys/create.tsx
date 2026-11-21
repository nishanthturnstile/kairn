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
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole, Plus, X } from "lucide-react";
import {
  type ComponentProps,
  type SubmitEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import ferry from "../../assets/onboarding-ferry.webp";
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
import { Card, CardContent, CardHeader } from "../ui/card";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { JourneyLoading, JourneyRetry } from "./states";

const zones = new Set(["UTC", ...(Intl.supportedValuesOf?.("timeZone") ?? [])]);

interface CreatePageProps {
  scope: AccountScope;
  accountId: string;
  intent?: OnboardingIntent;
  openJourney: (journeyId: string, invitePeople: boolean) => void;
}

export function CreateJourneyPage(props: CreatePageProps) {
  const pending = useQuery({
    queryKey: [props.accountId, "pending-journey"],
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: () => loadJourneyAttempt(props.accountId),
  });
  return (
    <section className="@container/journey-create mx-auto grid max-w-5xl gap-5">
      <Button asChild variant="ghost" size="sm" className="justify-self-start">
        <Link to="/journeys">
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Back to Journeys
        </Link>
      </Button>
      <PageHeading
        title="Create journey"
        description="Give your journey a name and choose when it starts."
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
  intent,
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
  const [addingEnd, setAddingEnd] = useState(false);
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
    const invitePeople =
      event.nativeEvent.submitter?.getAttribute("value") === "invite";
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
          setAddingEnd(false);
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
      if (visible()) openJourney(saved.id, invitePeople);
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

  function toggleEnd() {
    if (hasEnd) {
      update("endDate", "");
      update("endTime", "");
    }
    setAddingEnd(!hasEnd);
  }

  return (
    <div className="grid max-w-2xl items-start gap-5 @min-[52rem]/journey-create:max-w-none @min-[52rem]/journey-create:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="@container/journey-form grid min-w-0 rounded-card control-border bg-card"
      >
        <FieldGroup className="gap-5 p-4 @min-[28rem]/journey-form:p-6">
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
          <JourneyInput
            field="title"
            label="Title"
            placeholder="e.g. A weekend in Coorg"
            value={draft.title}
            error={errors.title}
            onEdit={update}
            maxLength={120}
            disabled={locked}
            required
          />
          <section
            aria-labelledby="journey-schedule"
            className="grid gap-4 border-t pt-5"
          >
            <div className="grid gap-1">
              <h2 id="journey-schedule" className="text-xl font-semibold">
                Schedule
              </h2>
              <p className="text-sm text-muted-foreground">
                {intent
                  ? journeyIntentCopy[intent].guidance
                  : "Enter the dates and times in the journey’s local time."}
              </p>
            </div>
            <ScheduleFields
              part="start"
              draft={draft}
              errors={errors}
              choices={choices.startOffset}
              update={update}
              disabled={locked}
            />
            {(!locked || hasEnd) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                aria-expanded={hasEnd}
                aria-controls="journey-end-fields"
                disabled={locked}
                onClick={toggleEnd}
              >
                {hasEnd ? (
                  <X aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Plus aria-hidden="true" data-icon="inline-start" />
                )}
                {hasEnd ? "Remove end date" : "Add end date"}
              </Button>
            )}
            <div id="journey-end-fields" hidden={!hasEnd}>
              <ScheduleFields
                part="end"
                draft={draft}
                errors={errors}
                choices={choices.endOffset}
                update={update}
                disabled={locked}
              />
            </div>
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
          </section>
        </FieldGroup>
        {saving && <output className="sr-only">Saving…</output>}
        <div className="grid items-center gap-3 rounded-b-card border-t bg-background p-4 @min-[28rem]/journey-form:px-6">
          <p
            id="journey-visibility"
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <LockKeyhole
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>Only you can see this journey when you save it.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={saving}
              aria-describedby="journey-visibility"
            >
              {saving ? "Saving…" : attempt ? "Retry save" : "Save journey"}
            </Button>
            <Button
              type="submit"
              value="invite"
              variant="outline"
              disabled={saving}
            >
              {attempt
                ? "Retry save & invite people"
                : "Create & invite people"}
            </Button>
          </div>
        </div>
      </form>
      <JourneyPreview draft={draft} hasEnd={hasEnd} />
    </div>
  );
}

function JourneyPreview({
  draft,
  hasEnd,
}: {
  draft: JourneyDraft;
  hasEnd: boolean;
}) {
  return (
    <aside
      aria-labelledby="journey-preview"
      className="hidden min-w-0 @min-[52rem]/journey-create:block"
    >
      <Card className="gap-0 overflow-hidden py-0">
        <img
          src={ferry}
          alt=""
          loading="lazy"
          width={1152}
          height={864}
          className="aspect-[2/1] w-full object-cover object-[50%_58%]"
        />
        <CardHeader className="gap-1 bg-muted pt-5 pb-3">
          <h2 id="journey-preview" className="font-semibold">
            Journey preview
          </h2>
          <p className="text-xl font-semibold wrap-anywhere">
            {draft.title.trim() || "Untitled journey"}
          </p>
        </CardHeader>
        <CardContent className="bg-muted pb-5">
          <dl className="grid gap-2 border-t border-border/50 pt-3 text-sm">
            <div>
              <dt className="font-semibold">Start</dt>
              <dd className="text-muted-foreground">
                {previewMinute(draft.startDate, draft.startTime) ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">End</dt>
              <dd className="text-muted-foreground">
                {previewMinute(draft.endDate, draft.endTime) ??
                  (hasEnd ? "Not set" : "Open-ended")}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Timezone</dt>
              <dd className="text-muted-foreground wrap-anywhere">
                {draft.timeZone.trim() || "Not set"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </aside>
  );
}

function previewMinute(date: string, time: string) {
  if (!date || !time) return null;
  const local = `${date}T${time}`;
  if (!Number.isFinite(Date.parse(`${local}Z`))) return null;
  const display = formatJourneyLocalMinute(local);
  return (
    <time dateTime={local}>
      {display.date} · {display.time}
    </time>
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
      <legend className="sr-only">
        {part === "start" ? "Start" : "End (optional)"}
      </legend>
      <FieldGroup className="@min-[25rem]/journey-form:grid-cols-2">
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
            className="@min-[25rem]/journey-form:col-span-2"
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
