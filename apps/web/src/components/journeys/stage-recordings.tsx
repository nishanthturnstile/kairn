import { gpxBatchLimits, gpxLimits } from "@kairn/contracts/recording-limits";
import {
  type RecordingImport,
  recordingImport,
} from "@kairn/contracts/recordings";
import { useQueries } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import {
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { Progress } from "@/components/ui/progress";
import { journeyResult } from "@/lib/journey-api";
import { maxRecordingSize, recordingSize } from "@/lib/recording-api";
import { batchFileName } from "@/lib/recording-batch";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { type BatchCommit, BatchCommitGate } from "./batch-commit";
import {
  BatchFileSections,
  BatchReviewPanel,
  type ReviewedRecordings,
} from "./batch-review";
import {
  type BatchFile,
  type RestoredBatch,
  useBatchTransfer,
  useResumableBatch,
} from "./batch-transfer";
import { JourneyLoading, JourneyRetry } from "./states";

type RejectedFile = { id: string; name: string; message: string };
const batchSize = recordingSize(gpxBatchLimits.bytes);
const visibleRecordingCount = 3;

function addFiles(previous: BatchFile[], selected: File[]) {
  const files = [...previous];
  const rejected: RejectedFile[] = [];
  let bytes = files.reduce((sum, item) => sum + item.bytes, 0);
  for (const file of selected) {
    const id = crypto.randomUUID();
    let message: string | undefined;
    if (!/\.gpx$/i.test(file.name)) message = "Choose a .gpx file.";
    else if (!file.size) message = "This file is empty.";
    else if (file.size > gpxLimits.bytes)
      message = `This file exceeds ${maxRecordingSize}.`;

    if (!message) {
      if (files.length >= gpxBatchLimits.files)
        message = `You can add up to ${gpxBatchLimits.files} files.`;
      else if (bytes + file.size > gpxBatchLimits.bytes)
        message = `This selection would exceed ${batchSize}.`;
    }
    if (message) rejected.push({ id, name: file.name, message });
    else {
      files.push({ id, file, name: file.name, bytes: file.size });
      bytes += file.size;
    }
  }
  return { files, rejected };
}

type Props = {
  scope: AccountScope;
  chooseButton: RefObject<HTMLButtonElement | null>;
  visible: boolean;
  onSavePendingChange: (pending: boolean) => void;
  onTransferChange: (transferring: boolean) => void;
};

export function StageRecordings(props: Props) {
  return (
    <BatchCommitGate
      scope={props.scope}
      onSavePendingChange={props.onSavePendingChange}
    >
      {(commit) => <OpenRecordingStage {...props} commit={commit} />}
    </BatchCommitGate>
  );
}

function OpenRecordingStage(props: Props & { commit: BatchCommit }) {
  const recovered = useResumableBatch(props.scope);
  if (recovered.isFetching && !recovered.isFetchedAfterMount)
    return <JourneyLoading label="Checking your staged files" />;
  if (recovered.isError)
    return (
      <JourneyRetry
        title="Couldn’t open your recording batch"
        busy={recovered.isFetching}
        retry={() => void recovered.refetch()}
      />
    );
  return (
    <RecordingBatchStage
      {...props}
      initial={recovered.data}
      previousDraftUnavailable={recovered.previousDraftUnavailable}
    />
  );
}

function RecordingBatchStage({
  scope,
  chooseButton,
  initial,
  commit,
  visible,
  previousDraftUnavailable,
  onTransferChange,
}: Props & {
  initial: RestoredBatch | null | undefined;
  commit: BatchCommit;
  previousDraftUnavailable: boolean;
}) {
  const id = useId();
  const listId = useId();
  const fileList = useRef<HTMLUListElement>(null);
  const activeSections = useRef<HTMLElement>(null);
  const { refresh } = useSessionAccess();
  const {
    batchId,
    files,
    replaceFiles,
    currentFiles,
    start,
    pause,
    sending,
    remove,
    refreshBatch,
    updateFile,
    expiresAt,
  } = useBatchTransfer(scope, initial);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [pickerError, setPickerError] = useState(false);
  const [retrying, setRetrying] = useState<string>();
  const [recordingsOpen, setRecordingsOpen] = useState(true);
  const [sectionFile, setSectionFile] = useState<string>();
  const scrollable = files.length > visibleRecordingCount;
  const expiryWarning = useBatchExpiryWarning(expiresAt);
  const pauseRequested = useRef(false);
  const resumeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => onTransferChange(sending), [onTransferChange, sending]);
  useLayoutEffect(() => {
    const list = fileList.current;
    const sections = activeSections.current;
    if (
      !sectionFile ||
      !visible ||
      !recordingsOpen ||
      !scrollable ||
      !list ||
      !sections
    )
      return;
    // Reveal the details below the trigger without moving the page or focus.
    const bounds = list.getBoundingClientRect();
    const overflow = sections.getBoundingClientRect().top + 64 - bounds.bottom;
    if (overflow > 0) list.scrollTop += overflow;
  }, [sectionFile, visible, recordingsOpen, scrollable]);
  useEffect(() => {
    if (sending || !pauseRequested.current) return;
    pauseRequested.current = false;
    (resumeButton.current ?? chooseButton.current)?.focus();
  }, [chooseButton, sending]);
  const statuses = useQueries({
    queries: files.map((item) => {
      const importId = item.upload?.importId;
      return {
        queryKey: [scope.accountId, "batch-file", importId ?? item.id],
        enabled: Boolean(importId) && item.busy !== "removing",
        refetchOnMount: "always" as const,
        refetchOnWindowFocus: !commit.pending,
        refetchOnReconnect: !commit.pending,
        gcTime: 0,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          if (!importId) return null;
          const result = await scope.api.GET("/api/v1/imports/{id}", {
            params: { path: { id: importId } },
            signal,
          });
          return recordingImport.parse(journeyResult(result, scope, refresh));
        },
        refetchInterval: (query: {
          state: { data?: RecordingImport | null };
        }) => (query.state.data?.stage === "queued" ? 1000 : false),
      };
    }),
  });
  const ready = files.flatMap((item, index) => {
    const { data, isError } = statuses[index];
    return !item.busy && !isError && data?.stage === "ready"
      ? [{ id: data.id, revision: data.revision }]
      : [];
  });

  function select(picked: File[]) {
    if (commit.pending) return;
    const selection = addFiles(currentFiles(), picked);
    replaceFiles(selection.files);
    setRecordingsOpen(true);
    setRejected(selection.rejected);
    setPickerError(false);
  }

  async function removeFile(index: number) {
    if (!(await remove(files[index]))) return;
    const next = [...files.slice(index + 1), ...files.slice(0, index).reverse()]
      .map(({ id }) => document.getElementById(id))
      .find(
        (button) =>
          button instanceof HTMLButtonElement &&
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true" &&
          !button.closest("[hidden]"),
      );
    (next ?? chooseButton.current)?.focus();
  }

  async function retryReading(item: BatchFile) {
    const id = item.upload?.importId;
    if (!id || retrying) return;
    setRetrying(item.id);
    updateFile(item.id, { message: undefined });
    try {
      const response = await scope.api.POST("/api/v1/imports/{id}/retry", {
        params: { path: { id } },
        signal: scope.signal,
      });
      const recording = recordingImport.parse(
        journeyResult(response, scope, refresh),
      );
      scope.queryClient.setQueryData(
        [scope.accountId, "batch-file", id],
        recording,
      );
    } catch {
      if (!scope.signal.aborted)
        updateFile(item.id, {
          message: "Couldn’t retry reading this file. Try again.",
        });
    } finally {
      if (!scope.signal.aborted) setRetrying(undefined);
    }
  }

  const canSend = files.some(
    (file) =>
      file.file &&
      !file.busy &&
      (!file.upload || file.upload.state === "uploading"),
  );
  const selecting = files.length === 0;
  const reading = files.some(
    (item, index) =>
      !item.busy &&
      item.upload?.importId &&
      !statuses[index].isError &&
      (statuses[index].data?.stage === "queued" || !statuses[index].data),
  );

  function renderRecordings(review: ReviewedRecordings) {
    const inReview = ready.length > 0;
    const label = `Recordings · ${files.length} ${files.length === 1 ? "file" : "files"}`;
    const recordingsHeading = !selecting && (
      <h2 id={id} className={inReview ? "font-semibold" : "text-xl font-bold"}>
        {inReview ? (
          <Button
            type="button"
            variant="ghost"
            aria-controls={listId}
            aria-expanded={recordingsOpen}
            className="justify-start px-2 text-start"
            onClick={() => setRecordingsOpen((open) => !open)}
          >
            <ChevronDown
              aria-hidden="true"
              data-icon="inline-start"
              className={cn(!recordingsOpen && "-rotate-90")}
            />
            {label}
          </Button>
        ) : (
          label
        )}
      </h2>
    );
    return (
      <section
        aria-labelledby={id}
        className={cn(
          "@container/recordings grid min-w-0 content-start gap-3",
          inReview && "border-t border-border px-[min(1rem,4vw)] py-3 sm:px-6",
        )}
      >
        {!inReview && recordingsHeading}
        <Dropzone
          accept=".gpx"
          label="GPX files"
          leading={inReview ? recordingsHeading : undefined}
          heading={
            selecting && (
              <h2 id={id} className="text-xl font-bold">
                Add GPX files
              </h2>
            )
          }
          description={
            selecting
              ? "Drop recordings from the same trip here."
              : "Drop more GPX files here."
          }
          touchDescription={
            selecting
              ? "Choose recordings from the same trip."
              : "GPX files only."
          }
          hint={
            selecting
              ? `.gpx only · Up to ${gpxBatchLimits.files} files · ${maxRecordingSize} each · ${batchSize} total`
              : undefined
          }
          compact={!selecting}
          disabled={commit.pending}
          chooseRef={chooseButton}
          onFiles={select}
          onError={() => setPickerError(true)}
        />
        {previousDraftUnavailable && selecting && (
          <Alert>
            <AlertDescription>
              Your previous GPX draft is no longer available. Choose the files
              again to start a new draft.
            </AlertDescription>
          </Alert>
        )}
        {pickerError && (
          <Alert variant="warning">
            <AlertDescription>
              Couldn’t open those files. Try again.
            </AlertDescription>
          </Alert>
        )}
        {rejected.length > 0 && (
          <Alert variant="warning">
            <AlertDescription>
              <ul className="grid gap-1">
                {rejected.map(({ id, name, message }) => (
                  <li className="wrap-anywhere" key={id}>
                    <strong>{name}</strong> · {message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <p role="status" className="sr-only">
          {files.length} selected. {rejected.length} rejected.
        </p>
        {files.length > 0 && (
          <>
            <ul
              ref={fileList}
              id={listId}
              hidden={inReview && !recordingsOpen}
              aria-label="Selected GPX files"
              tabIndex={scrollable ? 0 : undefined}
              className={cn(
                "min-w-0 divide-y divide-border rounded-control border bg-card",
                scrollable &&
                  "h-[clamp(12rem,56dvh,21rem)] @min-[25rem]/recordings:h-[clamp(11rem,54dvh,16rem)] overflow-y-auto scroll-py-2 [scrollbar-color:var(--color-input)_transparent] [scrollbar-gutter:stable]",
              )}
            >
              {files.map((item, index) => {
                const reviewed = review.files.find(
                  ({ id }) => id === item.upload?.importId,
                );
                const sectionsOpen = reviewed?.id === sectionFile && !!reviewed;
                const sectionsId = `${listId}-${item.id}`;
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[min(0.75rem,3vw)] py-2"
                  >
                    <div className="grid min-w-0 flex-1 basis-full @min-[25rem]/recordings:basis-40 gap-0.5">
                      <span className="font-semibold wrap-anywhere">
                        {item.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {recordingSize(item.bytes)} ·{" "}
                        <span role="status">
                          {batchFileStatus(item, statuses[index])}
                        </span>
                        {reviewed && (
                          <>
                            {" · "}
                            {reviewed.sectionCount}{" "}
                            {reviewed.sectionCount === 1
                              ? "section"
                              : "sections"}
                          </>
                        )}
                      </span>
                      {item.message && (
                        <p
                          role="status"
                          className="text-sm wrap-anywhere text-warning"
                        >
                          {item.message}
                        </p>
                      )}
                      {item.busy === "transferring" && item.upload && (
                        <Progress
                          max={100}
                          value={Math.round(
                            (100 *
                              item.upload.parts.reduce(
                                (sum, part) => sum + part.byteLength,
                                0,
                              )) /
                              item.bytes,
                          )}
                          aria-label={`Upload progress for ${item.name}`}
                        />
                      )}
                    </div>
                    {!item.file &&
                      !item.busy &&
                      item.position !== undefined &&
                      (!item.upload || item.upload.state === "uploading") && (
                        <BatchReselect
                          item={item}
                          onChoose={(file) => {
                            if (
                              !/\.gpx$/i.test(file.name) ||
                              file.size !== item.bytes ||
                              (!item.upload &&
                                batchFileName(file.name) !==
                                  batchFileName(item.name))
                            ) {
                              updateFile(item.id, {
                                message:
                                  "Choose the original GPX file for this row.",
                              });
                              return;
                            }
                            updateFile(item.id, { file, message: undefined });
                          }}
                        />
                      )}
                    {statuses[index].isError && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={statuses[index].isFetching}
                        onClick={() => void statuses[index].refetch()}
                      >
                        Check again
                      </Button>
                    )}
                    {statuses[index].data?.stage === "failed" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(retrying) || Boolean(item.busy)}
                        onClick={() => void retryReading(item)}
                      >
                        {retrying === item.id ? "Retrying…" : "Retry reading"}
                      </Button>
                    )}
                    {reviewed && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="[@media(pointer:coarse)]:min-h-touch"
                        aria-expanded={sectionsOpen}
                        aria-controls={sectionsId}
                        aria-label={`${sectionsOpen ? "Hide" : "Show"} sections for ${item.name}`}
                        onClick={() => {
                          review.select(reviewed.position);
                          setSectionFile(
                            sectionsOpen ? undefined : reviewed.id,
                          );
                        }}
                      >
                        {sectionsOpen ? "Hide sections" : "Show sections"}
                      </Button>
                    )}
                    <Button
                      id={item.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="[@media(pointer:coarse)]:min-h-touch"
                      aria-label={`Remove ${item.name}`}
                      disabled={
                        commit.pending ||
                        retrying === item.id ||
                        item.busy === "removing" ||
                        (item.busy === "transferring" && !item.upload)
                      }
                      onClick={() => void removeFile(index)}
                    >
                      Remove
                    </Button>
                    {reviewed && (
                      <section
                        ref={sectionsOpen ? activeSections : undefined}
                        id={sectionsId}
                        hidden={!sectionsOpen}
                        aria-label={`Sections for ${item.name}`}
                        className="mt-2 grid min-h-16 min-w-0 basis-full gap-2 rounded-control border border-border bg-muted/35 p-[min(0.75rem,3vw)]"
                      >
                        {sectionsOpen && (
                          <BatchFileSections
                            key={`${reviewed.id}:${reviewed.revision}`}
                            scope={scope}
                            file={reviewed}
                            boundList={!scrollable}
                          />
                        )}
                      </section>
                    )}
                  </li>
                );
              })}
            </ul>
            {expiryWarning && expiresAt && (
              <Alert variant="warning">
                <AlertDescription>
                  Temporary files expire{" "}
                  <time dateTime={expiresAt}>
                    {new Date(expiresAt).toLocaleString()}
                  </time>
                  .
                </AlertDescription>
              </Alert>
            )}
            {sending ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground" role="status">
                  Uploading for review…
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    pauseRequested.current = true;
                    pause();
                  }}
                >
                  Pause upload
                </Button>
              </div>
            ) : (
              canSend && (
                <div className="grid justify-items-start gap-2">
                  {files.every((file) => !file.upload) && (
                    <p className="text-sm text-muted-foreground">
                      Files stay on this device until you upload them for
                      review.
                    </p>
                  )}
                  <Button
                    ref={resumeButton}
                    type="button"
                    size="lg"
                    onClick={() => void start()}
                  >
                    {files.some(
                      (file) => file.file && file.upload?.state === "uploading",
                    )
                      ? "Resume upload"
                      : "Upload for review"}
                  </Button>
                </div>
              )
            )}
            {reading && !ready.length && !sending && (
              <JourneyLoading label="Reading recordings and preparing the route preview" />
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <BatchReviewPanel
      scope={scope}
      batchId={batchId}
      ready={ready}
      selectionKey={files.map((item) => [
        item.id,
        item.upload?.importId,
        item.busy === "removing",
      ])}
      selectionReady={
        files.length > 0 && files.length === ready.length && !sending
      }
      commit={commit}
      refreshBatch={refreshBatch}
      visible={visible}
      renderRecordings={renderRecordings}
    />
  );
}

const expiryWarningLead = 60 * 60_000;

function useBatchExpiryWarning(expiresAt?: string) {
  const [warning, setWarning] = useState(false);
  useEffect(() => {
    setWarning(false);
    if (!expiresAt) return;
    const delay = Date.parse(expiresAt) - Date.now() - expiryWarningLead;
    if (delay <= 0) {
      setWarning(true);
      return;
    }
    const timeout = window.setTimeout(() => setWarning(true), delay);
    return () => window.clearTimeout(timeout);
  }, [expiresAt]);
  return warning;
}

function BatchReselect({
  item,
  onChoose,
}: {
  item: BatchFile;
  onChoose: (file: File) => void;
}) {
  const choose = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={choose}
        type="file"
        accept=".gpx"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onChoose(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Choose original file for ${item.name}`}
        onClick={() => choose.current?.click()}
      >
        Choose original file
      </Button>
    </>
  );
}

function batchFileStatus(
  item: BatchFile,
  status: { data?: RecordingImport | null; isError: boolean },
) {
  if (item.busy === "removing") return "Removing";
  if (item.busy === "queued") return "Waiting to upload";
  if (item.busy === "transferring") return "Uploading privately";
  if (item.upload?.state === "uploading")
    return item.file
      ? "Upload paused"
      : "Choose the original file again to resume";
  if (item.upload?.state === "rejected") return "File could not be verified";
  if (item.upload?.state === "expired" || item.upload?.state === "aborted")
    return "Upload expired";
  if (!item.upload?.importId)
    return !item.file && item.position !== undefined
      ? "Choose the file again to continue"
      : "On this device";
  if (status.isError) return "Couldn’t check the recording";
  if (status.data?.stage === "ready") return "Ready for review";
  if (status.data?.stage === "rejected")
    return "This file doesn’t contain a supported GPX recording";
  if (status.data?.stage === "failed") return "Couldn’t read the recording";
  return "Reading GPX";
}
