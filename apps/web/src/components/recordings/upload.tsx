import {
  gpxLimits,
  recordingFileName,
} from "@kairn/contracts/recording-limits";
import type { RecordingUpload } from "@kairn/contracts/recordings";
import { useEffect, useId, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { JourneyRequestError, journeyResult } from "@/lib/journey-api";
import {
  maxRecordingSize,
  recordingDigest,
  recordingSize,
  sendRecordingPart,
} from "@/lib/recording-api";
import {
  type RecordingDraft,
  recordingDraftKey,
  replaceRecordingDraft,
} from "@/lib/recording-draft";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";

export function RecordingUploadStep({
  scope,
  accountId,
  draft,
  journeyId,
  fixedJourney,
  priorToken,
  onDraft,
}: {
  scope: AccountScope;
  accountId: string;
  draft: RecordingDraft | undefined;
  journeyId?: string;
  fixedJourney?: string;
  priorToken?: string;
  onDraft: (next: RecordingDraft | undefined) => void;
}) {
  const { refresh } = useSessionAccess();
  const operation = useRef<AbortController>(null);
  const choose = useRef<HTMLInputElement>(null);
  const id = useId();
  const [phase, setPhase] = useState<
    "preparing" | "uploading" | "cancelling"
  >();
  const [upload, setUpload] = useState<RecordingUpload>();
  const [message, setMessage] = useState("");
  const [needsCancel, setNeedsCancel] = useState(false);
  const pending = phase !== undefined;

  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    if (fixedJourney) choose.current?.focus({ preventScroll: true });
  }, [fixedJourney]);

  function start(next: typeof phase) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setPhase(next);
    setMessage("");
    return AbortSignal.any([scope.signal, controller.signal]);
  }

  function finish() {
    operation.current = null;
    if (!scope.signal.aborted) setPhase(undefined);
  }

  async function chooseFile(file: File) {
    if (file.size === 0 || file.size > gpxLimits.bytes) {
      setMessage(
        file.size
          ? `Choose a GPX file up to ${maxRecordingSize}.`
          : "Choose a GPX file that contains a recording.",
      );
      return;
    }
    const signal = start("preparing");
    if (!signal) return;
    try {
      const bytes = await file.arrayBuffer();
      const sha256 = await recordingDigest(bytes);
      signal.throwIfAborted();
      if (draft?.uploadId && draft.input.sha256 !== sha256) {
        setMessage(
          "This file differs from the one being uploaded. Choose the original file or cancel that upload to start again.",
        );
        return;
      }
      const next: RecordingDraft = draft?.uploadId
        ? { ...draft, file: bytes }
        : {
            token: crypto.randomUUID(),
            file: bytes,
            journeyId,
            input: {
              protocolVersion: 1,
              kind: "gpx",
              deviceId: crypto.randomUUID(),
              commandId: crypto.randomUUID(),
              fileName: recordingFileName(file.name),
              byteLength: file.size,
              sha256,
            },
          };
      await writeDraft(signal, priorToken ?? draft?.token, next);
      signal.throwIfAborted();
      setUpload(undefined);
      onDraft(next);
    } catch {
      if (!signal.aborted)
        setMessage(
          "Couldn’t save your selection on this device. Free some space or enable browser storage and choose the file again.",
        );
    } finally {
      finish();
    }
  }

  async function writeDraft(
    signal: AbortSignal,
    token: string | undefined,
    next?: RecordingDraft,
  ) {
    await replaceRecordingDraft(accountId, token, next, fixedJourney);
    if (fixedJourney && signal.aborted && !scope.signal.aborted)
      void scope.queryClient.invalidateQueries({
        queryKey: recordingDraftKey(accountId, fixedJourney),
      });
  }

  async function transfer() {
    if (!draft?.file) return;
    const signal = start("uploading");
    if (!signal) return;
    try {
      let saved = draft;
      let pendingUpload = saved.uploadId
        ? journeyResult(
            await scope.api.GET("/api/v1/uploads/{id}", {
              params: { path: { id: saved.uploadId } },
              signal,
            }),
            scope,
            refresh,
          )
        : journeyResult(
            await scope.api.POST("/api/v1/uploads", {
              body: saved.input,
              signal,
            }),
            scope,
            refresh,
          );
      if (pendingUpload.state === "expired") {
        const next = {
          ...saved,
          token: crypto.randomUUID(),
          uploadId: undefined,
          input: { ...saved.input, commandId: crypto.randomUUID() },
        };
        await writeDraft(signal, saved.token, next);
        saved = next;
        signal.throwIfAborted();
        onDraft(saved);
        pendingUpload = journeyResult(
          await scope.api.POST("/api/v1/uploads", {
            body: saved.input,
            signal,
          }),
          scope,
          refresh,
        );
      }
      if (
        pendingUpload.state !== "uploading" &&
        pendingUpload.state !== "complete"
      ) {
        setMessage("This upload has closed. Cancel it to choose another file.");
        return;
      }
      saved = { ...saved, uploadId: pendingUpload.id, journeyId };
      await writeDraft(signal, saved.token, saved);
      signal.throwIfAborted();
      onDraft(saved);
      setUpload(pendingUpload);
      if (pendingUpload.state === "uploading") {
        const file =
          draft.file instanceof Blob ? draft.file : new Blob([draft.file]);
        const acknowledged = new Set(
          pendingUpload.parts.map((part) => part.partNumber),
        );
        const size = pendingUpload.partSize;
        for (
          let offset = 0, part = 1;
          offset < file.size;
          offset += size, part++
        ) {
          if (acknowledged.has(part)) continue;
          pendingUpload = await sendRecordingPart(
            scope,
            pendingUpload.id,
            part,
            file.slice(offset, offset + size),
            signal,
            refresh,
          );
          setUpload(pendingUpload);
        }
        pendingUpload = journeyResult(
          await scope.api.POST("/api/v1/uploads/{id}/complete", {
            params: { path: { id: pendingUpload.id } },
            signal,
          }),
          scope,
          refresh,
        );
      }
      if (!pendingUpload.importId) {
        setMessage(
          "The uploaded bytes didn’t match the selected file. Cancel the upload and choose the file again.",
        );
        return;
      }
      const next = { ...saved, importId: pendingUpload.importId, file: null };
      await writeDraft(signal, saved.token, next);
      signal.throwIfAborted();
      onDraft(next);
    } catch (error) {
      if (scope.signal.aborted) return;
      if (signal.aborted)
        setMessage(
          "Upload paused. You can resume from the last confirmed part.",
        );
      else if (error instanceof JourneyRequestError && error.status === 429)
        setMessage(
          "The upload limit was reached. Wait a minute, then try again.",
        );
      else
        setMessage(
          "Couldn’t finish the upload. Retry to continue from the last confirmed part.",
        );
    } finally {
      finish();
    }
  }

  async function cancel() {
    if (!draft) return;
    const signal = start("cancelling");
    if (!signal) return;
    try {
      const uploadId = draft.uploadId;
      if (uploadId) {
        const result = await scope.api.DELETE("/api/v1/uploads/{id}", {
          params: { path: { id: uploadId } },
          signal,
        });
        if (result.response.status === 409) {
          const recovered = journeyResult(
            await scope.api.GET("/api/v1/uploads/{id}", {
              params: { path: { id: uploadId } },
              signal,
            }),
            scope,
            refresh,
          );
          if (recovered.importId) {
            const next = { ...draft, importId: recovered.importId, file: null };
            await writeDraft(signal, draft.token, next);
            signal.throwIfAborted();
            onDraft(next);
            return;
          }
        }
        journeyResult(result, scope, refresh);
      }
      await writeDraft(signal, draft.token);
      signal.throwIfAborted();
      onDraft(undefined);
      setNeedsCancel(false);
      setUpload(undefined);
      setMessage("Upload cancelled.");
      requestAnimationFrame(() => choose.current?.focus());
    } catch {
      if (!signal.aborted)
        setMessage("Couldn’t confirm cancellation. Try again when connected.");
    } finally {
      finish();
    }
  }

  const acknowledged = upload?.parts.reduce(
    (sum, part) => sum + part.byteLength,
    0,
  );
  return (
    <section
      aria-labelledby={fixedJourney ? undefined : `${id}-choose`}
      className={
        fixedJourney
          ? "grid min-w-0 gap-4"
          : "grid min-w-0 gap-4 rounded-card control-border bg-card p-4 sm:p-5"
      }
    >
      {!fixedJourney && (
        <h2 id={`${id}-choose`} className="text-xl font-bold">
          Choose the file
        </h2>
      )}
      <Field>
        <FieldLabel htmlFor={`${id}-file`}>
          {draft ? "Choose another file" : "Choose GPX file"}
        </FieldLabel>
        <Input
          id={`${id}-file`}
          ref={choose}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          disabled={pending}
          aria-describedby={`${id}-file-help`}
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (file)
              void chooseFile(file).finally(() => {
                input.value = "";
              });
          }}
        />
        <p id={`${id}-file-help`} className="text-sm text-muted-foreground">
          GPX files up to {maxRecordingSize}. Only you can review this file
          before saving.
        </p>
      </Field>
      {draft && (
        <div className="grid min-w-0 gap-1">
          <p className="font-semibold wrap-anywhere">{draft.input.fileName}</p>
          <p className="text-sm text-muted-foreground">
            {recordingSize(draft.input.byteLength)} ·{" "}
            {draft.file
              ? "Saved on this device"
              : "Choose the original file to resume"}
          </p>
          {upload && (
            <p className="text-sm text-muted-foreground">
              Upload expires {new Date(upload.expiresAt).toLocaleString()}.
            </p>
          )}
        </div>
      )}
      {phase === "uploading" && (
        <div className="grid gap-2">
          <Progress
            aria-label="Upload progress"
            max={draft?.input.byteLength}
            value={acknowledged}
          />
          <p className="text-sm text-muted-foreground">
            {acknowledged === undefined
              ? "Starting private upload"
              : `${recordingSize(acknowledged)} acknowledged`}
          </p>
        </div>
      )}
      {phase === "preparing" && (
        <output className="text-sm">
          Saving the selected file on this device…
        </output>
      )}
      {message && (
        <Alert role="status">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {draft && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || !draft.file}
            focusableWhenDisabled
            onClick={() => void transfer()}
          >
            {phase === "uploading"
              ? "Uploading for review…"
              : draft.uploadId
                ? "Retry upload"
                : "Upload for review"}
          </Button>
          {phase === "uploading" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => operation.current?.abort()}
            >
              Pause upload
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setNeedsCancel(true)}
            >
              Cancel upload
            </Button>
          )}
        </div>
      )}
      {needsCancel && (
        <div className="grid gap-2 rounded-control border p-3">
          <p>Discard this upload and its saved selection on this device?</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void cancel()}
            >
              Discard upload
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNeedsCancel(false)}
            >
              Keep upload
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
