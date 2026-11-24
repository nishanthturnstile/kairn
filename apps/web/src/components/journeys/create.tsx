import type { OnboardingIntent } from "@kairn/contracts";
import {
  canReleaseJourneyAttempt,
  type FieldErrors,
  fieldOrder,
  isCalendarDate,
  isClockTime,
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
import {
  ArrowLeft,
  FilePenLine,
  LockKeyhole,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { gpxJourneyCreation } from "@/lib/journey-creation";
import { useRecordingImports } from "@/lib/recording-api";
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
import { Alert, AlertDescription } from "../ui/alert";
import { Button, ButtonLink } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { FieldGroup } from "../ui/field";
import { hasPendingBatchSave, useBatchSaveEntryKey } from "./batch-commit";
import { JourneyFlow } from "./flow";
import { ResumeRecordingImport } from "./resume-recording-import";
import { JourneyInput, ScheduleFields } from "./schedule-fields";
import { StageRecordings } from "./stage-recordings";
import { JourneyLoading, JourneyRetry } from "./states";

const zones = new Set(["UTC", ...(Intl.supportedValuesOf?.("timeZone") ?? [])]);

interface CreatePageProps {
  scope: AccountScope;
  accountId: string;
  intent?: OnboardingIntent;
  openJourney: (journeyId: string, invitePeople: boolean) => void;
}

type CreationMode = "gpx" | "details";

export function CreateJourneyPage(props: CreatePageProps) {
  const pending = usePendingDetails(props.accountId);
  const entryKey = useBatchSaveEntryKey();
  const [batchSavePending, setBatchSavePending] = useState(
    () => gpxJourneyCreation && hasPendingBatchSave(props.scope, entryKey),
  );
  const [mode, setMode] = useState<CreationMode>(() =>
    !batchSavePending && props.intent === "plan" ? "details" : "gpx",
  );
  const [openedDetails, setOpenedDetails] = useState(mode === "details");
  const [planningBusy, setPlanningBusy] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const gpxPanel = useRef<HTMLElement>(null);
  const detailsPanel = useRef<HTMLElement>(null);
  const focusMode = useRef<CreationMode | null>(null);
  const imports = useRecordingImports(props.scope, gpxJourneyCreation);
  const recoveringDetails = Boolean(pending.data && !batchSavePending);
  const activeMode = recoveringDetails ? "details" : mode;
  const canChooseMethod =
    gpxJourneyCreation && pending.isFetchedAfterMount && pending.isSuccess;
  const enteringDetails = activeMode === "gpx";
  useEffect(() => {
    if (!recoveringDetails) return;
    setMode("details");
    setOpenedDetails(true);
  }, [recoveringDetails]);
  useEffect(() => {
    if (focusMode.current !== activeMode) return;
    focusMode.current = null;
    const target =
      activeMode === "gpx"
        ? (chooseButton.current ?? gpxPanel.current)
        : detailsPanel.current;
    target?.focus();
  }, [activeMode]);

  function switchTo(next: CreationMode) {
    focusMode.current = next;
    if (next === "details") setOpenedDetails(true);
    setMode(next);
  }

  return (
    <JourneyFlow
      title={gpxJourneyCreation ? "Create a journey" : "Create journey"}
      description={
        gpxJourneyCreation
          ? undefined
          : "Give your journey a name and set its local schedule."
      }
      back={
        <ButtonLink
          render={<Link to="/journeys" />}
          variant="ghost"
          size="sm"
          className="min-h-touch justify-self-start px-0"
        >
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Back to Journeys
        </ButtonLink>
      }
      action={
        canChooseMethod && (
          <Button
            type="button"
            variant="outline"
            disabled={
              enteringDetails
                ? batchSavePending || transferring
                : recoveringDetails || planningBusy
            }
            onClick={() => switchTo(enteringDetails ? "details" : "gpx")}
          >
            {enteringDetails ? (
              <FilePenLine aria-hidden="true" data-icon="inline-start" />
            ) : (
              <Upload aria-hidden="true" data-icon="inline-start" />
            )}
            {enteringDetails
              ? "Enter details without GPX"
              : "Back to GPX upload"}
          </Button>
        )
      }
    >
      {canChooseMethod ? (
        <>
          <section
            ref={gpxPanel}
            aria-label="Create from GPX files"
            tabIndex={-1}
            hidden={activeMode !== "gpx"}
          >
            <div className="grid min-w-0 gap-3">
              <StageRecordings
                scope={props.scope}
                chooseButton={chooseButton}
                visible={activeMode === "gpx"}
                onSavePendingChange={setBatchSavePending}
                onTransferChange={setTransferring}
              />
              {!batchSavePending && (
                <ResumeRecordingImport
                  scope={props.scope}
                  imports={imports.data}
                />
              )}
            </div>
          </section>
          <section
            ref={detailsPanel}
            aria-label="Enter journey details"
            tabIndex={-1}
            hidden={activeMode !== "details"}
          >
            {(openedDetails || recoveringDetails) && (
              <JourneyPlanning
                {...props}
                pending={pending}
                onSavingChange={setPlanningBusy}
              />
            )}
          </section>
        </>
      ) : (
        <JourneyPlanning {...props} pending={pending} />
      )}
    </JourneyFlow>
  );
}

type PlanningProps = CreatePageProps & {
  onSavingChange?: (saving: boolean) => void;
};

function usePendingDetails(accountId: string) {
  return useQuery({
    queryKey: [accountId, "pending-journey"],
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: () => loadJourneyAttempt(accountId),
  });
}

function JourneyPlanning({
  pending,
  ...props
}: PlanningProps & { pending: ReturnType<typeof usePendingDetails> }) {
  if (pending.isError)
    return (
      <JourneyRetry
        title="Couldn’t recover your saved attempt"
        busy={pending.isFetching}
        retry={() => void pending.refetch()}
      />
    );
  if (!pending.isFetchedAfterMount || pending.isPending)
    return <JourneyLoading label="Checking for an unfinished save" />;
  return <JourneyForm {...props} initialAttempt={pending.data} />;
}

function JourneyForm({
  scope,
  accountId,
  intent,
  openJourney,
  initialAttempt,
  onSavingChange,
}: PlanningProps & { initialAttempt: JourneyAttempt | null }) {
  const { refresh } = useSessionAccess();
  const [draft, setDraft] = useState(() => journeyDraft(initialAttempt?.input));
  const [attempt, setAttempt] = useState(initialAttempt);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [choices, setChoices] = useState<OffsetChoices>({});
  const [feedback, setFeedback] = useState("");
  const [savingAction, setSavingAction] = useState<{
    destination: "journey" | "invite";
    retry: boolean;
  } | null>(null);
  const saving = savingAction !== null;
  const retrying = savingAction?.retry ?? attempt !== null;
  const savingJourney = savingAction?.destination === "journey";
  const savingInvitation = savingAction?.destination === "invite";
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
    onSavingChange?.(saving || attempt !== null);
  }, [attempt, onSavingChange, saving]);
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
    onSavingChange?.(true);
    setSavingAction({
      destination: invitePeople ? "invite" : "journey",
      retry: submitted !== null,
    });
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
        scope.queryClient.setQueryData([accountId, "pending-journey"], null);
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
      if (visible()) {
        setSavingAction(null);
      }
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
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="journey-flow-grid"
    >
      <div className="@container/journey-form grid min-w-0 gap-4 rounded-card control-border bg-card p-3 sm:p-5">
        {attempt && !saving && !feedback && (
          <Alert role="status">
            <AlertDescription>
              Retry your unfinished save using these details.
            </AlertDescription>
          </Alert>
        )}
        <section
          aria-labelledby="journey-details-heading"
          className="grid min-w-0 gap-3"
        >
          <h2 id="journey-details-heading" className="text-xl font-bold">
            Journey details
          </h2>
          <FieldGroup>
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
          </FieldGroup>
        </section>
        <section
          aria-label="Schedule"
          className="grid min-w-0 gap-4 border-t border-border pt-4"
        >
          <div className="grid gap-1">
            <h2 className="text-xl font-bold">Schedule</h2>
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
              className="min-h-touch justify-self-start"
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
            {hasEnd && (
              <ScheduleFields
                part="end"
                draft={draft}
                errors={errors}
                choices={choices.endOffset}
                update={update}
                disabled={locked}
              />
            )}
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
      </div>
      <div className="grid min-w-0 gap-3 border-t border-border pt-4">
        {feedback && (
          <Alert variant="destructive">
            <AlertDescription>{feedback}</AlertDescription>
          </Alert>
        )}
        {saving && <output className="sr-only">Saving journey…</output>}
        <p
          id="journey-visibility"
          className="flex items-start gap-2 text-sm text-muted-foreground"
        >
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>Only you can see this journey when you save it.</span>
        </p>
        <div className="grid gap-2 @min-[29rem]/journey-flow:flex @min-[29rem]/journey-flow:flex-wrap">
          <Button
            type="submit"
            size="lg"
            disabled={saving}
            focusableWhenDisabled
            feedback={savingJourney ? "pending" : "idle"}
            aria-describedby="journey-visibility"
          >
            {savingJourney
              ? "Saving…"
              : retrying
                ? "Retry save"
                : "Save journey"}
          </Button>
          <Button
            type="submit"
            value="invite"
            variant="outline"
            size="lg"
            disabled={saving}
            focusableWhenDisabled
            feedback={savingInvitation ? "pending" : "idle"}
            aria-describedby="journey-visibility"
          >
            {savingInvitation
              ? "Saving before invitations…"
              : retrying
                ? "Retry save & invite people"
                : "Create & invite people"}
          </Button>
        </div>
      </div>
      <JourneyPreview draft={draft} hasEnd={hasEnd} />
    </form>
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
      className="journey-flow-preview min-w-0"
    >
      <Card className="control-border bg-accent [--card-spacing:--spacing(4)]">
        <CardHeader className="gap-2">
          <h2
            id="journey-preview"
            className="font-semibold text-muted-foreground"
          >
            Journey preview
          </h2>
          <p className="wrap-anywhere text-xl font-bold">
            {draft.title.trim() || "Untitled journey"}
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid divide-y divide-border border-t border-border text-sm">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2.5">
              <dt className="text-muted-foreground">Start</dt>
              <dd className="font-semibold">
                {previewMinute(draft.startDate, draft.startTime) ?? "Not set"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2.5">
              <dt className="text-muted-foreground">End</dt>
              <dd className="font-semibold">
                {previewMinute(draft.endDate, draft.endTime) ??
                  (hasEnd ? "Not set" : "Open-ended")}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 pt-2.5">
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="wrap-anywhere font-semibold">
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
  if (!isCalendarDate(date) || !isClockTime(time)) return null;
  const local = `${date}T${time}`;
  const display = formatJourneyLocalMinute(local);
  return (
    <time dateTime={local}>
      {display.date} · {display.time}
    </time>
  );
}
