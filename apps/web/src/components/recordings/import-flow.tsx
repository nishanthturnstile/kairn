import type {
  GpxIssue,
  RecordingCommit,
  RecordingImport,
} from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { JourneyLoading, JourneyRetry } from "@/components/journeys/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "@/lib/journey-api";
import { importsKey } from "@/lib/recording-api";
import {
  clearRecordingCommit,
  type RecordingDraft,
  readRecordingCommit,
  readRecordingDraft,
  recordingDraftKey,
  replaceRecordingDraft,
} from "@/lib/recording-draft";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { RecordingReview } from "./review";
import { RecordingUploadStep } from "./upload";

const issues: Record<GpxIssue, string> = {
  unsupported_gpx: "Choose a GPX 1.0 or 1.1 file.",
  unsupported_encoding:
    "This file uses an unsupported encoding. Export it as a UTF-8 GPX file.",
  malformed_xml:
    "This GPX file is incomplete or damaged. Export or choose another copy.",
  xml_declaration_forbidden:
    "This file uses a document declaration. Export or choose another GPX file.",
  byte_limit: "This file is larger than the supported limit.",
  depth_limit: "The GPX file is nested too deeply.",
  track_limit:
    "This file contains too many tracks. Export fewer tracks at a time.",
  segment_limit:
    "This file contains too many segments. Export a smaller recording.",
  section_limit: "This file has too many breaks. Export a smaller recording.",
  token_limit:
    "This file contains an oversized GPX field. Export a smaller recording.",
  point_limit:
    "This file exceeds the 500,000-point limit. Export fewer points at a time.",
  no_recorded_path:
    "This file has no continuous recorded section with two usable track points.",
};

type ImportLayout = {
  children: ReactNode;
  targetId?: string;
  reviewed: boolean;
};

export function useRecordingDraft(
  accountId: string,
  journeyId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: recordingDraftKey(accountId, journeyId),
    queryFn: async () =>
      (await readRecordingDraft(accountId, journeyId)) ?? null,
    refetchOnMount: "always",
    enabled,
  });
}

export function RecordingImportFlow({
  scope,
  accountId,
  importId,
  initialJourney,
  fixedJourney,
  fresh,
  editOnly = false,
  onEntryChange,
  onComplete,
  layout,
}: {
  scope: AccountScope;
  accountId: string;
  importId?: string;
  initialJourney?: string;
  fixedJourney?: string;
  fresh?: boolean;
  editOnly?: boolean;
  onEntryChange?: (importId?: string, journeyId?: string) => void;
  onComplete: (result: RecordingCommit) => void;
  layout?: (state: ImportLayout) => ReactNode;
}) {
  const { refresh } = useSessionAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedElsewhere, setSavedElsewhere] = useState(false);
  const draftKey = recordingDraftKey(accountId, fixedJourney);
  const draft = useRecordingDraft(accountId, fixedJourney);
  const stored =
    !draft.isError && draft.isFetchedAfterMount ? draft.data : null;
  const local =
    stored &&
    (!initialJourney || stored.journeyId === initialJourney) &&
    (!importId || stored.importId === importId) &&
    (!fresh || !stored.importId)
      ? stored
      : undefined;
  const entryId = importId ?? local?.importId;
  const targetId = fixedJourney ?? initialJourney ?? local?.journeyId;
  const entryKey = [accountId, "recording-import", entryId];
  const entry = useQuery<RecordingImport>({
    queryKey: entryKey,
    enabled: Boolean(entryId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (query) =>
      query.state.data?.stage === "queued" ? 1000 : false,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}", {
          params: { path: { id: entryId ?? "" } },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  const readable =
    entry.isError || (fixedJourney && !entry.isFetchedAfterMount)
      ? undefined
      : entry.data;
  const recovered = useQuery({
    queryKey: [accountId, "recording-commit-result", entryId],
    enabled: Boolean(!editOnly && readable?.consumed),
    staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!entryId) throw new Error("Missing recording import.");
      const result = journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/result", {
          params: { path: { id: entryId } },
          signal,
        }),
        scope,
        refresh,
      );
      signal.throwIfAborted();
      // The import is already consumed. Its verified receipt replaces the local command.
      if (!fixedJourney || result.journeyId === fixedJourney) {
        await readRecordingCommit(accountId, entryId)
          .then((attempt) =>
            attempt && !scope.signal.aborted
              ? clearRecordingCommit(accountId, entryId, attempt.commandId)
              : undefined,
          )
          .catch(() => {});
      }
      return result;
    },
    refetchOnMount: "always",
  });
  const receipt =
    recovered.isError || (fixedJourney && !recovered.isFetchedAfterMount)
      ? undefined
      : recovered.data;
  const unavailable = (cause: unknown) =>
    cause instanceof JourneyRequestError && cause.status === 404;

  function updateDraft(next: RecordingDraft | undefined) {
    scope.queryClient.setQueryData(draftKey, next ?? null);
    if (next?.importId) {
      void scope.queryClient.invalidateQueries({ queryKey: importsKey(scope) });
      onEntryChange?.(next.importId, next.journeyId);
    }
  }

  async function another() {
    setError("");
    try {
      if (local && local.importId === entryId) {
        await replaceRecordingDraft(
          accountId,
          local.token,
          undefined,
          fixedJourney,
        );
        updateDraft(undefined);
      }
      setSavedElsewhere(false);
      onEntryChange?.(undefined, targetId);
    } catch {
      setError(
        "Couldn’t update the saved selection on this device. Try again.",
      );
    }
  }

  async function retryProcessing() {
    if (!entryId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = journeyResult(
        await scope.api.POST("/api/v1/imports/{id}/retry", {
          params: { path: { id: entryId } },
          signal: scope.signal,
        }),
        scope,
        refresh,
      );
      scope.queryClient.setQueryData(entryKey, response);
    } catch {
      if (!scope.signal.aborted)
        setError("Couldn’t retry processing. Try again when connected.");
    } finally {
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  function completed(result: RecordingCommit) {
    if (fixedJourney && result.journeyId !== fixedJourney) {
      setSavedElsewhere(true);
      return;
    }
    if (local && local.importId === entryId)
      void replaceRecordingDraft(
        accountId,
        local.token,
        undefined,
        fixedJourney,
      )
        .then(() => updateDraft(undefined))
        .catch(() => {});
    void scope.queryClient.invalidateQueries({ queryKey: historyKey(scope) });
    void scope.queryClient.invalidateQueries({ queryKey: importsKey(scope) });
    onComplete(result);
  }

  let steps: ReactNode;
  if (
    savedElsewhere ||
    (fixedJourney && receipt && receipt.journeyId !== fixedJourney)
  ) {
    steps = (
      <div className="grid justify-items-start gap-3">
        <Alert>
          <AlertDescription>
            The original is saved in Your recordings. Its attachment to this
            journey is unavailable.
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={() => void another()}>
          Choose another file
        </Button>
      </div>
    );
  } else if (entryId) {
    if (entry.isError) {
      steps = (
        <div className="grid justify-items-start gap-3">
          <JourneyRetry
            title="Couldn’t load the private import"
            busy={entry.isFetching}
            retry={() => void entry.refetch()}
          />
          {fixedJourney && unavailable(entry.error) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void another()}
            >
              Choose another file
            </Button>
          )}
        </div>
      );
    } else if (readable?.consumed && !editOnly) {
      if (recovered.isError) {
        steps = (
          <div className="grid justify-items-start gap-3">
            <JourneyRetry
              title="Couldn’t recover the saved recording"
              busy={recovered.isFetching}
              retry={() => void recovered.refetch()}
            />
            {fixedJourney && unavailable(recovered.error) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void another()}
              >
                Choose another file
              </Button>
            )}
          </div>
        );
      } else if (receipt) {
        steps = (
          <section className="grid max-w-2xl justify-items-start gap-3">
            <Alert role="status">
              <AlertDescription>
                {fixedJourney
                  ? "Recording added to this journey."
                  : "Recording saved."}
              </AlertDescription>
            </Alert>
            <Button type="button" onClick={() => completed(receipt)}>
              {fixedJourney ? "Done" : "Open saved recording"}
            </Button>
            {!fixedJourney && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void another()}
              >
                Import another GPX
              </Button>
            )}
          </section>
        );
      } else {
        steps = <JourneyLoading label="Recovering the saved recording" />;
      }
    } else if (readable?.stage === "ready") {
      steps = (
        <RecordingReview
          key={readable.id}
          scope={scope}
          accountId={accountId}
          entry={readable}
          initialJourney={targetId}
          fixedJourney={fixedJourney}
          onComplete={completed}
          onChooseAnother={() => void another()}
          editOnly={editOnly}
        />
      );
    } else if (readable) {
      steps = (
        <RecordingProcessing
          key={readable.id}
          entry={readable}
          busy={busy}
          embedded={Boolean(fixedJourney)}
          onRetry={() => void retryProcessing()}
          onChooseAnother={() => void another()}
        />
      );
    } else {
      steps = <JourneyLoading label="Checking the private upload" />;
    }
  } else if (draft.isError) {
    steps = (
      <JourneyRetry
        title="Couldn’t load your saved selection"
        busy={draft.isFetching}
        retry={() => void draft.refetch()}
      />
    );
  } else if (!draft.isFetchedAfterMount) {
    steps = <JourneyLoading label="Checking saved selection" />;
  } else {
    steps = (
      <div className="grid max-w-2xl min-w-0 gap-3">
        {!fixedJourney && (
          <p className="text-sm text-muted-foreground">
            {targetId
              ? "Destination: existing journey. You can change it before saving."
              : "Destination: new journey. You can choose an existing journey before saving."}
          </p>
        )}
        <RecordingUploadStep
          scope={scope}
          accountId={accountId}
          draft={local}
          journeyId={targetId}
          fixedJourney={fixedJourney}
          priorToken={stored?.token}
          onDraft={updateDraft}
        />
      </div>
    );
  }

  const children = (
    <>
      {error && (
        <Alert role="status">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {steps}
    </>
  );
  return layout
    ? layout({ children, targetId, reviewed: readable?.stage === "ready" })
    : children;
}

function RecordingProcessing({
  entry,
  busy,
  embedded,
  onRetry,
  onChooseAnother,
}: {
  entry: RecordingImport;
  busy: boolean;
  embedded: boolean;
  onRetry: () => void;
  onChooseAnother: () => void;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (embedded) heading.current?.focus({ preventScroll: true });
  }, [embedded]);

  return (
    <section
      className={
        embedded
          ? "grid min-w-0 gap-4"
          : "grid min-w-0 max-w-2xl gap-4 rounded-card control-border bg-card p-4 sm:p-5"
      }
      aria-labelledby={id}
    >
      <h2 ref={heading} id={id} tabIndex={-1} className="text-xl font-bold">
        Uploaded privately
      </h2>
      <p className="font-semibold wrap-anywhere">{entry.fileName}</p>
      {entry.stage === "queued" ? (
        <JourneyLoading label="Reading recording" />
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            {entry.issue
              ? issues[entry.issue]
              : "Couldn’t finish reading the recording. Your uploaded file is still available."}
            {entry.issue === "no_recorded_path" && entry.diagnostics && (
              <>
                {" "}
                This file has {entry.diagnostics.ignoredRoutes} planned routes
                and {entry.diagnostics.ignoredWaypoints} standalone waypoints.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {entry.stage === "failed" && (
          <Button
            type="button"
            disabled={busy}
            focusableWhenDisabled
            onClick={onRetry}
          >
            {busy ? "Starting processing…" : "Retry processing"}
          </Button>
        )}
        {entry.stage !== "queued" && (
          <Button type="button" variant="outline" onClick={onChooseAnother}>
            Choose another file
          </Button>
        )}
      </div>
    </section>
  );
}
