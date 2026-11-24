import type {
  CommitRecordingImport,
  RecordingCommit,
  RecordingImport,
  RecordingSelection,
} from "@kairn/contracts/recordings";
import {
  type FieldErrors,
  fieldOrder,
  type JourneyField,
  journeyDraft,
  journeyFormIssues,
  type OffsetChoices,
  validateJourneyDraft,
} from "@kairn/shared/journey-form";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { recordingLocalMinute } from "@kairn/shared/recording-time";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { JourneyRequestError, journeyResult } from "@/lib/journey-api";
import {
  claimRecordingCommit,
  clearRecordingCommit,
  readRecordingCommit,
} from "@/lib/recording-draft";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { JourneyInput, ScheduleFields } from "../journeys/schedule-fields";
import { JourneyLoading, JourneyRetry } from "../journeys/states";
import { RecordingClock } from "./clock";
import { RecordingMap } from "./map";
import { RecordingSections, SectionPagination } from "./sections";

const panel =
  "grid min-w-0 gap-4 rounded-card control-border bg-card p-4 sm:p-5";
const localZones = ["UTC", ...(Intl.supportedValuesOf?.("timeZone") ?? [])];
type CommitScope = CommitRecordingImport["scope"];
const reviewKey = (scope: AccountScope, id: string) => [
  scope.accountId,
  "recording-review",
  id,
];

export function RecordingReview({
  scope,
  accountId,
  entry,
  initialJourney,
  fixedJourney,
  onComplete,
  onChooseAnother,
  editOnly = false,
}: {
  scope: AccountScope;
  accountId: string;
  entry: RecordingImport;
  initialJourney?: string;
  fixedJourney?: string;
  onComplete: (result: RecordingCommit) => void;
  onChooseAnother: () => void;
  editOnly?: boolean;
}) {
  const { refresh } = useSessionAccess();
  const review = useQuery({
    queryKey: reviewKey(scope, entry.id),
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/review", {
          params: { path: { id: entry.id } },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  const pending = useQuery({
    queryKey: [accountId, "recording-commit-attempt", entry.id],
    enabled: !editOnly,
    refetchOnMount: "always",
    queryFn: async () =>
      (await readRecordingCommit(accountId, entry.id)) ?? null,
  });
  if (!editOnly && pending.isError)
    return (
      <JourneyRetry
        title="Couldn’t read the pending save on this device"
        busy={pending.isFetching}
        retry={() => void pending.refetch()}
      />
    );
  if (review.isError)
    return (
      <JourneyRetry
        title="Couldn’t load the recording review"
        busy={review.isFetching}
        retry={() => void review.refetch()}
      />
    );
  if (
    !review.data ||
    (!editOnly && (!pending.isFetchedAfterMount || pending.data === undefined))
  )
    return <JourneyLoading label="Loading recording review" />;
  return (
    <ReviewForm
      scope={scope}
      accountId={accountId}
      entry={entry}
      initialJourney={initialJourney}
      fixedJourney={fixedJourney}
      onComplete={onComplete}
      onChooseAnother={onChooseAnother}
      initialAttempt={editOnly ? null : (pending.data ?? null)}
      editOnly={editOnly}
    />
  );
}

function ReviewForm({
  scope,
  accountId,
  entry,
  initialJourney,
  fixedJourney,
  onComplete,
  onChooseAnother,
  initialAttempt,
  editOnly,
}: {
  scope: AccountScope;
  accountId: string;
  entry: RecordingImport;
  initialJourney?: string;
  fixedJourney?: string;
  onComplete: (result: RecordingCommit) => void;
  onChooseAnother: () => void;
  initialAttempt: CommitRecordingImport | null;
  editOnly: boolean;
}) {
  const { refresh } = useSessionAccess();
  const request = useRef<AbortController>(null);
  const destinationPin = useRef<Extract<
    CommitRecordingImport["destination"],
    { kind: "existing" }
  > | null>(null);
  const recordingHeading = useRef<HTMLHeadingElement>(null);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(initialAttempt);
  const [busy, setBusy] = useState<"review" | "save">();
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [choices, setChoices] = useState<OffsetChoices>({});
  const [draft, setDraft] = useState(() =>
    journeyDraft(
      initialAttempt?.destination.kind === "new"
        ? initialAttempt.destination.journey
        : undefined,
    ),
  );
  const [showEnd, setShowEnd] = useState(
    Boolean(draft.endDate || draft.endTime),
  );
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const initTarget =
    fixedJourney ??
    (initialAttempt?.destination.kind === "existing"
      ? initialAttempt.destination.journeyId
      : initialJourney);
  const [existing, setExisting] = useState(Boolean(initTarget));
  const [selectedTarget, setSelectedTarget] = useState(initTarget ?? "");
  const [audience, setAudience] = useState<CommitScope>(
    initialAttempt?.scope ?? "only_me",
  );
  const [placement, setPlacement] = useState(
    initialAttempt?.placeInDraft ?? false,
  );
  const [selectedSection, setSelectedSection] = useState<number>();
  const [suggestedTitle, setSuggestedTitle] = useState(false);
  const conflictingAttempt = Boolean(attempt && !matchesDestination(attempt));
  const locked = Boolean(attempt) || busy === "save";

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    recordingHeading.current?.focus({ preventScroll: true });
  }, []);
  const review = useQuery({
    queryKey: reviewKey(scope, entry.id),
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/review", {
          params: { path: { id: entry.id } },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  const cursor = cursors.at(-1);
  const sections = useQuery({
    placeholderData: keepPreviousData,
    queryKey: [
      accountId,
      "recording-sections",
      entry.id,
      review.data?.revision,
      cursor,
    ],
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/segments", {
          params: { path: { id: entry.id }, query: { cursor } },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  const journeys = useInfiniteQuery({
    queryKey: [accountId, "recording-destinations"],
    enabled: existing && !fixedJourney,
    refetchInterval: 30_000,
    staleTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/recording-attachment-destinations", {
          params: { query: { cursor: pageParam } },
          signal,
        }),
        scope,
        refresh,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const journeyId = fixedJourney ?? selectedTarget;
  const picked = useQuery({
    queryKey: [accountId, "recording-destination", entry.id, journeyId],
    enabled: existing && Boolean(journeyId) && !conflictingAttempt,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(
          "/api/v1/recording-attachment-destinations/{journeyId}",
          {
            params: {
              path: { journeyId },
              query: { importId: entry.id },
            },
            signal,
          },
        ),
        scope,
        refresh,
      ),
    staleTime: 0,
  });
  const target =
    picked.isError || picked.isFetching || picked.isPaused
      ? undefined
      : picked.data;
  const page = sections.data;

  useEffect(() => {
    if (existing && target?.grantRevision != null && !destinationPin.current) {
      destinationPin.current = {
        kind: "existing",
        journeyId: target.id,
        membershipGeneration: target.membershipGeneration,
        grantRevision: target.grantRevision,
      };
    }
  }, [existing, target]);

  function resetSharing() {
    destinationPin.current = null;
    setAudience("only_me");
    setPlacement(false);
  }

  function matchesDestination(command: CommitRecordingImport) {
    return (
      !fixedJourney ||
      (command.destination.kind === "existing" &&
        command.destination.journeyId === fixedJourney)
    );
  }

  function destinationChanged(message: string) {
    resetSharing();
    if (fixedJourney) {
      void picked.refetch();
      setNotice(
        "Journey access changed. Review who can see this recording before saving again.",
      );
      detailsHeading.current?.focus();
    } else {
      setSelectedTarget("");
      setNotice(message);
      document.getElementById("recording-existing-journey")?.focus();
    }
  }

  useEffect(() => {
    const guess = page?.sections[0]?.trackName;
    if (guess && !suggestedTitle && !draft.title && !attempt) {
      setDraft((current) => ({ ...current, title: guess.slice(0, 120) }));
      setSuggestedTitle(true);
    }
  }, [page, suggestedTitle, draft.title, attempt]);

  function updateField(field: JourneyField, value: string) {
    setNotice("");
    if (field === "title") setSuggestedTitle(true);
    const resetStart =
      field === "startDate" || field === "startTime" || field === "timeZone";
    const resetEnd =
      field === "endDate" || field === "endTime" || field === "timeZone";
    setDraft((previous) => ({
      ...previous,
      [field]: value,
      ...(resetStart && { startOffset: "" }),
      ...(resetEnd && { endOffset: "" }),
    }));
    setChoices((previous) => ({
      startOffset: resetStart ? undefined : previous.startOffset,
      endOffset: resetEnd ? undefined : previous.endOffset,
    }));
    setErrors({});
  }

  function showErrors(next: FieldErrors) {
    setErrors(next);
    const first = fieldOrder.find((field) => next[field]);
    if (first)
      requestAnimationFrame(() =>
        document.getElementById(`journey-${first}`)?.focus(),
      );
  }

  function start(kind: "review" | "save") {
    if (request.current) return;
    request.current = new AbortController();
    setBusy(kind);
    setNotice("");
    return AbortSignal.any([scope.signal, request.current.signal]);
  }

  function finish() {
    request.current = null;
    if (!scope.signal.aborted) setBusy(undefined);
  }

  async function changeSelection(selection: RecordingSelection) {
    if (locked || !review.data) return;
    const signal = start("review");
    if (!signal) return;
    try {
      const updated = journeyResult(
        await scope.api.PATCH("/api/v1/imports/{id}/review", {
          params: { path: { id: entry.id } },
          body: { revision: review.data.revision, selection },
          signal,
        }),
        scope,
        refresh,
      );
      scope.queryClient.setQueryData(reviewKey(scope, entry.id), updated);
      if (editOnly) {
        void scope.queryClient.invalidateQueries({
          queryKey: [accountId, "owner-recording-sections"],
        });
      }
      setNotice("Recording review updated.");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof JourneyRequestError && error.status === 412) {
        await review.refetch();
        setNotice(
          "This review changed elsewhere. Check the latest selection and apply your change again.",
        );
      } else if (error instanceof JourneyRequestError && error.status === 400) {
        setNotice(
          "Keep at least one continuous section with two or more samples.",
        );
      } else {
        setNotice("Couldn’t confirm that change. Try again.");
        await review.refetch();
      }
    } finally {
      finish();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editOnly || !review.data || conflictingAttempt) return;
    let command = attempt;
    if (!command) {
      let destination: CommitRecordingImport["destination"];
      if (existing) {
        const pin = destinationPin.current;
        if (!target || !pin || pin.journeyId !== target.id) {
          if (fixedJourney) {
            setNotice("Check access to this journey before saving.");
            detailsHeading.current?.focus();
          } else {
            setNotice("Choose an available journey.");
            document.getElementById("recording-existing-journey")?.focus();
          }
          return;
        }
        if (
          pin.membershipGeneration !== target.membershipGeneration ||
          pin.grantRevision !== target.grantRevision
        ) {
          destinationChanged(
            "The destination changed. Choose an available journey again.",
          );
          return;
        }
        destination = pin;
      } else {
        const checked = validateJourneyDraft(draft);
        if (!checked.input) {
          showErrors(checked.errors);
          return;
        }
        destination = { kind: "new", journey: checked.input };
      }
      command = {
        protocolVersion: 1,
        deviceId: crypto.randomUUID(),
        commandId: crypto.randomUUID(),
        reviewRevision: review.data.revision,
        destination,
        scope: audience,
        placeInDraft:
          audience === "journey_review" &&
          (!existing || Boolean(target?.canPlace)) &&
          placement,
      };
    }
    const signal = start("save");
    if (!signal) return;
    let stored: CommitRecordingImport | undefined;
    try {
      stored = await claimRecordingCommit(accountId, entry.id, command);
      signal.throwIfAborted();
      setAttempt(stored);
      if (!matchesDestination(stored)) return;
      if (stored.commandId !== command.commandId) {
        setAudience(stored.scope);
        setPlacement(stored.placeInDraft);
        setExisting(stored.destination.kind === "existing");
        if (stored.destination.kind === "existing")
          setSelectedTarget(stored.destination.journeyId);
        else {
          const previous = journeyDraft(stored.destination.journey);
          setDraft(previous);
          setShowEnd(Boolean(previous.endDate || previous.endTime));
        }
        setNotice(
          "A save is pending in another window. Review these saved details before retrying.",
        );
        return;
      }
      const result = journeyResult(
        await scope.api.POST("/api/v1/imports/{id}/commit", {
          params: { path: { id: entry.id } },
          body: stored,
          signal,
        }),
        scope,
        refresh,
      );
      await clearRecordingCommit(accountId, entry.id, stored.commandId);
      signal.throwIfAborted();
      onComplete(result);
    } catch (error) {
      if (signal.aborted) return;
      if (
        error instanceof JourneyRequestError &&
        error.status === 409 &&
        error.code !== "account_changed" &&
        stored
      ) {
        try {
          const recovered = await scope.api.GET("/api/v1/imports/{id}/result", {
            params: { path: { id: entry.id } },
            signal,
          });
          if (recovered.data) {
            await clearRecordingCommit(accountId, entry.id, stored.commandId);
            signal.throwIfAborted();
            onComplete(recovered.data);
            return;
          }
          if (recovered.response.status === 404) {
            await clearRecordingCommit(accountId, entry.id, stored.commandId);
            setAttempt(null);
            if (existing)
              destinationChanged(
                "This save conflicts with a previous change. Choose your destination again.",
              );
            else
              setNotice(
                "This save conflicts with a previous change. Review the journey details and try again.",
              );
            return;
          }
        } catch {
          if (signal.aborted) return;
        }
      }

      if (
        error instanceof JourneyRequestError &&
        error.code !== "account_changed" &&
        [400, 404, 412].includes(error.status) &&
        stored
      ) {
        await clearRecordingCommit(accountId, entry.id, stored.commandId).catch(
          () => {},
        );
        setAttempt(null);
        if (error.status === 400 && error.issues.length > 0) {
          const fields = journeyFormIssues(error.issues);
          setChoices(fields.choices);
          showErrors(fields.errors);
        } else if (
          error.status === 412 &&
          error.code === "recording_review_changed"
        ) {
          await review.refetch();
          setNotice(
            "The recording review changed. Check the latest selection before saving.",
          );
        } else if (existing) {
          destinationChanged(
            "The destination changed. Choose an available journey again.",
          );
        } else
          setNotice("Check the recording and journey details before saving.");
      } else {
        setNotice(
          stored
            ? "We couldn’t confirm the save. Retry with the same details."
            : "Couldn’t store the save attempt on this device.",
        );
      }
    } finally {
      finish();
    }
  }

  const window = review.data?.summary.recordedWindow ?? null;
  const schedule = target?.schedule;
  const outside = Boolean(
    window &&
      schedule &&
      (Date.parse(window.start) < Date.parse(schedule.intendedStart.instant) ||
        (schedule.intendedEnd &&
          Date.parse(window.end) > Date.parse(schedule.intendedEnd.instant))),
  );
  const selection = review.data?.selection;
  const stats = entry.diagnostics;
  const options =
    journeys.isError || journeys.isFetching || journeys.isPaused
      ? []
      : (journeys.data?.pages.flatMap((data) => data.journeys) ?? []);
  const nextCursor = page?.nextCursor ?? null;
  const targetSchedule = target && (
    <div className="grid gap-1 text-sm">
      <p className="font-semibold wrap-anywhere">{target.title}</p>
      <p className="text-muted-foreground">
        {schedule
          ? `${formatJourneyLocalMinute(schedule.intendedStart.local).date} · ${schedule.timeZone}`
          : "Dates unavailable"}
      </p>
      {outside && (
        <Alert variant="warning">
          <AlertDescription>
            Part of this recording is outside the journey’s schedule. You can
            still add it.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
  if (conflictingAttempt)
    return (
      <div className="grid justify-items-start gap-3">
        <Alert>
          <AlertDescription>
            This import has a pending save for another destination. You can
            recover it from Resume import.
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={onChooseAnother}>
          Choose another file
        </Button>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className={fixedJourney ? "grid min-w-0 gap-4" : "journey-flow-grid"}
    >
      <section
        className={fixedJourney ? "grid min-w-0 gap-4" : panel}
        aria-labelledby="recording-inspection"
      >
        <div className="grid gap-1">
          <h2
            ref={recordingHeading}
            tabIndex={-1}
            id="recording-inspection"
            className="text-2xl font-bold"
          >
            {editOnly ? "Edit saved recording" : "Review recording"}
          </h2>
          <p className="font-semibold wrap-anywhere">{entry.fileName}</p>
          <p className="text-sm text-muted-foreground">
            {review.data?.summary.sectionCount ?? entry.sectionCount} selected
            sections. Paths between separate sections are unknown.
          </p>
          {review.data?.summary.distanceMetres != null && (
            <p className="text-sm">
              <strong>Recorded distance</strong>{" "}
              {new Intl.NumberFormat(undefined, {
                maximumFractionDigits: 2,
              }).format(review.data.summary.distanceMetres / 1000)}{" "}
              km
            </p>
          )}
          {stats &&
            (stats.invalidCoordinates > 0 ||
              stats.ignoredRoutes > 0 ||
              stats.ignoredWaypoints > 0) && (
              <p className="text-sm text-muted-foreground">
                {stats.invalidCoordinates} invalid coordinates skipped.{" "}
                {stats.ignoredRoutes} planned routes and{" "}
                {stats.ignoredWaypoints} standalone waypoints ignored.
              </p>
            )}
        </div>
        {selection && (
          <RecordingClock
            selection={selection}
            disabled={Boolean(busy) || locked}
            change={(value) => void changeSelection(value)}
          />
        )}
        {sections.isError ? (
          <JourneyRetry
            title="Couldn’t load recorded sections"
            busy={sections.isFetching}
            retry={() => void sections.refetch()}
          />
        ) : page ? (
          <>
            {page.sections.length > 0 && (
              <RecordingMap
                scope={scope}
                subject={{ id: entry.id, revision: review.data?.revision }}
                cursor={cursor}
                through={page.sections[page.sections.length - 1].ordinal}
                selected={selectedSection}
                select={setSelectedSection}
              />
            )}
            <RecordingSections
              mapSelection={{
                selected: selectedSection,
                select: setSelectedSection,
              }}
              sections={page.sections}
              editing={
                selection
                  ? {
                      scope,
                      id: entry.id,
                      selection,
                      disabled: Boolean(busy) || locked,
                      onChange: (change) => void changeSelection(change),
                    }
                  : undefined
              }
            />
            <SectionPagination
              previous={
                cursors.length > 1
                  ? () => setCursors((current) => current.slice(0, -1))
                  : undefined
              }
              next={
                nextCursor === null
                  ? undefined
                  : () => setCursors((current) => [...current, nextCursor])
              }
            />
          </>
        ) : (
          <JourneyLoading label="Loading recorded sections" />
        )}
      </section>
      {editOnly ? (
        notice && (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )
      ) : (
        <div className="grid min-w-0 gap-4">
          <section className={panel} aria-labelledby="recording-destination">
            <h2
              ref={detailsHeading}
              id="recording-destination"
              tabIndex={fixedJourney ? -1 : undefined}
              className="text-xl font-bold"
            >
              {fixedJourney ? "Journey" : "Journey details"}
            </h2>
            <FieldGroup>
              {!fixedJourney && (
                <Field>
                  <FieldLabel htmlFor="recording-destination-kind">
                    Destination
                  </FieldLabel>
                  <NativeSelect
                    id="recording-destination-kind"
                    value={existing ? "existing" : "new"}
                    disabled={locked}
                    onChange={(event) => {
                      setExisting(event.currentTarget.value === "existing");
                      resetSharing();
                    }}
                  >
                    <option value="new">New journey</option>
                    <option value="existing">Existing journey</option>
                  </NativeSelect>
                </Field>
              )}
              {fixedJourney ? (
                <>
                  {targetSchedule}
                  {picked.isError ? (
                    <JourneyRetry
                      title="This journey is unavailable for adding recordings"
                      busy={picked.isFetching}
                      retry={() => void picked.refetch()}
                    />
                  ) : (
                    !target && (
                      <JourneyLoading label="Checking journey access" />
                    )
                  )}
                </>
              ) : existing ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="recording-existing-journey">
                      Choose journey
                    </FieldLabel>
                    <NativeSelect
                      id="recording-existing-journey"
                      value={selectedTarget}
                      disabled={locked}
                      onChange={(event) => {
                        setSelectedTarget(event.currentTarget.value);
                        resetSharing();
                      }}
                    >
                      <option value="">Choose an eligible journey</option>
                      {target &&
                        !options.some(({ id }) => id === target.id) && (
                          <option value={target.id}>{target.title}</option>
                        )}
                      {options.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {journeys.hasNextPage && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={journeys.isFetchingNextPage}
                      onClick={() => void journeys.fetchNextPage()}
                    >
                      More journeys
                    </Button>
                  )}
                  {journeys.isError && (
                    <JourneyRetry
                      title="Couldn’t load eligible journeys"
                      busy={journeys.isFetching}
                      retry={() => void journeys.refetch()}
                    />
                  )}
                  {picked.isError && (
                    <Alert>
                      <AlertDescription>
                        This journey is unavailable. Choose another journey or
                        create a new one.
                      </AlertDescription>
                    </Alert>
                  )}
                  {targetSchedule}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Include the whole trip, including approach or return days.
                    Members can see the confirmed title and schedule.
                  </p>
                  <JourneyInput
                    field="title"
                    label="Title"
                    value={draft.title}
                    error={errors.title}
                    maxLength={120}
                    required
                    disabled={locked}
                    onEdit={updateField}
                  />
                  {window && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={locked}
                      className="justify-self-start"
                      onClick={() => {
                        try {
                          const [startDate, startTime] = recordingLocalMinute(
                            window.start,
                            draft.timeZone,
                          ).split("T");
                          const [endDate, endTime] = recordingLocalMinute(
                            window.end,
                            draft.timeZone,
                          ).split("T");
                          setDraft((current) => ({
                            ...current,
                            startDate,
                            startTime,
                            endDate,
                            endTime,
                            startOffset: "",
                            endOffset: "",
                          }));
                          setErrors({});
                          setChoices({});
                          setShowEnd(true);
                        } catch {
                          showErrors({
                            timeZone: "Enter a valid IANA time zone.",
                          });
                        }
                      }}
                    >
                      Use recorded times
                    </Button>
                  )}
                  <div className="@container/journey-form grid gap-3">
                    <ScheduleFields
                      part="start"
                      draft={draft}
                      errors={errors}
                      choices={choices.startOffset}
                      update={updateField}
                      disabled={locked}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      disabled={locked}
                      onClick={() => {
                        if (showEnd)
                          setDraft((current) => ({
                            ...current,
                            endDate: "",
                            endTime: "",
                            endOffset: "",
                          }));
                        setShowEnd(!showEnd);
                      }}
                    >
                      {showEnd ? "Remove end date" : "Add end date"}
                    </Button>
                    {showEnd && (
                      <ScheduleFields
                        part="end"
                        draft={draft}
                        errors={errors}
                        choices={choices.endOffset}
                        update={updateField}
                        disabled={locked}
                      />
                    )}
                  </div>
                  <JourneyInput
                    field="timeZone"
                    label="Timezone"
                    value={draft.timeZone}
                    error={errors.timeZone}
                    required
                    list="recording-timezones"
                    disabled={locked}
                    onEdit={updateField}
                  />
                  <datalist id="recording-timezones">
                    {localZones.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                </>
              )}
            </FieldGroup>
          </section>
          <section className={panel} aria-labelledby="recording-audience">
            <h2 id="recording-audience" className="text-xl font-bold">
              Who can review
            </h2>
            <Field>
              <FieldLabel htmlFor="recording-audience-select">
                Recording audience
              </FieldLabel>
              <NativeSelect
                id="recording-audience-select"
                value={audience}
                disabled={locked}
                onChange={(event) => {
                  setAudience(
                    event.currentTarget.value === "journey_review"
                      ? "journey_review"
                      : "only_me",
                  );
                  setPlacement(false);
                }}
              >
                <option value="only_me">Only me</option>
                <option value="journey_review">Journey review</option>
              </NativeSelect>
            </Field>
            <p className="text-sm text-muted-foreground">
              {audience === "only_me"
                ? "Only you can see this recording, including after you invite others."
                : "You, active coauthors and designated publishers can review the recording."}
            </p>
            {audience === "journey_review" &&
              (!existing || target?.canPlace) && (
                <Field>
                  <FieldLabel htmlFor="recording-placement">
                    Shared draft
                  </FieldLabel>
                  <NativeSelect
                    id="recording-placement"
                    value={placement ? "yes" : "no"}
                    disabled={locked}
                    onChange={(event) =>
                      setPlacement(event.currentTarget.value === "yes")
                    }
                  >
                    <option value="no">Keep in review</option>
                    <option value="yes">
                      Include sections in the shared draft
                    </option>
                  </NativeSelect>
                </Field>
              )}
            {notice && (
              <Alert role="status">
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={
                Boolean(busy) ||
                (!attempt &&
                  (!page ||
                    (Boolean(fixedJourney) && target?.grantRevision == null)))
              }
              focusableWhenDisabled
              feedback={busy === "save" ? "pending" : "idle"}
            >
              {busy === "save"
                ? "Saving recording…"
                : attempt
                  ? "Retry save"
                  : existing
                    ? "Add recording"
                    : "Create private journey"}
            </Button>
          </section>
        </div>
      )}
    </form>
  );
}
