import type { JourneyRecording } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { journeyResult } from "@/lib/journey-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { JourneyLoading, JourneyRetry } from "../journeys/states";
import { ManageRecordingAccess } from "./manage-access";
import { RecordingSections, SectionPagination } from "./sections";

export function JourneyRecordingDetail({
  item,
  scope,
  journeyId,
  archived,
  changed,
}: {
  item: JourneyRecording;
  scope: AccountScope;
  journeyId: string;
  archived: boolean;
  changed: (message: string) => void;
}) {
  const [notice, setNotice] = useState("");
  function updated(message: string) {
    setNotice(message);
    changed(message);
  }

  return (
    <div className="grid min-w-0 gap-4 py-2">
      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {(item.sourceId || item.placementRevision !== null) && (
        <div className="grid min-w-0 gap-3">
          {item.owned && item.sourceId && (
            <ManageRecordingAccess
              scope={scope}
              journeyId={journeyId}
              id={item.id}
              sourceId={item.sourceId}
              archived={archived}
              changed={updated}
            />
          )}
          {!archived && item.placementRevision !== null && (
            <SharedDraftControls
              item={item}
              placementRevision={item.placementRevision}
              scope={scope}
              journeyId={journeyId}
              changed={updated}
            />
          )}
        </div>
      )}
      <JourneySections
        key={item.reviewVersion}
        scope={scope}
        journeyId={journeyId}
        id={item.id}
        version={item.reviewVersion}
      />
    </div>
  );
}

function SharedDraftControls({
  item,
  placementRevision,
  scope,
  journeyId,
  changed,
}: {
  item: JourneyRecording;
  placementRevision: number;
  scope: AccountScope;
  journeyId: string;
  changed: (message: string) => void;
}) {
  const { refresh } = useSessionAccess();
  const updates = useId();
  const updateButton = useRef<HTMLButtonElement>(null);
  const [checkingRevision, setCheckingRevision] = useState(false);
  const [pending, setPending] = useState<"remove" | "accept">();
  const revisionPath =
    "/api/v1/journeys/{journeyId}/recordings/{id}/placement/review";
  const revisionParams = { path: { journeyId, id: item.id } };
  const revision = useQuery({
    queryKey: [
      scope.accountId,
      "recording-placement-review",
      journeyId,
      item.id,
      item.reviewVersion,
    ],
    enabled: checkingRevision,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(revisionPath, { params: revisionParams, signal }),
        scope,
        refresh,
      ),
  });

  async function acceptRevision(token: string) {
    if (pending) return;
    setPending("accept");
    try {
      journeyResult(
        await scope.api.PATCH(revisionPath, {
          params: revisionParams,
          body: { token },
        }),
        scope,
        refresh,
      );
      setCheckingRevision(false);
      updateButton.current?.focus();
      changed("Recording update accepted in this shared draft.");
    } catch {
      if (!scope.signal.aborted) {
        changed(
          "Couldn’t accept this update. Check the current correction and try again.",
        );
        void revision.refetch();
      }
    } finally {
      if (!scope.signal.aborted) setPending(undefined);
    }
  }

  async function removePlacement() {
    if (pending) return;
    setPending("remove");
    try {
      journeyResult(
        await scope.api.DELETE(
          "/api/v1/journeys/{journeyId}/recordings/{id}/placement",
          {
            params: { path: { journeyId, id: item.id } },
            body: { expectedGrantRevision: placementRevision },
          },
        ),
        scope,
        refresh,
      );
      changed("Recording removed from the shared draft.");
    } catch {
      if (!scope.signal.aborted)
        changed(
          "Couldn’t confirm the change. Check the shared draft and try again.",
        );
    } finally {
      if (!scope.signal.aborted) setPending(undefined);
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="font-semibold">Shared draft</h3>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          ref={updateButton}
          type="button"
          variant="outline"
          aria-expanded={checkingRevision}
          aria-controls={updates}
          disabled={Boolean(pending)}
          focusableWhenDisabled
          onClick={() => setCheckingRevision(!checkingRevision)}
        >
          {checkingRevision
            ? "Hide recording updates"
            : "Check for recording updates"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(pending)}
          focusableWhenDisabled
          onClick={() => void removePlacement()}
        >
          {pending === "remove" ? "Removing…" : "Remove from shared draft"}
        </Button>
      </div>
      <div id={updates} hidden={!checkingRevision}>
        {checkingRevision &&
          (revision.isError ? (
            <JourneyRetry
              title="Couldn’t check recording updates"
              busy={revision.isFetching}
              retry={() => void revision.refetch()}
            />
          ) : revision.isFetching || !revision.data ? (
            <JourneyLoading label="Checking for a recording update" />
          ) : revision.data.review ? (
            <div className="grid justify-items-start gap-2">
              <p className="text-sm">
                {revision.data.review.sectionCount} sections in the update.
              </p>
              {revision.data.review.clock && (
                <p className="text-sm">
                  Clock shift {revision.data.review.clock.shiftMinutes} minutes
                  {" · "}
                  {revision.data.review.clock.displayTimeZone}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(pending)}
                focusableWhenDisabled
                onClick={() => {
                  if (revision.data.review)
                    void acceptRevision(revision.data.review.token);
                }}
              >
                {pending === "accept"
                  ? "Accepting update…"
                  : "Accept update for this journey"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No newer recording update.
            </p>
          ))}
      </div>
    </div>
  );
}

function JourneySections({
  scope,
  journeyId,
  id,
  version,
}: {
  scope: AccountScope;
  journeyId: string;
  id: string;
  version: string;
}) {
  const { refresh } = useSessionAccess();
  const heading = useRef<HTMLHeadingElement>(null);
  const [cursors, setCursors] = useState<number[]>([]);
  const cursor = cursors.at(-1);
  const sections = useQuery({
    queryKey: [
      scope.accountId,
      "journey-recording-sections",
      journeyId,
      id,
      version,
      cursor,
    ],
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(
          "/api/v1/journeys/{journeyId}/recordings/{id}/segments",
          { params: { path: { journeyId, id }, query: { cursor } }, signal },
        ),
        scope,
        refresh,
      ),
    staleTime: 0,
  });

  function paginate(next: number[]) {
    heading.current?.focus();
    setCursors(next);
  }

  const next = sections.data?.nextCursor ?? null;
  return (
    <div className="grid min-w-0 gap-2 border-t border-border pt-3">
      <h3 ref={heading} tabIndex={-1} className="font-semibold">
        Recorded sections
      </h3>
      {sections.isError ? (
        <JourneyRetry
          title="Couldn’t load the recorded sections"
          busy={sections.isFetching}
          retry={() => void sections.refetch()}
        />
      ) : !sections.data || !sections.isFetchedAfterMount ? (
        <JourneyLoading label="Loading recorded sections" />
      ) : sections.data.sections.length > 0 ? (
        <>
          <RecordingSections compact sections={sections.data.sections} />
          <SectionPagination
            previous={
              cursors.length > 0
                ? () => paginate(cursors.slice(0, -1))
                : undefined
            }
            next={
              next === null ? undefined : () => paginate([...cursors, next])
            }
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No recorded sections available.
        </p>
      )}
    </div>
  );
}
