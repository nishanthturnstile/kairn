import { journeyPath } from "@kairn/contracts/journeys";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { JourneyFlow } from "@/components/journeys/flow";
import {
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "@/components/journeys/states";
import {
  RecordingSections,
  SectionPagination,
} from "@/components/recordings/sections";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { journeyResult } from "@/lib/journey-api";
import { recordingSize } from "@/lib/recording-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";

export const Route = createFileRoute("/account_/recordings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { recording?: string; saved?: boolean } => ({
    recording: journeyPath.safeParse({ journeyId: search.recording }).data
      ?.journeyId,
    saved: search.saved === true || undefined,
  }),
  component: OwnerRecordingsRoute,
});

function OwnerRecordingsRoute() {
  const { scope } = Route.useRouteContext();
  const { recording, saved } = Route.useSearch();
  return (
    <JourneyGate title="Your recordings">
      <JourneyFlow
        title="Your recordings"
        description="Private originals you uploaded to Kairn."
        back={
          <ButtonLink
            render={<Link to="/account" />}
            variant="ghost"
            size="sm"
            className="justify-self-start px-0"
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" /> Back to
            Account
          </ButtonLink>
        }
      >
        {saved && (
          <Alert role="status">
            <AlertDescription>
              Recording saved. This journey is no longer available.
            </AlertDescription>
          </Alert>
        )}
        {recording ? (
          <OwnerDetail key={recording} scope={scope} id={recording} />
        ) : (
          <OwnerList scope={scope} />
        )}
      </JourneyFlow>
    </JourneyGate>
  );
}

function OwnerList({ scope }: { scope: AccountScope }) {
  const { refresh } = useSessionAccess();
  const list = useInfiniteQuery({
    queryKey: [scope.accountId, "owner-recordings"],
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
    staleTime: 0,
  });
  if (list.isError)
    return (
      <JourneyRetry
        title="Couldn’t load your recordings"
        busy={list.isFetching}
        retry={() => void list.refetch()}
      />
    );
  if (!list.data) return <JourneyLoading label="Loading your recordings" />;
  const rows = list.data.pages.flatMap((page) => page.recordings);
  if (!rows.length)
    return (
      <p className="text-muted-foreground">
        You haven’t uploaded any recordings yet.
      </p>
    );
  return (
    <div className="grid min-w-0 max-w-2xl gap-3">
      <ul className="divide-y divide-border rounded-card control-border bg-card px-4">
        {rows.map((item) => (
          <li key={item.id} className="grid gap-1 py-3">
            <Link
              to="/account/recordings"
              search={{ recording: item.id }}
              className="w-fit font-bold wrap-anywhere underline underline-offset-4"
            >
              {item.fileName}
            </Link>
            <p className="text-sm text-muted-foreground">
              {recordingSize(item.byteLength)}
            </p>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={list.isFetchingNextPage}
          className="justify-self-start"
          onClick={() => void list.fetchNextPage()}
        >
          More recordings
        </Button>
      )}
    </div>
  );
}

function OwnerDetail({ scope, id }: { scope: AccountScope; id: string }) {
  const { refresh } = useSessionAccess();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [error, setError] = useState("");
  const detail = useQuery({
    queryKey: [scope.accountId, "owner-recording", id],
    staleTime: 0,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/account/recordings/{id}", {
          params: { path: { id } },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  const sections = useQuery({
    queryKey: [scope.accountId, "owner-recording-sections", id, cursors.at(-1)],
    enabled: detail.data?.stage === "ready" && !detail.isError,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/account/recordings/{id}/segments", {
          params: { path: { id }, query: { cursor: cursors.at(-1) } },
          signal,
        }),
        scope,
        refresh,
      ),
  });

  async function download() {
    setError("");
    try {
      const response = await scope.api.GET(
        "/api/v1/account/recordings/{id}/original",
        {
          params: { path: { id } },
          parseAs: "blob",
        },
      );
      if (!response.data) throw new Error("Recording download unavailable");
      scope.signal.throwIfAborted();
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = detail.data?.fileName ?? "Recording.gpx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!scope.signal.aborted)
        setError("Couldn’t download the original recording. Try again.");
    }
  }

  if (detail.isError)
    return (
      <JourneyRetry
        title="This recording is unavailable"
        busy={detail.isFetching}
        retry={() => void detail.refetch()}
      />
    );
  if (!detail.data) return <JourneyLoading label="Loading recording" />;
  const next = sections.data?.nextCursor ?? null;
  return (
    <section className="grid min-w-0 max-w-2xl gap-4 rounded-card control-border bg-card p-4 sm:p-5">
      <h2 className="text-xl font-bold wrap-anywhere">
        {detail.data.fileName}
      </h2>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void download()}>
          Download original
        </Button>
        {detail.data.reviewImportId && (
          <ButtonLink
            variant="outline"
            render={
              <Link
                to="/journeys/import"
                search={{
                  importId: detail.data.reviewImportId,
                  recordingId: id,
                }}
              />
            }
          >
            Edit recording
          </ButtonLink>
        )}
        <ButtonLink render={<Link to="/account/recordings" />} variant="ghost">
          All recordings
        </ButtonLink>
      </div>
      {error && (
        <Alert role="status">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {sections.isError ? (
        <JourneyRetry
          title="Couldn’t load recorded sections"
          busy={sections.isFetching}
          retry={() => void sections.refetch()}
        />
      ) : sections.data ? (
        <>
          <RecordingSections sections={sections.data.sections} />
          <SectionPagination
            previous={
              cursors.length > 1
                ? () => setCursors((value) => value.slice(0, -1))
                : undefined
            }
            next={
              next === null
                ? undefined
                : () => setCursors((value) => [...value, next])
            }
          />
        </>
      ) : detail.data.stage === "ready" ? (
        <JourneyLoading label="Loading sections" />
      ) : null}
    </section>
  );
}
