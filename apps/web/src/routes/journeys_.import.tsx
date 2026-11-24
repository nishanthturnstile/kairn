import { journeyPath } from "@kairn/contracts/journeys";
import type { RecordingCommit } from "@kairn/contracts/recordings";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { JourneyFlow } from "@/components/journeys/flow";
import {
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "@/components/journeys/states";
import {
  RecordingImportFlow,
  useRecordingDraft,
} from "@/components/recordings/import-flow";
import { Button, ButtonLink } from "@/components/ui/button";
import { journeyResult } from "@/lib/journey-api";
import { gpxJourneyCreation } from "@/lib/journey-creation";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";

function id(value: unknown) {
  return journeyPath.safeParse({ journeyId: value }).data?.journeyId;
}

export const Route = createFileRoute("/journeys_/import")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    journeyId?: string;
    importId?: string;
    recordingId?: string;
    fresh?: boolean;
    resume?: boolean;
  } => ({
    journeyId: id(search.journeyId),
    importId: id(search.importId),
    recordingId: id(search.recordingId),
    fresh: search.fresh === true || undefined,
    resume: search.resume === true || undefined,
  }),
  component: RecordingImportRoute,
});

function RecordingImportRoute() {
  const { scope } = Route.useRouteContext();
  const search = Route.useSearch();
  return (
    <JourneyGate title="Import a GPX recording" returnTo="/journeys">
      {scope.accountId && (
        <ImportPage
          key={scope.accountId}
          accountId={scope.accountId}
          scope={scope}
          {...search}
        />
      )}
    </JourneyGate>
  );
}

function ImportPage({
  scope,
  accountId,
  importId,
  recordingId,
  journeyId,
  fresh,
  resume,
}: {
  scope: AccountScope;
  accountId: string;
  importId?: string;
  recordingId?: string;
  journeyId?: string;
  fresh?: boolean;
  resume?: boolean;
}) {
  const navigate = Route.useNavigate();
  const legacyHandoff = !resume && !importId ? journeyId : undefined;
  const legacyDraft = useRecordingDraft(
    accountId,
    undefined,
    Boolean(legacyHandoff),
  );
  const editOnly = Boolean(importId && recordingId);

  function layout({
    children,
    targetId,
    reviewed = false,
  }: {
    children: ReactNode;
    targetId?: string;
    reviewed?: boolean;
  }) {
    return (
      <JourneyFlow
        title={editOnly ? "Edit a saved recording" : "Import a GPX recording"}
        description={
          editOnly
            ? "Review recorded sections and adjust their times. Shared drafts keep their current revision until a coauthor accepts an update."
            : "Review the recorded sections, then create a private journey or add the recording to an existing one."
        }
        back={
          <ButtonLink
            render={
              editOnly && recordingId ? (
                <Link
                  to="/account/recordings"
                  search={{ recording: recordingId }}
                />
              ) : targetId ? (
                <Link
                  to="/journeys/$journeyId"
                  params={{ journeyId: targetId }}
                />
              ) : (
                <Link to="/journeys" />
              )
            }
            variant="ghost"
            size="sm"
            className="min-h-touch justify-self-start px-0"
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />{" "}
            {editOnly
              ? "Back to Your recordings"
              : targetId
                ? "Back to journey"
                : "Back to Journeys"}
          </ButtonLink>
        }
      >
        {children}
        {!editOnly && !reviewed && <ManualCreationLink />}
      </JourneyFlow>
    );
  }

  if (resume) return layout({ children: <PendingImports scope={scope} /> });
  if (legacyHandoff) {
    if (legacyDraft.isError)
      return layout({
        targetId: legacyHandoff,
        children: (
          <JourneyRetry
            title="Couldn’t load your saved selection"
            busy={legacyDraft.isFetching}
            retry={() => void legacyDraft.refetch()}
          />
        ),
      });
    if (!legacyDraft.isFetchedAfterMount)
      return layout({
        targetId: legacyHandoff,
        children: <JourneyLoading label="Checking saved selection" />,
      });
    if (legacyDraft.data?.journeyId !== legacyHandoff)
      return (
        <Navigate
          to="/journeys/$journeyId"
          params={{ journeyId: legacyHandoff }}
          search={{ addRecording: true }}
          replace
        />
      );
  }

  function completed(result: RecordingCommit) {
    scope.queryClient.setQueryData(
      [accountId, "recording-receipt", result.journeyId],
      result,
    );
    if (result.journeyId)
      void navigate({
        to: "/journeys/$journeyId",
        params: { journeyId: result.journeyId },
        replace: true,
      });
    else
      void navigate({
        to: "/account/recordings",
        search: { recording: result.recordingId, saved: true },
        replace: true,
      });
  }

  return (
    <RecordingImportFlow
      scope={scope}
      accountId={accountId}
      importId={importId}
      initialJourney={journeyId}
      fresh={!legacyHandoff && fresh}
      editOnly={editOnly}
      onEntryChange={(nextImportId, targetId) =>
        void navigate({
          search: {
            importId: nextImportId,
            journeyId: targetId,
            fresh: nextImportId ? undefined : true,
          },
          replace: true,
        })
      }
      onComplete={completed}
      layout={layout}
    />
  );
}

function ManualCreationLink() {
  return (
    <ButtonLink
      render={
        <Link
          to="/journeys/new"
          search={{ intent: gpxJourneyCreation ? "plan" : undefined }}
        />
      }
      variant="ghost"
      className="justify-self-start"
    >
      {gpxJourneyCreation
        ? "Plan without a recording"
        : "Create journey manually"}
    </ButtonLink>
  );
}

function PendingImports({ scope }: { scope: AccountScope }) {
  const { refresh } = useSessionAccess();
  const list = useInfiniteQuery({
    queryKey: [scope.accountId, "recording-import-list"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports", {
          params: { query: { cursor: pageParam } },
          signal,
        }),
        scope,
        refresh,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  if (list.isError)
    return (
      <JourneyRetry
        title="Couldn’t load unfinished imports"
        busy={list.isFetching}
        retry={() => void list.refetch()}
      />
    );
  if (!list.data) return <JourneyLoading label="Loading unfinished imports" />;
  const items = list.data.pages.flatMap((page) => page.imports);
  return (
    <section className="grid max-w-2xl min-w-0 gap-3 rounded-card control-border bg-card p-4">
      <h2 className="text-xl font-bold">Unfinished imports</h2>
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"
            >
              <p className="font-semibold wrap-anywhere">{item.fileName}</p>
              <ButtonLink
                render={
                  <Link to="/journeys/import" search={{ importId: item.id }} />
                }
                variant="outline"
                aria-label={`Resume import · ${item.fileName}`}
              >
                Resume import
              </ButtonLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          There are no unfinished imports.
        </p>
      )}
      {list.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          More imports
        </Button>
      )}
    </section>
  );
}
