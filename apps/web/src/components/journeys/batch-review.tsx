import {
  type RecordingBatchReview,
  recordingSectionPage,
} from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Check, LockKeyhole, Pencil, UserRoundPlus } from "lucide-react";
import {
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { JourneyRouteMap } from "@/components/recordings/journey-route-map";
import { RecordingRouteOverview } from "@/components/recordings/route-preview";
import {
  formatRecordingDuration,
  RecordingSections,
  SectionPagination,
} from "@/components/recordings/sections";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { journeyResult } from "@/lib/journey-api";
import type { InviteDraft } from "@/lib/journey-invitations";
import { readBatchOverlay, readBatchReview } from "@/lib/recording-batch";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import type { BatchCommit } from "./batch-commit";
import { InviteComposer } from "./invite-composer";
import { SavedJourneyInviteDialog } from "./saved-journey-invite-dialog";
import { JourneyLoading, JourneyRetry } from "./states";

const recordedDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const distanceFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
const elevationFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

type ReadyFile = { id: string; revision: number };
type ReviewedFile = RecordingBatchReview["files"][number];

export type ReviewedRecordings = {
  files: ReviewedFile[];
  select: (position: number) => void;
};

export function BatchReviewPanel({
  scope,
  batchId,
  ready,
  selectionKey,
  selectionReady,
  refreshBatch,
  commit,
  visible,
  renderRecordings,
}: {
  scope: AccountScope;
  batchId?: string;
  ready: ReadyFile[];
  selectionKey: unknown[];
  selectionReady: boolean;
  refreshBatch: () => Promise<void>;
  commit: BatchCommit;
  visible: boolean;
  renderRecordings: (review: ReviewedRecordings) => ReactNode;
}) {
  const routeHeading = useId();
  const mapRegion = useId();
  const detailsHeading = useId();
  const titleField = useId();
  const { refresh } = useSessionAccess();
  const [title, setTitle] = useState<string>();
  const [lastTitle, setLastTitle] = useState<{
    batchId: string;
    value: string;
  }>();
  const [editingTitle, setEditingTitle] = useState(false);
  const editTitleButton = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const moveTitleFocus = useRef(false);
  const [mapOpen, setMapOpen] = useState(true);
  const [submittedReview, setSubmittedReview] =
    useState<RecordingBatchReview>();
  const [selectedFile, select] = useState<number>();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const [inviteDraft, setInviteDraft] = useState<{
    batchId: string;
    drafts: InviteDraft[];
  }>();
  const invites =
    inviteDraft?.batchId === batchId ? (inviteDraft?.drafts ?? []) : [];
  const reviewing = Boolean(
    batchId && (ready.length || (commit.pending && submittedReview)),
  );
  const review = useQuery({
    queryKey: [scope.accountId, "batch-review", batchId, ready, selectionKey],
    enabled: reviewing,
    refetchOnMount: "always",
    refetchOnWindowFocus: !commit.pending,
    refetchOnReconnect: !commit.pending,
    gcTime: 0,
    queryFn: ({ signal }) => {
      if (!batchId) throw new Error("Missing recording batch.");
      return readBatchReview(scope, refresh, batchId, signal);
    },
  });
  const current = new Map(ready.map(({ id, revision }) => [id, revision]));
  const candidate =
    review.isFetchedAfterMount && !review.isError ? review.data : undefined;
  const matches =
    candidate?.files.length === ready.length &&
    candidate.files.every(({ id, revision }) => current.get(id) === revision);
  const data =
    commit.pending && submittedReview
      ? submittedReview
      : matches && !syncError
        ? candidate
        : undefined;
  const selectionComplete = Boolean(selectionReady && data?.complete);
  const duplicateConflict = data?.duplicateReviewConflict === true;
  const emptyRecording = data?.files.some((file) => file.sectionCount === 0);
  const missingRecordings =
    selectionReady &&
    data &&
    !data.complete &&
    !duplicateConflict &&
    !emptyRecording;
  const canCreate = Boolean(
    batchId &&
      data &&
      selectionComplete &&
      !duplicateConflict &&
      !review.isFetching &&
      !syncing &&
      !commit.pending,
  );
  const dialogOpen = inviteOpen && visible && !commit.savedJourneyId;
  const showTitleEditor = editingTitle && !commit.pending;
  const reviewTitle =
    data?.title ??
    (reviewing && lastTitle?.batchId === batchId
      ? lastTitle?.value
      : undefined);

  useLayoutEffect(() => {
    if (!data || !batchId) return;
    setLastTitle((previous) =>
      previous?.batchId === batchId && previous.value === data.title
        ? previous
        : { batchId, value: data.title },
    );
  }, [batchId, data]);

  useLayoutEffect(() => {
    if (!moveTitleFocus.current || !reviewTitle || !visible) return;
    moveTitleFocus.current = false;
    if (showTitleEditor) titleInput.current?.focus();
    else editTitleButton.current?.focus();
  }, [reviewTitle, showTitleEditor, visible]);

  function editTitle(next: boolean) {
    moveTitleFocus.current = true;
    setEditingTitle(next);
  }

  function createJourney(sendBeforeOpening?: true) {
    if (!canCreate || !data || !batchId) return;
    const override = title?.trim();
    setSubmittedReview(data);
    commit.save({
      batchId,
      sendBeforeOpening,
      ...(invites.length ? { invitees: invites } : {}),
      body: {
        ...(override && override !== data.title ? { title: override } : {}),
        files: data.files.map(({ id, revision }) => ({ id, revision })),
      },
    });
  }

  async function retryReview() {
    setSyncing(true);
    setSyncError(false);
    try {
      await refreshBatch();
      await Promise.all([
        scope.queryClient.invalidateQueries({
          queryKey: [scope.accountId, "batch-file"],
        }),
        scope.queryClient.invalidateQueries({
          queryKey: [scope.accountId, "batch-review", batchId],
        }),
        scope.queryClient.invalidateQueries({
          queryKey: [scope.accountId, "batch-overlay", batchId],
        }),
      ]);
    } catch {
      if (!scope.signal.aborted) setSyncError(true);
    } finally {
      if (!scope.signal.aborted) setSyncing(false);
    }
  }

  return (
    <section
      aria-label={reviewing ? "Journey review" : undefined}
      className={cn(
        "min-w-0",
        reviewing ? "rounded-card border bg-card" : "max-w-3xl",
      )}
    >
      {reviewTitle && (
        <header className="@container/journey-title min-w-0 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2">
            <div
              className={cn(
                "col-span-full min-w-0",
                !commit.pending &&
                  "row-start-2 @min-[18rem]/journey-title:col-span-1 @min-[18rem]/journey-title:row-start-1",
              )}
            >
              {showTitleEditor ? (
                <Field className="max-w-2xl">
                  <FieldLabel htmlFor={titleField}>Journey title</FieldLabel>
                  <Textarea
                    ref={titleInput}
                    id={titleField}
                    rows={2}
                    maxLength={120}
                    value={title ?? reviewTitle}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                  />
                </Field>
              ) : (
                <h2 className="max-w-[48ch] text-2xl font-bold leading-tight wrap-anywhere">
                  {title?.trim() || reviewTitle}
                </h2>
              )}
            </div>
            {!commit.pending && (
              <Button
                ref={editTitleButton}
                type="button"
                variant={showTitleEditor ? "outline" : "ghost"}
                className="col-start-2 row-start-1 justify-self-end"
                onClick={() => editTitle(!showTitleEditor)}
              >
                {showTitleEditor ? (
                  <Check aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Pencil aria-hidden="true" data-icon="inline-start" />
                )}
                {showTitleEditor ? "Done" : "Edit title"}
              </Button>
            )}
          </div>
        </header>
      )}
      <div
        className={cn(
          "grid min-w-0",
          reviewing &&
            "@min-[48rem]/journey-flow:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        {reviewing && (
          <section
            aria-labelledby={routeHeading}
            className="grid min-w-0 content-start gap-3 bg-muted/25 p-4 sm:p-6"
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h2 id={routeHeading} className="text-lg font-semibold">
                Route preview
              </h2>
              {data && visible && (
                <Button
                  type="button"
                  variant="outline"
                  className="bg-secondary"
                  aria-expanded={mapOpen}
                  aria-controls={mapRegion}
                  onClick={() => setMapOpen(!mapOpen)}
                >
                  {mapOpen ? "Hide route" : "Show route"}
                </Button>
              )}
            </div>
            {data && batchId ? (
              <>
                {visible && (
                  <div id={mapRegion} hidden={!mapOpen}>
                    {commit.savedJourneyId ? (
                      mapOpen && (
                        <JourneyRouteMap
                          scope={scope}
                          journeyId={commit.savedJourneyId}
                          overviewOnly
                        />
                      )
                    ) : (
                      <BatchRoutePreview
                        scope={scope}
                        batchId={batchId}
                        files={data.files}
                        open={mapOpen}
                        selectedFile={selectedFile}
                        refreshReview={() => void retryReview()}
                        refreshing={syncing}
                      />
                    )}
                  </div>
                )}
                <RouteSummary review={data} complete={selectionComplete} />
              </>
            ) : review.isError || syncError ? (
              <JourneyRetry
                title="Couldn’t load the batch review"
                busy={review.isFetching || syncing}
                retry={() => void retryReview()}
              />
            ) : review.isFetching || syncing ? (
              <JourneyLoading label="Updating the route preview" />
            ) : (
              <JourneyRetry
                title="The recording batch changed"
                busy={false}
                retry={() => void retryReview()}
              />
            )}
          </section>
        )}
        <div
          className={cn(
            "grid min-w-0 content-start",
            reviewing &&
              "border-t border-border @min-[48rem]/journey-flow:border-s @min-[48rem]/journey-flow:border-t-0",
          )}
        >
          {!reviewTitle && commit.feedback}
          {reviewTitle && batchId && (
            <div className="grid min-w-0 gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
              <section
                aria-labelledby={detailsHeading}
                className="grid min-w-0 gap-2"
              >
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <h2 id={detailsHeading} className="text-lg font-semibold">
                    Recorded time
                  </h2>
                  {data?.recordedWindow && (
                    <span className="text-sm text-muted-foreground">
                      {data.timeZone}
                    </span>
                  )}
                </div>
                {data?.recordedWindow ? (
                  <dl className="grid min-w-0 gap-2 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <dt className="text-muted-foreground">Start</dt>
                      <dd>
                        <time dateTime={data.recordedWindow.start}>
                          {recordedDate.format(
                            new Date(data.recordedWindow.start),
                          )}
                        </time>
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <dt className="text-muted-foreground">End</dt>
                      <dd>
                        <time dateTime={data.recordedWindow.end}>
                          {recordedDate.format(
                            new Date(data.recordedWindow.end),
                          )}
                        </time>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {data
                      ? "Recorded dates are unavailable. You can save without dates."
                      : "Waiting for the current review."}
                  </p>
                )}
              </section>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border py-3">
                <div className="grid min-w-0 gap-0.5">
                  <h2 className="font-semibold">People</h2>
                  {!commit.savedJourneyId && (
                    <span
                      className="text-sm text-muted-foreground"
                      role="status"
                    >
                      {invites.length
                        ? `${invites.length} ${invites.length === 1 ? "person" : "people"} selected`
                        : "Only you"}
                    </span>
                  )}
                </div>
                {commit.savedJourneyId ? (
                  <SavedJourneyInviteDialog
                    scope={scope}
                    journeyId={commit.savedJourneyId}
                    title={title?.trim() || reviewTitle}
                    focusOnMount
                  />
                ) : (
                  <Dialog
                    open={dialogOpen}
                    onOpenChange={(open, details) => {
                      if (!open && commit.saving) details.cancel();
                      else setInviteOpen(open);
                    }}
                  >
                    <DialogTrigger
                      disabled={
                        commit.saving || (commit.pending && !invites.length)
                      }
                      render={
                        <Button
                          ref={inviteButton}
                          type="button"
                          variant="outline"
                          className="bg-secondary"
                        />
                      }
                    >
                      <UserRoundPlus
                        aria-hidden="true"
                        data-icon="inline-start"
                      />
                      Invite people
                    </DialogTrigger>
                    <DialogContent
                      finalFocus={inviteButton}
                      className={cn(
                        "w-[min(32rem,calc(100%-16px))]",
                        commit.saving && "[&>[data-slot=dialog-close]]:hidden",
                      )}
                    >
                      <DialogTitle>Invite people</DialogTitle>
                      <DialogDescription>
                        Sending creates the journey and invites the selected
                        people as Participants.
                      </DialogDescription>
                      <InviteComposer
                        title={title?.trim() || reviewTitle}
                        scope={scope}
                        open={dialogOpen}
                        suspended={commit.pending}
                        onClose={() => setInviteOpen(false)}
                        batchId={batchId}
                        dialogDraft={{
                          drafts: invites,
                          change: (drafts) =>
                            setInviteDraft({ batchId, drafts }),
                        }}
                      />
                      {dialogOpen && commit.feedback}
                      {!canCreate && !commit.pending && (
                        <p className="text-sm text-muted-foreground">
                          Finish reviewing your recordings before sending
                          invitations.
                        </p>
                      )}
                      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                        {commit.pending ? (
                          dialogOpen && commit.action
                        ) : (
                          <Button
                            type="button"
                            disabled={!canCreate || !invites.length}
                            onClick={() => createJourney(true)}
                          >
                            Send invitations
                          </Button>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          )}
          {renderRecordings({
            files: data?.files ?? [],
            select,
          })}
        </div>
      </div>
      {reviewTitle && batchId && (
        <footer className="grid min-w-0 gap-3 border-t border-border px-4 py-3 sm:px-6">
          {!dialogOpen && commit.feedback}
          {duplicateConflict && (
            <Alert variant="warning">
              <AlertDescription>
                Copies of the same recording have different section choices.
                Remove the copy you don’t want to save.
              </AlertDescription>
            </Alert>
          )}
          {missingRecordings && !commit.pending && (
            <Alert>
              <AlertDescription>
                More files may have been added to this batch.
              </AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  variant="outline"
                  disabled={syncing || review.isFetching}
                  onClick={() => void retryReview()}
                >
                  Refresh recordings
                </Button>
              </AlertAction>
            </Alert>
          )}
          {data &&
            !selectionComplete &&
            !duplicateConflict &&
            !missingRecordings &&
            !commit.pending && (
              <p className="text-sm text-muted-foreground">
                {emptyRecording
                  ? "Remove files with no included sections to continue."
                  : "Save once the remaining files are ready or removed."}
              </p>
            )}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />{" "}
              Private journey
            </span>
            {commit.pending ? (
              !dialogOpen && commit.action
            ) : (
              <Button
                type="button"
                size="lg"
                disabled={!canCreate}
                onClick={() => createJourney()}
              >
                Create journey
              </Button>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}

function RouteSummary({
  review,
  complete,
}: {
  review: RecordingBatchReview;
  complete: boolean;
}) {
  const heading = useId();
  const measurements = complete ? review.measurements : undefined;
  const distance = measurements?.distanceMetres ?? null;
  const elapsed = measurements?.elapsedSeconds ?? null;
  const gain = measurements?.elevationGainMetres ?? null;
  const low = measurements?.elevationMinMetres ?? null;
  const high = measurements?.elevationMaxMetres ?? null;
  const sections = review.files.reduce(
    (sum, file) => sum + file.sectionCount,
    0,
  );

  const metrics = measurements
    ? [
        [
          "Distance",
          distance === null
            ? null
            : `${distanceFormat.format(distance / 1000)} km`,
        ],
        [
          "Elapsed time",
          elapsed === null ? null : formatRecordingDuration(elapsed),
        ],
        [
          "Elevation gain",
          gain === null ? null : `${elevationFormat.format(gain)} m`,
        ],
        [
          "Elevation range",
          low === null || high === null
            ? null
            : low === high
              ? `${elevationFormat.format(high)} m`
              : `${elevationFormat.format(low)}–${elevationFormat.format(high)} m`,
        ],
      ]
    : [];

  return (
    <section
      aria-labelledby={heading}
      className="@container/route-stats grid min-w-0 gap-2 border-t border-border pt-3"
    >
      <h3 id={heading} className="font-semibold">
        Route stats
      </h3>
      {measurements && (
        <dl className="grid min-w-0 gap-x-4 gap-y-2 @min-[14rem]/route-stats:grid-cols-2 @min-[30rem]/route-stats:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div key={label} className="grid min-w-0 gap-0.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd
                className={cn(
                  "text-sm wrap-anywhere",
                  value === null
                    ? "text-muted-foreground"
                    : "font-semibold tabular-nums",
                )}
              >
                {value ?? "Unavailable"}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {distance === null && (
        <p className="text-sm text-muted-foreground">
          {sections} {sections === 1 ? "recorded section" : "recorded sections"}
          {review.files.length > 1 && <> across {review.files.length} files</>}
        </p>
      )}
    </section>
  );
}

export function BatchFileSections({
  scope,
  file,
  boundList,
}: {
  scope: AccountScope;
  file: ReviewedFile;
  boundList: boolean;
}) {
  const { refresh } = useSessionAccess();
  const page = useRef<HTMLDivElement>(null);
  const [cursors, setCursors] = useState<number[]>([]);
  const cursor = cursors.at(-1);
  const sections = useQuery({
    queryKey: [
      scope.accountId,
      "batch-sections",
      file.id,
      file.revision,
      cursor,
    ],
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const result = await scope.api.GET("/api/v1/imports/{id}/segments", {
        params: { path: { id: file.id }, query: { cursor } },
        signal,
      });
      return recordingSectionPage.parse(journeyResult(result, scope, refresh));
    },
  });
  useLayoutEffect(() => {
    const current = page.current;
    if (!current || document.activeElement !== current || sections.isPending)
      return;
    const target = sections.data && !sections.isError ? "h3" : "button";
    current.querySelector<HTMLElement>(target)?.focus();
  }, [sections.data, sections.isPending, sections.isError]);

  function paginate(next: number[]) {
    page.current?.focus({ preventScroll: true });
    setCursors(next);
  }

  const next = sections.data?.nextCursor ?? null;
  return (
    <div ref={page} tabIndex={-1} className="grid min-w-0 gap-2">
      {sections.isError ? (
        <JourneyRetry
          title="Couldn’t load the recording sections"
          busy={sections.isFetching}
          retry={() => void sections.refetch()}
        />
      ) : sections.data ? (
        <>
          <RecordingSections
            compact
            sections={sections.data.sections}
            scrollable={boundList && sections.data.sections.length > 2}
          />
          <SectionPagination
            previous={
              cursor === undefined
                ? undefined
                : () => paginate(cursors.slice(0, -1))
            }
            next={
              next === null ? undefined : () => paginate([...cursors, next])
            }
          />
        </>
      ) : (
        <JourneyLoading label="Loading recording sections" />
      )}
    </div>
  );
}

function BatchRoutePreview({
  scope,
  batchId,
  files,
  open,
  selectedFile,
  refreshReview,
  refreshing,
}: {
  scope: AccountScope;
  batchId: string;
  files: ReviewedFile[];
  open: boolean;
  selectedFile?: number;
  refreshReview: () => void;
  refreshing: boolean;
}) {
  const { refresh } = useSessionAccess();
  const overlay = useQuery({
    queryKey: [
      scope.accountId,
      "batch-overlay",
      batchId,
      files.map(({ id, revision }) => [id, revision]),
    ],
    enabled: open && files.length > 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0,
    queryFn: ({ signal }) => readBatchOverlay(scope, refresh, batchId, signal),
  });
  if (!open) return null;
  const positions = new Set(files.map((file) => file.position));
  const paths = overlay.data?.paths ?? [];
  const outOfSync =
    overlay.data &&
    (overlay.data.files.length !== files.length ||
      overlay.data.files.some(
        ({ id, revision }, index) =>
          files[index].id !== id || files[index].revision !== revision,
      ) ||
      paths.some(
        ({ series }) => series === undefined || !positions.has(series),
      ));
  const sampled =
    new Set(paths.map(({ section }) => section)).size <
    files.reduce((total, file) => total + file.sectionCount, 0);
  return (
    <div className="grid min-w-0 gap-3">
      {overlay.isError || outOfSync ? (
        <JourneyRetry
          title="Couldn’t show the current route preview"
          busy={overlay.isFetching || refreshing}
          retry={outOfSync ? refreshReview : () => void overlay.refetch()}
        />
      ) : !overlay.data ? (
        <JourneyLoading label="Loading recorded routes" />
      ) : paths.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          There are no recorded lines to show.
        </p>
      ) : (
        <RecordingRouteOverview
          overlay={overlay.data}
          selectedSeries={
            selectedFile !== undefined && positions.has(selectedFile)
              ? selectedFile
              : undefined
          }
        />
      )}
      {overlay.data &&
        paths.length > 0 &&
        !outOfSync &&
        !overlay.isError &&
        sampled && (
          <p className="text-sm text-muted-foreground">
            This preview shows a sample of the route. Open the section list to
            review all sections.
          </p>
        )}
    </div>
  );
}
