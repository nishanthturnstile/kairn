import type {
  CommitRecordingImport,
  RecordingCommit,
  RecordingImport,
  RecordingSelection,
} from "@kairn/contracts/recordings";
import {
  type FieldErrors,
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
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../../api";
import { JourneyRequestError, journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import {
  Action,
  AppText,
  Field,
  Panel,
  StatusNotice,
} from "../fold/primitives";
import { ScheduleField } from "../journeys/picker";
import { JourneyRetry } from "../journeys/states";
import { RecordingClock } from "./clock";
import { RecordingMap } from "./map";
import { RecordingSectionList } from "./sections";

type Props = {
  scope: VerifiedMobileScope;
  entry: RecordingImport;
  initialJourney?: string;
  initialPending?: CommitRecordingImport;
  persistPending: (
    next?: CommitRecordingImport,
  ) => Promise<CommitRecordingImport | undefined>;
  onComplete: (result: RecordingCommit) => void;
  editOnly?: boolean;
};

export function NativeRecordingReview({
  scope,
  entry,
  initialJourney,
  initialPending,
  persistPending,
  onComplete,
  editOnly = false,
}: Props) {
  const { refresh, canSubmit } = useMobileSession();
  const op = useRef<AbortController>(null);
  const destinationPin = useRef<Extract<
    CommitRecordingImport["destination"],
    { kind: "existing" }
  > | null>(null);
  const [active, setActive] = useState<"review" | "save">();
  const [pending, setPending] = useState(initialPending);
  const [mapSection, setMapSection] = useState<number>();
  const [feedback, setFeedback] = useState("");
  const [cursor, setCursor] = useState<(number | undefined)[]>([undefined]);
  const initialTarget =
    initialPending?.destination.kind === "existing"
      ? initialPending.destination.journeyId
      : initialJourney;
  const [existing, setExisting] = useState(Boolean(initialTarget));
  const [selected, setSelected] = useState(initialTarget ?? "");
  const [audience, setAudience] = useState(initialPending?.scope ?? "only_me");
  const [placement, setPlacement] = useState(
    initialPending?.placeInDraft ?? false,
  );
  const [draft, setDraft] = useState(() =>
    journeyDraft(
      initialPending?.destination.kind === "new"
        ? initialPending.destination.journey
        : undefined,
    ),
  );
  const [showEnd, setShowEnd] = useState(
    Boolean(draft.endDate || draft.endTime),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [offsets, setOffsets] = useState<OffsetChoices>({});
  const [suggestTitle, setSuggestTitle] = useState(!initialPending);
  const locked = Boolean(pending) || active === "save";
  const params = { path: { id: entry.id } };
  const reviewKey = ["recording-review", entry.id];

  useEffect(() => () => op.current?.abort(), []);
  const review = useQuery({
    queryKey: reviewKey,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/review", { params, signal }),
        scope,
        refresh,
      ),
  });
  const sections = useQuery({
    queryKey: [
      "recording-sections",
      entry.id,
      review.data?.revision,
      cursor.at(-1),
    ],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/segments", {
          params: { ...params, query: { cursor: cursor.at(-1) } },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  const candidates = useInfiniteQuery({
    queryKey: ["recording-destinations"],
    enabled: existing,
    initialPageParam: undefined as string | undefined,
    refetchInterval: 30_000,
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
  const picked = useQuery({
    queryKey: ["recording-destination", entry.id, selected],
    enabled: existing && Boolean(selected),
    refetchInterval: 30_000,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(
          "/api/v1/recording-attachment-destinations/{journeyId}",
          {
            params: {
              path: { journeyId: selected },
              query: { importId: entry.id },
            },
            signal,
          },
        ),
        scope,
        refresh,
      ),
  });
  const target =
    !picked.isFetching && !picked.isError && !picked.isPaused
      ? picked.data
      : undefined;
  const choices =
    !candidates.isFetching && !candidates.isError && !candidates.isPaused
      ? (candidates.data?.pages.flatMap(({ journeys }) => journeys) ?? [])
      : [];
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
  useEffect(() => {
    if (suggestTitle && page?.sections[0]?.trackName) {
      const title = page.sections[0].trackName;
      setDraft((current) => ({
        ...current,
        title: current.title || title.slice(0, 120),
      }));
      setSuggestTitle(false);
    }
  }, [page, suggestTitle]);

  const edit = useCallback((field: JourneyField, value: string) => {
    if (field === "title") setSuggestTitle(false);
    const clearStart =
      field === "startDate" || field === "startTime" || field === "timeZone";
    const clearEnd =
      field === "endDate" || field === "endTime" || field === "timeZone";
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(clearStart && { startOffset: "" }),
      ...(clearEnd && { endOffset: "" }),
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (clearStart || clearEnd)
      setOffsets((current) => ({
        startOffset: clearStart ? undefined : current.startOffset,
        endOffset: clearEnd ? undefined : current.endOffset,
      }));
  }, []);

  async function execute(
    kind: "review" | "save",
    action: (signal: AbortSignal) => Promise<void>,
  ) {
    if (op.current || !canSubmit(scope)) return;
    const controller = new AbortController();
    op.current = controller;
    setActive(kind);
    setFeedback("");
    try {
      await action(controller.signal);
    } finally {
      op.current = null;
      if (!scope.signal.aborted) setActive(undefined);
    }
  }

  function change(selection: RecordingSelection) {
    if (!review.data || locked) return;
    const revision = review.data.revision;
    void execute("review", async (signal) => {
      try {
        const updated = journeyResult(
          await scope.api.PATCH("/api/v1/imports/{id}/review", {
            params,
            body: { revision, selection },
            signal,
          }),
          scope,
          refresh,
        );
        scope.queryClient.setQueryData(reviewKey, updated);
        if (editOnly)
          void scope.queryClient.invalidateQueries({
            queryKey: ["owner-recording-sections"],
          });
        setFeedback("Recording review updated.");
      } catch (error) {
        if (signal.aborted || scope.signal.aborted) return;
        if (error instanceof JourneyRequestError && error.status === 400)
          setFeedback(
            "Keep at least one continuous section with two usable samples.",
          );
        else {
          await review.refetch();
          setFeedback(
            "Couldn’t confirm that edit. Check the current selection and try again.",
          );
        }
      }
    });
  }

  function save() {
    if (!review.data) return;
    let request = pending;
    if (!request) {
      let destination: CommitRecordingImport["destination"];
      if (existing) {
        const pin = destinationPin.current;
        if (!target || !pin || pin.journeyId !== target.id) {
          setFeedback("Choose an available journey.");
          return;
        }
        if (
          pin.membershipGeneration !== target.membershipGeneration ||
          pin.grantRevision !== target.grantRevision
        ) {
          setSelected("");
          resetSharing();
          setFeedback(
            "The destination changed. Choose an available journey again.",
          );
          return;
        }
        destination = pin;
      } else {
        const validated = validateJourneyDraft(draft);
        if (!validated.input) {
          setErrors(validated.errors);
          setFeedback("Check the marked journey fields.");
          return;
        }
        destination = { kind: "new", journey: validated.input };
      }
      request = {
        protocolVersion: 1,
        deviceId: randomUUID(),
        commandId: randomUUID(),
        destination,
        reviewRevision: review.data.revision,
        scope: audience,
        placeInDraft:
          audience === "journey_review" &&
          (!existing || Boolean(target?.canPlace)) &&
          placement,
      };
    }
    const command = request;
    void execute("save", async (signal) => {
      let stored = false;
      try {
        const claimed = await persistPending(command);
        if (!claimed) throw new Error("Recording command unavailable");
        stored = true;
        ensureActive(signal);
        ensureActive(scope.signal);
        setPending(claimed);
        if (claimed.commandId !== command.commandId) {
          setAudience(claimed.scope);
          setPlacement(claimed.placeInDraft);
          setExisting(claimed.destination.kind === "existing");
          if (claimed.destination.kind === "existing")
            setSelected(claimed.destination.journeyId);
          else {
            const previous = journeyDraft(claimed.destination.journey);
            setDraft(previous);
            setShowEnd(Boolean(previous.endDate || previous.endTime));
          }
          setFeedback(
            "A save is already pending. Review the saved details before retrying.",
          );
          return;
        }
        const result = journeyResult(
          await scope.api.POST("/api/v1/imports/{id}/commit", {
            params,
            body: command,
            signal,
          }),
          scope,
          refresh,
        );
        await persistPending(undefined);
        ensureActive(signal);
        ensureActive(scope.signal);
        onComplete(result);
      } catch (error) {
        if (signal.aborted || scope.signal.aborted) return;
        if (
          error instanceof JourneyRequestError &&
          error.status === 409 &&
          error.code !== "account_changed"
        ) {
          const result = await scope.api
            .GET("/api/v1/imports/{id}/result", { params, signal })
            .catch(() => undefined);
          if (result?.data && !scope.signal.aborted && !signal.aborted) {
            await persistPending(undefined).catch(() => {});
            onComplete(result.data);
            return;
          }
        }
        if (
          stored &&
          error instanceof JourneyRequestError &&
          error.code !== "account_changed" &&
          [400, 404, 412].includes(error.status)
        ) {
          await persistPending(undefined).catch(() => {});
          setPending(undefined);
          const problems = journeyFormIssues(error.issues);
          setErrors(problems.errors);
          setOffsets(problems.choices);
          if (existing) {
            setSelected("");
            resetSharing();
            setFeedback(
              "The destination changed. Choose an available journey again.",
            );
          } else {
            if (error.status === 412) await review.refetch();
            setFeedback(
              "Check the recording selection and journey details before saving.",
            );
          }
        } else
          setFeedback(
            stored
              ? "We couldn’t confirm the save. Retry with the same details."
              : "Couldn’t save the attempt on this device.",
          );
      }
    });
  }

  const window = review.data?.summary.recordedWindow;
  const schedule = target?.schedule;
  const outside = Boolean(
    window &&
      schedule &&
      (Date.parse(window.start) < Date.parse(schedule.intendedStart.instant) ||
        (schedule.intendedEnd &&
          Date.parse(window.end) > Date.parse(schedule.intendedEnd.instant))),
  );
  function copyRecordedTimes() {
    if (!window) return;
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
      setShowEnd(true);
      setErrors({});
      setOffsets({});
    } catch {
      setErrors({ timeZone: "Enter a valid IANA time zone." });
    }
  }
  const next = page?.nextCursor ?? null;
  return (
    <>
      <View style={styles.group}>
        <AppText
          text={editOnly ? "Edit saved recording" : "Review recording"}
          variant="section"
          accessibilityRole="header"
        />
        <AppText text={entry.fileName} variant="label" />
        <AppText
          text={`${review.data?.summary.sectionCount ?? entry.sectionCount} selected sections. Path unknown between separate sections.`}
          subdued
        />
      </View>
      {review.data && (
        <RecordingClock
          selection={review.data.selection}
          disabled={Boolean(active) || locked}
          change={change}
        />
      )}
      {review.isError || sections.isError ? (
        <JourneyRetry
          text="Couldn’t load the recording review."
          retry={() => {
            void review.refetch();
            void sections.refetch();
          }}
        />
      ) : page ? (
        <>
          {page.sections.length > 0 && (
            <RecordingMap
              scope={scope}
              id={entry.id}
              cursor={cursor.at(-1)}
              revision={review.data?.revision}
              through={page.sections[page.sections.length - 1].ordinal}
              selected={mapSection}
              onSelect={setMapSection}
            />
          )}
          <RecordingSectionList
            sections={page.sections}
            edit={
              review.data
                ? {
                    scope,
                    importId: entry.id,
                    selection: review.data.selection,
                    change,
                    disabled: Boolean(active) || locked,
                  }
                : undefined
            }
          />
          {cursor.length > 1 && (
            <Action
              label="Previous sections"
              onPress={() => setCursor((value) => value.slice(0, -1))}
            />
          )}
          {next !== null && (
            <Action
              label="Next sections"
              onPress={() => setCursor((value) => [...value, next])}
            />
          )}
        </>
      ) : (
        <StatusNotice
          notice={{ text: "Loading recorded sections", tone: "info" }}
        />
      )}
      {editOnly ? (
        feedback && <StatusNotice notice={{ text: feedback, tone: "info" }} />
      ) : (
        <>
          <Panel>
            <AppText
              text="Journey details"
              variant="section"
              accessibilityRole="header"
            />
            <Action
              label="New journey"
              variant={existing ? "secondary" : "primary"}
              accessibilityState={{ selected: !existing }}
              disabled={locked}
              onPress={() => {
                if (!existing) return;
                setExisting(false);
                resetSharing();
              }}
            />
            <Action
              label="Existing journey"
              variant={existing ? "primary" : "secondary"}
              accessibilityState={{ selected: existing }}
              disabled={locked}
              onPress={() => {
                if (existing) return;
                setExisting(true);
                resetSharing();
              }}
            />
            {existing ? (
              <>
                {picked.isError && (
                  <StatusNotice
                    notice={{
                      text: "This journey is unavailable. Choose another destination.",
                      tone: "warning",
                    }}
                  />
                )}
                {candidates.isError && (
                  <JourneyRetry
                    text="Couldn’t load eligible journeys."
                    retry={() => void candidates.refetch()}
                  />
                )}
                {outside && (
                  <StatusNotice
                    notice={{
                      text: "Part of this recording is outside the journey’s schedule. You can still add it.",
                      tone: "warning",
                    }}
                  />
                )}
                {target && (
                  <View style={styles.group}>
                    <AppText text={target.title} variant="label" />
                    <AppText
                      text={
                        target.schedule
                          ? `${formatJourneyLocalMinute(target.schedule.intendedStart.local).date} · ${target.schedule.timeZone}`
                          : "Dates unavailable"
                      }
                      subdued
                    />
                  </View>
                )}
                {choices.map((choice) => (
                  <Action
                    key={choice.id}
                    label={choice.title}
                    accessibilityState={{ selected: choice.id === selected }}
                    variant={choice.id === selected ? "primary" : "secondary"}
                    disabled={locked}
                    onPress={() => {
                      if (choice.id === selected) return;
                      setSelected(choice.id);
                      resetSharing();
                    }}
                  />
                ))}
                {candidates.hasNextPage && (
                  <Action
                    label="More journeys"
                    onPress={() => void candidates.fetchNextPage()}
                  />
                )}
              </>
            ) : (
              <>
                <AppText
                  text="Include approach and return days. Members can see the title and schedule you confirm."
                  subdued
                />
                <Field
                  label="Title"
                  value={draft.title}
                  error={errors.title}
                  editable={!locked}
                  maxLength={120}
                  onChangeText={(value) => edit("title", value)}
                />
                {window && (
                  <Action
                    label="Use recorded times"
                    disabled={locked}
                    onPress={copyRecordedTimes}
                  />
                )}
                <ScheduleField
                  label="Start date"
                  mode="date"
                  value={draft.startDate}
                  error={errors.startDate}
                  disabled={locked}
                  onChange={(value) => edit("startDate", value)}
                />
                <ScheduleField
                  label="Start time"
                  mode="time"
                  value={draft.startTime}
                  error={errors.startTime}
                  disabled={locked}
                  onChange={(value) => edit("startTime", value)}
                />
                <OffsetOptions
                  part="start"
                  choices={offsets.startOffset}
                  selected={draft.startOffset}
                  disabled={locked}
                  edit={edit}
                />
                <Action
                  label={showEnd ? "Remove end date" : "Add end date"}
                  disabled={locked}
                  onPress={() => {
                    if (showEnd)
                      setDraft((current) => ({
                        ...current,
                        endDate: "",
                        endTime: "",
                        endOffset: "",
                      }));
                    setShowEnd(!showEnd);
                  }}
                />
                {showEnd && (
                  <>
                    <ScheduleField
                      label="End date"
                      mode="date"
                      value={draft.endDate}
                      error={errors.endDate}
                      disabled={locked}
                      onChange={(value) => edit("endDate", value)}
                    />
                    <ScheduleField
                      label="End time"
                      mode="time"
                      value={draft.endTime}
                      error={errors.endTime}
                      disabled={locked}
                      onChange={(value) => edit("endTime", value)}
                    />
                    <OffsetOptions
                      part="end"
                      choices={offsets.endOffset}
                      selected={draft.endOffset}
                      disabled={locked}
                      edit={edit}
                    />
                  </>
                )}
                <Field
                  label="Time zone"
                  value={draft.timeZone}
                  error={errors.timeZone}
                  editable={!locked}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => edit("timeZone", value)}
                />
              </>
            )}
          </Panel>
          <Panel>
            <AppText
              text="Who can review"
              variant="section"
              accessibilityRole="header"
            />
            <Action
              label="Only me"
              variant={audience === "only_me" ? "primary" : "secondary"}
              accessibilityState={{ selected: audience === "only_me" }}
              disabled={locked}
              onPress={() => {
                setAudience("only_me");
                setPlacement(false);
              }}
            />
            <Action
              label="Journey review"
              variant={audience === "journey_review" ? "primary" : "secondary"}
              accessibilityState={{ selected: audience === "journey_review" }}
              disabled={locked}
              onPress={() => setAudience("journey_review")}
            />
            <AppText
              text={
                audience === "only_me"
                  ? "Only you can see this recording, including after you invite others."
                  : "You, active coauthors and designated publishers can review this recording."
              }
              subdued
            />
            {audience === "journey_review" &&
              (!existing || target?.canPlace) && (
                <Action
                  label={
                    placement
                      ? "Remove from shared draft"
                      : "Include sections in the shared draft"
                  }
                  accessibilityState={{ checked: placement }}
                  disabled={locked}
                  onPress={() => setPlacement(!placement)}
                />
              )}
            {feedback && (
              <StatusNotice notice={{ text: feedback, tone: "info" }} />
            )}
            <Action
              label={
                active === "save"
                  ? "Saving recording…"
                  : pending
                    ? "Retry save"
                    : existing
                      ? "Add recording"
                      : "Create private journey"
              }
              variant="primary"
              feedback={active === "save" ? "pending" : "idle"}
              disabled={Boolean(active) || !page}
              onPress={save}
            />
          </Panel>
        </>
      )}
    </>
  );
}

function OffsetOptions({
  part,
  choices,
  selected,
  disabled,
  edit,
}: {
  part: "start" | "end";
  choices?: [string, string];
  selected: string;
  disabled: boolean;
  edit: (field: JourneyField, value: string) => void;
}) {
  return choices?.map((offset, index) => (
    <Action
      key={offset}
      label={`${index === 0 ? "First" : "Second"} ${part} time occurrence (UTC${offset})`}
      disabled={disabled}
      accessibilityState={{ selected: selected === offset }}
      onPress={() => edit(`${part}Offset`, offset)}
    />
  ));
}

const styles = StyleSheet.create(({ semantic: { space } }) => ({
  group: { gap: space.step8 },
}));
