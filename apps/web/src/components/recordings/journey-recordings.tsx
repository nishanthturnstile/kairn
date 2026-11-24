import type { RecordingCommit } from "@kairn/contracts/recordings";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { journeyResult } from "@/lib/journey-api";
import { journeyRouteKey } from "@/lib/recording-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { JourneyRetry } from "../journeys/states";
import { AddRecordingDialog } from "./add-recording-dialog";
import { JourneyRecordingDetail } from "./journey-recording-detail";

export function JourneyRecordings({
  scope,
  journeyId,
  archived,
  embedded,
  addInitiallyOpen,
  onInitialAddOpen,
  suspension,
}: {
  scope: AccountScope;
  journeyId: string;
  archived: boolean;
  embedded?: boolean;
  addInitiallyOpen?: boolean;
  onInitialAddOpen?: () => void;
  suspension?: ReactNode;
}) {
  const { refresh } = useSessionAccess();
  const heading = useId();
  const panel = useRef<HTMLElement>(null);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const [detailsId, setDetailsId] = useState<string>();
  const [notice, setNotice] = useState("");
  const suspended = Boolean(suspension);
  const receiptKey = [scope.accountId, "recording-receipt", journeyId];
  const [receipt, setReceipt] = useState(() =>
    scope.queryClient.getQueryData<RecordingCommit>(receiptKey),
  );
  const listKey = [scope.accountId, "journey-recordings", journeyId];
  const list = useInfiniteQuery({
    queryKey: listKey,
    enabled: !suspended,
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: 30_000,
  });
  useLayoutEffect(() => {
    if (suspended) detailsHeading.current?.focus();
  }, [suspended]);
  if (
    !list.isError &&
    (!list.isFetchedAfterMount ||
      !list.data ||
      list.data.pages.every((page) => page === null))
  )
    return null;
  const items =
    list.isError && !suspended
      ? []
      : (list.data?.pages.flatMap((page) => page?.recordings ?? []) ?? []);
  const details = items.find((item) => item.id === detailsId);
  const receiptedItem = items.find(
    (item) => item.id === receipt?.associationId,
  );
  const status =
    notice ||
    (receipt && receiptedItem
      ? recordingReceipt({ ...receipt, scope: receiptedItem.scope })
      : undefined);

  async function refreshRecordings() {
    await Promise.all([
      scope.queryClient.invalidateQueries({ queryKey: listKey }),
      scope.queryClient.invalidateQueries({
        queryKey: journeyRouteKey(scope, journeyId),
      }),
    ]);
  }

  async function completed(result: RecordingCommit) {
    if (result.journeyId !== journeyId || scope.signal.aborted) return;
    scope.queryClient.setQueryData(receiptKey, result);
    setReceipt(undefined);
    setNotice(recordingReceipt(result));
    await refreshRecordings();
  }

  function restoreDetailsFocus() {
    const target = detailsTrigger.current?.isConnected
      ? detailsTrigger.current
      : panel.current;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && target?.contains(active))
        active.scrollIntoView({ block: "nearest" });
    });
    return target;
  }

  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-labelledby={heading}
      className={
        embedded
          ? "grid min-w-0 gap-3 border-t px-[min(0.75rem,4vw)] py-3 sm:px-4"
          : "grid min-w-0 gap-3 rounded-card control-border bg-card p-[min(1rem,4vw)] sm:p-5"
      }
    >
      <div
        className={
          embedded && archived
            ? "sr-only"
            : "flex min-w-0 flex-wrap items-center justify-between gap-2"
        }
      >
        <h2 id={heading} className={embedded ? "sr-only" : "text-xl font-bold"}>
          Recordings
        </h2>
        {!archived && (
          <div className="ms-auto min-w-0">
            <AddRecordingDialog
              scope={scope}
              journeyId={journeyId}
              initiallyOpen={addInitiallyOpen}
              onInitialOpen={onInitialAddOpen}
              onComplete={completed}
              suspension={suspension}
            />
          </div>
        )}
      </div>
      {!details && status && (
        <Alert role="status">
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}
      {list.isError ? (
        <JourneyRetry
          title="Couldn’t check recording access"
          busy={list.isFetching}
          retry={() => void list.refetch()}
        />
      ) : items.length ? (
        <ul className="divide-y divide-border" aria-label="Attached recordings">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2"
            >
              <div className="min-w-0 flex-[1_1_12rem]">
                <p className="font-semibold wrap-anywhere">{item.fileName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.sectionCount}{" "}
                  {item.sectionCount === 1 ? "section" : "sections"}
                  {" · "}
                  {item.scope === "only_me" ? "Only me" : "Journey review"}
                  {item.placedInDraft ? " · Included in the shared draft" : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-haspopup="dialog"
                aria-label={`Details for ${item.fileName}`}
                onClick={(event) => {
                  detailsTrigger.current = event.currentTarget;
                  setDetailsId(item.id);
                }}
              >
                Details
                <ChevronRight aria-hidden="true" data-icon="inline-end" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-muted-foreground">No recordings available.</p>
      )}
      {!list.isError && list.hasNextPage && (
        <Button
          type="button"
          className="justify-self-start"
          variant="outline"
          disabled={list.isFetchingNextPage}
          focusableWhenDisabled
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? "Loading recordings…" : "More recordings"}
        </Button>
      )}
      <Dialog
        open={Boolean(details)}
        onOpenChange={(open) => {
          if (!open) setDetailsId(undefined);
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setDetailsId(undefined);
        }}
      >
        <DialogContent
          initialFocus={detailsHeading}
          finalFocus={restoreDetailsFocus}
          className="w-[min(34rem,calc(100%-16px))]"
        >
          <DialogTitle ref={detailsHeading} tabIndex={-1}>
            {suspended
              ? "Recording details"
              : (details?.fileName ?? "Recording details")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Recorded sections and available recording controls.
          </DialogDescription>
          {suspension}
          {details && (
            <div hidden={suspended} inert={suspended}>
              <JourneyRecordingDetail
                key={details.id}
                item={details}
                scope={scope}
                journeyId={journeyId}
                archived={archived}
                changed={(message) => {
                  setNotice(message);
                  void refreshRecordings();
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function recordingReceipt(result: RecordingCommit) {
  const outcome =
    result.outcome === "created"
      ? "Journey created."
      : result.outcome === "already_added"
        ? "Recording already added."
        : "Recording added.";
  const audience =
    result.scope === "only_me"
      ? "Recording visible only to you."
      : "You, active coauthors and designated publishers can review the recording.";
  return `${outcome} ${audience}`;
}
