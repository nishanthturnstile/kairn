import {
  type CommitRecordingBatch,
  type RecordingBatchReview,
  recordingBatchReview,
  recordingImport,
  recordingSectionPage,
} from "@kairn/contracts/recordings";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import type { NativeBatch } from "../../storage/recording-batch";
import {
  Action,
  AppText,
  Field,
  Panel,
  StatusNotice,
} from "../fold/primitives";
import { RecordingMap } from "../recordings/map";
import { RecordingSectionList } from "../recordings/sections";
import { JourneyRetry, journeyStyles } from "./states";

const recordedDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function useNativeBatchReview(
  scope: VerifiedMobileScope,
  batch: NativeBatch | null,
  visible: boolean,
) {
  const { refresh } = useMobileSession();
  const imports =
    batch?.files.flatMap(({ importId }) => (importId ? [importId] : [])) ?? [];
  const active = visible && !batch?.attempt;
  const status = useQueries({
    queries: imports.map((id) => ({
      queryKey: ["native-batch-file", id],
      enabled: active,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        recordingImport.parse(
          journeyResult(
            await scope.api.GET("/api/v1/imports/{id}", {
              params: { path: { id } },
              signal,
            }),
            scope,
            refresh,
          ),
        ),
      refetchOnMount: "always" as const,
      refetchInterval: (query: {
        state: { data?: ReturnType<typeof recordingImport.parse> };
      }) => (query.state.data?.stage === "queued" ? 1000 : false),
    })),
  });
  const ready = status.flatMap((query) =>
    !query.isError && query.isFetchedAfterMount && query.data?.stage === "ready"
      ? [query.data.id]
      : [],
  );
  const review = useQuery({
    queryKey: ["native-batch-review", batch?.id, imports, ready],
    enabled: Boolean(batch?.id && active && ready.length),
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ signal }) =>
      recordingBatchReview.parse(
        journeyResult(
          await scope.api.GET("/api/v1/recording-batches/{id}/review", {
            params: { path: { id: batch?.id ?? "" } },
            signal,
          }),
          scope,
          refresh,
        ),
      ),
  });
  const data =
    !review.isError &&
    review.isFetchedAfterMount &&
    review.data?.files.every(({ id }) => imports.includes(id))
      ? review.data
      : undefined;
  return {
    status: (id: string) => status[imports.indexOf(id)],
    data,
    isError: review.isError,
    busy: review.isFetching,
    async retry() {
      await Promise.all(status.map((item) => item.refetch()));
      await review.refetch();
    },
  };
}

export function NativeRecordingReview({
  scope,
  batch,
  review,
  busy,
  save,
}: {
  scope: VerifiedMobileScope;
  batch: NativeBatch;
  review: ReturnType<typeof useNativeBatchReview>;
  busy: boolean;
  save: (body: CommitRecordingBatch) => void;
}) {
  const [selected, setSelected] = useState<number>();
  const [sectionId, setSectionId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState<string>();
  const { data } = review;
  if (review.isError)
    return (
      <JourneyRetry
        text="Couldn’t open the recording review."
        busy={review.busy}
        retry={() => void review.retry()}
      />
    );
  if (!data?.files.length) return null;
  const complete = data.complete && data.files.length === batch.files.length;
  const window = data.recordedWindow;
  return (
    <View style={journeyStyles.group}>
      <AppText
        text="Route preview"
        variant="section"
        accessibilityRole="header"
      />
      {complete && (
        <Panel compact>
          <AppText
            text={title?.trim() || data.title}
            variant="section"
            accessibilityRole="header"
          />
          {editingTitle ? (
            <Field
              label="Journey title"
              maxLength={120}
              value={title ?? data.title}
              onChangeText={setTitle}
              editable={!busy}
            />
          ) : (
            <Action
              label="Edit title"
              variant="text"
              onPress={() => setEditingTitle(true)}
              disabled={busy}
            />
          )}
          {window ? (
            <>
              <AppText
                text={`Recorded start · ${recordedDate.format(new Date(window.start))}`}
              />
              <AppText
                text={`Recorded end · ${recordedDate.format(new Date(window.end))}`}
              />
              <AppText text="Time zone · UTC" subdued />
            </>
          ) : (
            <AppText
              text="Recorded dates unavailable. This journey can be saved without dates."
              subdued
            />
          )}
        </Panel>
      )}
      <RecordingMap
        scope={scope}
        id={batch.id}
        batch
        revision={data.files
          .map(({ id, revision }) => `${id}:${revision}`)
          .join("/")}
        through={0}
        selected={selected}
        onSelect={setSelected}
      />
      {data.files.map((file) => (
        <Panel compact key={file.id}>
          <AppText text={file.fileName} variant="label" />
          <AppText
            text={`${file.sectionCount} ${file.sectionCount === 1 ? "section" : "sections"}`}
            subdued
          />
          <Action
            label={sectionId === file.id ? "Hide sections" : "Show sections"}
            accessibilityLabel={`${sectionId === file.id ? "Hide" : "Show"} sections for ${file.fileName}`}
            accessibilityState={{ expanded: sectionId === file.id }}
            onPress={() =>
              setSectionId(sectionId === file.id ? undefined : file.id)
            }
          />
          {sectionId === file.id && (
            <BatchSections key={file.revision} scope={scope} file={file} />
          )}
        </Panel>
      ))}
      {data.duplicateReviewConflict && (
        <StatusNotice
          notice={{
            text: "This batch contains copies of the same recording with different edits. Remove the unwanted copy before saving.",
            tone: "warning",
          }}
        />
      )}
      <Action
        label="Save journey"
        variant="primary"
        disabled={!complete || busy || review.busy}
        onPress={() => {
          const override = title?.trim();
          save({
            ...(override && override !== data.title ? { title: override } : {}),
            files: data.files.map(({ id, revision }) => ({ id, revision })),
          });
        }}
      />
    </View>
  );
}

function BatchSections({
  scope,
  file,
}: {
  scope: VerifiedMobileScope;
  file: RecordingBatchReview["files"][number];
}) {
  const { refresh } = useMobileSession();
  const [cursors, setCursors] = useState<number[]>([]);
  const cursor = cursors.at(-1);
  const sections = useQuery({
    queryKey: ["native-batch-sections", file.id, file.revision, cursor],
    gcTime: 0,
    queryFn: async ({ signal }) =>
      recordingSectionPage.parse(
        journeyResult(
          await scope.api.GET("/api/v1/imports/{id}/segments", {
            params: { path: { id: file.id }, query: { cursor } },
            signal,
          }),
          scope,
          refresh,
        ),
      ),
  });
  if (sections.isError)
    return (
      <JourneyRetry
        text="Couldn’t load recording sections."
        busy={sections.isFetching}
        retry={() => void sections.refetch()}
      />
    );
  if (!sections.data)
    return <AppText text="Loading recording sections" subdued />;
  const next = sections.data.nextCursor;
  return (
    <>
      <RecordingSectionList sections={sections.data.sections} />
      {cursor !== undefined && (
        <Action
          label="Previous sections"
          onPress={() => setCursors(cursors.slice(0, -1))}
        />
      )}
      {next !== null && (
        <Action
          label="More sections"
          onPress={() => setCursors([...cursors, next])}
        />
      )}
    </>
  );
}
