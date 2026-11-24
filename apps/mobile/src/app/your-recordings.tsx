import { journeyPath } from "@kairn/contracts/journeys";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Action,
  AppText,
  Panel,
  StatusNotice,
} from "../components/fold/primitives";
import { JourneyFlowHeading } from "../components/journeys/flow";
import {
  JourneyGate,
  JourneyRetry,
  JourneyScreen,
} from "../components/journeys/states";
import { RecordingSectionList } from "../components/recordings/sections";
import { journeyResult } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import {
  clearExpiredRecordingExports,
  recordingSize,
  shareOriginalRecording,
} from "../recording-api";
import type { VerifiedMobileScope } from "../session";

export default function OwnerRecordingsRoute() {
  const params = useLocalSearchParams();
  const id = journeyPath.safeParse({ journeyId: params.recording }).data
    ?.journeyId;
  useEffect(() => {
    try {
      clearExpiredRecordingExports();
    } catch {
      // The operating system can clear private cache files independently.
    }
  }, []);
  return (
    <JourneyGate title="Your recordings">
      {(scope) => (
        <JourneyScreen density="compact" safeBottom>
          <JourneyFlowHeading
            title="Your recordings"
            description="Private originals you uploaded to Kairn."
          />
          {params.saved === "1" && (
            <StatusNotice
              notice={{
                text: "Recording saved. This journey is no longer available.",
                tone: "success",
              }}
            />
          )}
          {id ? (
            <OwnerDetail key={id} scope={scope} id={id} />
          ) : (
            <OwnerList scope={scope} />
          )}
        </JourneyScreen>
      )}
    </JourneyGate>
  );
}

function OwnerList({ scope }: { scope: VerifiedMobileScope }) {
  const router = useRouter();
  const { refresh } = useMobileSession();
  const query = useInfiniteQuery({
    queryKey: ["owner-recordings"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/account/recordings", {
          params: { query: { cursor: pageParam } },
          signal,
        }),
        scope,
        refresh,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchOnMount: "always",
  });
  if (query.isError)
    return (
      <JourneyRetry
        text="Couldn’t load your recordings."
        retry={() => void query.refetch()}
      />
    );
  if (!query.isFetchedAfterMount || !query.data)
    return (
      <StatusNotice notice={{ text: "Loading recordings", tone: "info" }} />
    );
  const items = query.data.pages.flatMap((page) => page.recordings);
  return (
    <Panel>
      {items.length ? (
        items.map((item) => (
          <Action
            key={item.id}
            label={item.fileName}
            accessibilityHint={recordingSize(item.byteLength)}
            onPress={() =>
              router.push({
                pathname: "/your-recordings",
                params: { recording: item.id },
              })
            }
          />
        ))
      ) : (
        <AppText text="You haven’t uploaded any recordings yet." subdued />
      )}
      {query.hasNextPage && (
        <Action
          label="More recordings"
          onPress={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        />
      )}
    </Panel>
  );
}

function OwnerDetail({
  scope,
  id,
}: {
  scope: VerifiedMobileScope;
  id: string;
}) {
  const router = useRouter();
  const { refresh } = useMobileSession();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const exportRequest = useRef<AbortController | null>(null);
  useFocusEffect(
    useCallback(
      () => () => {
        exportRequest.current?.abort();
      },
      [],
    ),
  );
  const detail = useQuery({
    queryKey: ["owner-recording", id],
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/account/recordings/{id}", {
          params: { path: { id } },
          signal,
        }),
        scope,
        refresh,
      ),
    refetchOnMount: "always",
  });
  const sections = useQuery({
    queryKey: ["owner-recording-sections", id, cursors.at(-1)],
    enabled:
      detail.data?.stage === "ready" &&
      !detail.isError &&
      detail.isFetchedAfterMount,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/account/recordings/{id}/segments", {
          params: { path: { id }, query: { cursor: cursors.at(-1) } },
          signal,
        }),
        scope,
        refresh,
      ),
    refetchOnMount: "always",
  });
  if (detail.isError)
    return (
      <JourneyRetry
        text="This recording is unavailable."
        retry={() => void detail.refetch()}
      />
    );
  if (!detail.isFetchedAfterMount || !detail.data)
    return (
      <StatusNotice notice={{ text: "Loading recording", tone: "info" }} />
    );
  const next = sections.data?.nextCursor ?? null;
  const recording = detail.data;

  async function exportOriginal() {
    if (exportRequest.current) return;
    const request = new AbortController();
    exportRequest.current = request;
    setExporting(true);
    setExportError(false);
    try {
      await shareOriginalRecording(scope, recording, refresh, request.signal);
    } catch {
      if (!request.signal.aborted && !scope.signal.aborted)
        setExportError(true);
    } finally {
      exportRequest.current = null;
      if (!scope.signal.aborted) setExporting(false);
    }
  }
  return (
    <>
      <Panel>
        <AppText
          text={detail.data.fileName}
          variant="section"
          accessibilityRole="header"
        />
        <AppText text={recordingSize(detail.data.byteLength)} subdued />
        <Action
          label={exporting ? "Preparing original" : "Export original"}
          disabled={exporting}
          onPress={() => void exportOriginal()}
        />
        {recording.reviewImportId && (
          <Action
            label="Edit recording"
            onPress={() =>
              router.push({
                pathname: "/journeys/import",
                params: { importId: recording.reviewImportId, edit: "1" },
              })
            }
          />
        )}
        {exportError && (
          <StatusNotice
            notice={{
              text: "Couldn’t export the original recording. Try again.",
              tone: "warning",
            }}
          />
        )}
      </Panel>
      {sections.isError ? (
        <JourneyRetry
          text="Couldn’t load recorded sections."
          retry={() => void sections.refetch()}
        />
      ) : sections.data && sections.isFetchedAfterMount ? (
        <RecordingSectionList sections={sections.data.sections} />
      ) : (
        detail.data.stage === "ready" && (
          <StatusNotice notice={{ text: "Loading sections", tone: "info" }} />
        )
      )}
      {cursors.length > 1 && (
        <Action
          label="Previous sections"
          onPress={() => setCursors((value) => value.slice(0, -1))}
        />
      )}
      {next !== null && (
        <Action
          label="Next sections"
          onPress={() => setCursors((value) => [...value, next])}
        />
      )}
    </>
  );
}
