import type {
  JourneyRecording,
  RecordingCommit,
} from "@kairn/contracts/recordings";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import { JourneyRetry } from "../journeys/states";
import { ManageRecordingAccess } from "./access";
import { RecordingMap } from "./map";
import { RecordingSectionList } from "./sections";

export function JourneyRecordingsNative({
  scope,
  journeyId,
  archived,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
  archived: boolean;
}) {
  const { refresh } = useMobileSession();
  const router = useRouter();
  const [show, setShow] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const list = useInfiniteQuery({
    queryKey: ["journeys", "recordings", journeyId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const response = await scope.api.GET(
        "/api/v1/journeys/{journeyId}/recordings",
        {
          params: { path: { journeyId }, query: { cursor: pageParam } },
          signal,
        },
      );
      if (response.response.status === 503) return null;
      return journeyResult(response, scope, refresh);
    },
    getNextPageParam: (page) => page?.nextCursor ?? undefined,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });
  if (list.isError)
    return (
      <JourneyRetry
        text="Couldn’t check recording access."
        retry={() => void list.refetch()}
      />
    );
  if (
    !list.isFetchedAfterMount ||
    !list.data ||
    list.data.pages.every((page) => page === null)
  )
    return null;
  const recordings = list.data.pages.flatMap((page) => page?.recordings ?? []);
  const receipt = scope.queryClient.getQueryData<RecordingCommit>([
    "recording-receipt",
    journeyId,
  ]);
  const saved = recordings.find((item) => item.id === receipt?.associationId);

  async function removePlacement(id: string, revision: number) {
    if (removing) return;
    setRemoving(id);
    try {
      journeyResult(
        await scope.api.DELETE(
          "/api/v1/journeys/{journeyId}/recordings/{id}/placement",
          {
            params: { path: { journeyId, id } },
            body: { expectedGrantRevision: revision },
          },
        ),
        scope,
        refresh,
      );
      setNotice("Recording removed from the shared draft.");
    } catch {
      if (!scope.signal.aborted)
        setNotice(
          "Couldn’t confirm the change. Check the shared draft and try again.",
        );
    } finally {
      if (!scope.signal.aborted) {
        void list.refetch();
        setRemoving(undefined);
      }
    }
  }
  return (
    <Panel>
      <AppText
        text={recordings.length > 1 ? "Recordings" : "Recording"}
        variant="section"
        accessibilityRole="header"
      />
      {!archived && (
        <Action
          label="Add recording"
          onPress={() =>
            router.push({
              pathname: "/journeys/import",
              params: { journeyId, fresh: "1" },
            })
          }
        />
      )}
      {receipt && saved && (
        <StatusNotice
          notice={{
            text: `${receipt.outcome === "created" ? "Journey created." : receipt.outcome === "already_added" ? "Recording already added." : "Recording added."} ${saved.scope === "only_me" ? "Recording visible only to you." : "Available for journey review."}`,
            tone: "success",
          }}
        />
      )}
      {!recordings.length && (
        <AppText text="No recordings available." subdued />
      )}
      {notice && <StatusNotice notice={{ text: notice, tone: "success" }} />}
      {recordings.map((item) => (
        <Panel key={item.id}>
          <AppText text={item.fileName} variant="label" />
          <AppText
            text={item.scope === "only_me" ? "Only me" : "Journey review"}
            subdued
          />
          <Action
            label={
              show === item.id
                ? "Hide recorded sections"
                : "View recorded sections"
            }
            accessibilityState={{ expanded: show === item.id }}
            onPress={() => setShow(show === item.id ? undefined : item.id)}
          />
          {show === item.id && (
            <AttachedSections
              key={item.reviewVersion}
              scope={scope}
              journeyId={journeyId}
              id={item.id}
              version={item.reviewVersion}
            />
          )}
          {item.owned && item.sourceId && (
            <ManageRecordingAccess
              scope={scope}
              journeyId={journeyId}
              id={item.id}
              sourceId={item.sourceId}
              archived={archived}
              changed={(text) => {
                setShow(undefined);
                setNotice(text);
                void list.refetch();
              }}
            />
          )}
          {item.placementRevision !== null && (
            <>
              <PlacementReview
                scope={scope}
                journeyId={journeyId}
                item={item}
                accepted={() => {
                  setNotice("Recording update accepted in this shared draft.");
                  void list.refetch();
                }}
              />
              <Action
                label="Remove from shared draft"
                disabled={Boolean(removing)}
                onPress={() =>
                  void removePlacement(item.id, item.placementRevision ?? 0)
                }
              />
            </>
          )}
        </Panel>
      ))}
      {list.hasNextPage && (
        <Action
          label="More recordings"
          onPress={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
        />
      )}
    </Panel>
  );
}

function PlacementReview({
  scope,
  journeyId,
  item,
  accepted,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
  item: JourneyRecording;
  accepted: () => void;
}) {
  const { refresh } = useMobileSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const route = "/api/v1/journeys/{journeyId}/recordings/{id}/placement/review";
  const params = { path: { journeyId, id: item.id } };
  const query = useQuery({
    enabled: open,
    queryKey: [
      "recording-placement-review",
      journeyId,
      item.id,
      item.reviewVersion,
    ],
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(route, { params, signal }),
        scope,
        refresh,
      ),
  });
  const review = query.data?.review;

  async function accept(token: string) {
    setBusy(true);
    setError(false);
    try {
      journeyResult(
        await scope.api.PATCH(route, { params, body: { token } }),
        scope,
        refresh,
      );
      setOpen(false);
      accepted();
    } catch {
      if (!scope.signal.aborted) {
        setError(true);
        void query.refetch();
      }
    } finally {
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <Action
        label={open ? "Hide recording updates" : "Check for recording updates"}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      />
      {open &&
        (query.isError ? (
          <JourneyRetry
            text="Couldn’t check recording updates."
            busy={query.isFetching}
            retry={() => void query.refetch()}
          />
        ) : query.isFetching || !query.data ? (
          <StatusNotice
            notice={{ text: "Checking for a recording update", tone: "info" }}
          />
        ) : review ? (
          <Panel>
            <AppText text={`${review.sectionCount} sections in the update.`} />
            {review.clock && (
              <AppText
                text={`Clock shift ${review.clock.shiftMinutes} minutes · ${review.clock.displayTimeZone}`}
              />
            )}
            {error && (
              <StatusNotice
                notice={{
                  text: "Couldn’t accept this update. Try again.",
                  tone: "warning",
                }}
              />
            )}
            <Action
              label="Accept update for this journey"
              disabled={busy}
              onPress={() => void accept(review.token)}
            />
          </Panel>
        ) : (
          <AppText text="No newer recording update." subdued />
        ))}
    </>
  );
}

function AttachedSections({
  scope,
  journeyId,
  id,
  version,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
  id: string;
  version: string;
}) {
  const { refresh } = useMobileSession();
  const [mapSection, setMapSection] = useState<number>();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const query = useQuery({
    queryKey: [
      "journeys",
      "recording-sections",
      journeyId,
      id,
      version,
      cursors.at(-1),
    ],
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(
          "/api/v1/journeys/{journeyId}/recordings/{id}/segments",
          {
            params: {
              path: { journeyId, id },
              query: { cursor: cursors.at(-1) },
            },
            signal,
          },
        ),
        scope,
        refresh,
      ),
    refetchOnMount: "always",
  });
  if (query.isError)
    return (
      <JourneyRetry
        text="Couldn’t check recording access."
        retry={() => void query.refetch()}
      />
    );
  if (!query.isFetchedAfterMount || !query.data)
    return <StatusNotice notice={{ text: "Loading sections", tone: "info" }} />;
  const next = query.data.nextCursor;
  return (
    <>
      {query.data.sections.length > 0 && (
        <RecordingMap
          scope={scope}
          id={id}
          journeyId={journeyId}
          revision={version}
          cursor={cursors.at(-1)}
          through={query.data.sections[query.data.sections.length - 1].ordinal}
          selected={mapSection}
          onSelect={setMapSection}
        />
      )}
      <RecordingSectionList sections={query.data.sections} />
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
