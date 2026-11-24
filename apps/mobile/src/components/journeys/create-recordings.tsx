import { createdJourney } from "@kairn/contracts/journeys";
import { gpxBatchLimits } from "@kairn/contracts/recording-limits";
import type { CommitRecordingBatch } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useFocusEffect, useRouter } from "expo-router";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, type Pressable, View } from "react-native";
import { ensureActive } from "../../api";
import { historyKey, journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import { recordingRequestMessage, recordingSize } from "../../recording-api";
import {
  pickNativeBatchFiles,
  removeNativeBatchFile,
  uploadNativeBatchFile,
} from "../../recording-batch";
import type { VerifiedMobileScope } from "../../session";
import {
  copyNativeBatchFile,
  type NativeBatch,
  type NativeBatchFile,
  readNativeBatch,
  saveNativeBatch,
} from "../../storage/recording-batch";
import { recordingWifiOnly } from "../../storage/recording-import";
import { dashboardKey } from "../../workspace-keys";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import {
  NativeRecordingReview,
  useNativeBatchReview,
} from "./create-recording-review";
import { JourneyRetry, journeyStyles } from "./states";

const batchKey = ["native-recording-batch"] as const;
type Operation = "picker" | "upload" | "remove" | "save" | "review";

export function useNativeRecordingBatch(
  scope: VerifiedMobileScope,
  enabled: boolean,
) {
  return useQuery({
    queryKey: batchKey,
    enabled,
    refetchOnMount: "always",
    queryFn: async () => (await readNativeBatch(scope)) ?? null,
  });
}

export function CreateJourneyRecordings({
  scope,
  visible,
  onBusyChange,
  local,
}: {
  scope: VerifiedMobileScope;
  visible: boolean;
  onBusyChange: (busy: boolean) => void;
  local: ReturnType<typeof useNativeRecordingBatch>;
}) {
  const router = useRouter();
  const { refresh, canSubmit } = useMobileSession();
  const operation = useRef<AbortController>(null);
  const repeatedChoice = useRef(false);
  const chooseButton = useRef<ComponentRef<typeof Pressable>>(null);
  const focused = useRef(false);
  const [busy, setBusy] = useState<Operation>();
  const [notification, setNotification] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ id: string; bytes?: number }>();
  const draft =
    local.isFetchedAfterMount && !local.isError ? (local.data ?? null) : null;
  const review = useNativeBatchReview(scope, draft, visible);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        operation.current?.abort();
      };
    }, []),
  );

  useEffect(() => {
    if (!visible) {
      repeatedChoice.current = true;
      return;
    }
    if (!repeatedChoice.current || !local.isFetchedAfterMount) return;
    repeatedChoice.current = false;
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (active && enabled && chooseButton.current)
          AccessibilityInfo.sendAccessibilityEvent(
            chooseButton.current,
            "focus",
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [local.isFetchedAfterMount, visible]);

  function update(next: NativeBatch | undefined) {
    if (!scope.signal.aborted)
      scope.queryClient.setQueryData(batchKey, next ?? null);
  }

  function reportFile(id: string, message: string) {
    setErrors((previous) => ({ ...previous, [id]: message }));
  }

  async function run(
    kind: Operation,
    action: (signal: AbortSignal) => Promise<void>,
    fallback: string,
  ) {
    if (operation.current || !focused.current || scope.signal.aborted) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(kind);
    onBusyChange(true);
    setNotification(undefined);
    try {
      await action(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted && !scope.signal.aborted)
        setNotification(recordingRequestMessage(error, fallback));
    } finally {
      operation.current = null;
      setProgress(undefined);
      setBusy(undefined);
      onBusyChange(false);
    }
  }

  function choose(replacing?: NativeBatchFile) {
    void run(
      "picker",
      async (signal) => {
        let saved = draft ?? undefined;
        const picked = await pickNativeBatchFiles(!replacing);
        if (replacing) {
          const [file] = picked;
          if (!file) return;
          ensureActive(signal);
          update(
            await copyNativeBatchFile(scope, saved, file, signal, replacing),
          );
          reportFile(replacing.id, "");
          return;
        }
        const rejected: string[] = [];
        let failures = 0;
        for (const file of picked) {
          ensureActive(signal);
          try {
            saved = await copyNativeBatchFile(scope, saved, file, signal);
            update(saved);
          } catch (error) {
            ensureActive(signal);
            ensureActive(scope.signal);
            failures++;
            if (rejected.length < 5)
              rejected.push(
                `${file.name} · ${error instanceof Error ? error.message : "Couldn’t copy this file."}`,
              );
          }
        }
        if (failures > rejected.length)
          rejected.push(
            `${failures - rejected.length} more files could not be added.`,
          );
        if (rejected.length) setNotification(rejected.join("\n"));
      },
      replacing
        ? "Couldn’t use that copy. Choose the original GPX file."
        : "Couldn’t open or save the files. Try again.",
    );
  }

  function upload(target?: NativeBatchFile) {
    if (!draft || !canSubmit(scope)) return;
    void run(
      "upload",
      async (signal) => {
        const wifiOnly = await recordingWifiOnly(scope);
        let current = draft;
        if (current.expiresAt && Date.parse(current.expiresAt) <= Date.now()) {
          const rotated = await saveNativeBatch(scope, current, {
            ...current,
            id: randomUUID(),
            expiresAt: undefined,
            files: current.files.map((file) => ({
              ...file,
              input: undefined,
              uploadId: undefined,
              importId: undefined,
            })),
          });
          if (!rotated)
            throw new Error("The recording draft could not be renewed.");
          current = rotated;
          update(current);
        }
        for (const file of current.files) {
          ensureActive(signal);
          if (current.expiresAt && Date.parse(current.expiresAt) <= Date.now())
            break;
          if (file.importId || (target && target.id !== file.id)) continue;
          reportFile(file.id, "");
          setProgress({ id: file.id });
          try {
            await uploadNativeBatchFile({
              scope,
              current,
              file,
              wifiOnly,
              signal,
              refresh,
              update(next) {
                current = next;
                update(next);
              },
              progress(receipt) {
                const bytes = receipt.parts.reduce(
                  (total, part) => total + part.byteLength,
                  0,
                );
                setProgress({ id: file.id, bytes });
              },
            });
          } catch (error) {
            ensureActive(signal);
            ensureActive(scope.signal);
            reportFile(
              file.id,
              recordingRequestMessage(
                error,
                error instanceof Error &&
                  error.message === "Choose the original recording again."
                  ? error.message
                  : "Couldn’t upload this file. Try again to resume.",
              ),
            );
          }
        }
      },
      "Couldn’t finish the upload. Try again to resume.",
    );
  }

  function remove(file: NativeBatchFile) {
    if (!draft || (file.input && !canSubmit(scope))) return;
    void run(
      "remove",
      async (signal) => {
        update(
          await removeNativeBatchFile(scope, draft, file, refresh, signal),
        );
        reportFile(file.id, "");
      },
      "Couldn’t remove the recording. Try again.",
    );
  }

  function retryReading(file: NativeBatchFile) {
    const id = file.importId;
    if (!id || !canSubmit(scope)) return;
    void run(
      "review",
      async (signal) => {
        journeyResult(
          await scope.api.POST("/api/v1/imports/{id}/retry", {
            params: { path: { id } },
            signal,
          }),
          scope,
          refresh,
        );
        await review.status(id)?.refetch();
      },
      "Couldn’t restart the recording review.",
    );
  }

  function save(body: CommitRecordingBatch) {
    if (!draft || !canSubmit(scope)) return;
    void run(
      "save",
      async (signal) => {
        const attempt = draft.attempt ?? body;
        const saved = draft.attempt
          ? draft
          : await saveNativeBatch(scope, draft, { ...draft, attempt });
        if (!saved) throw new Error("The save attempt could not be recorded.");
        update(saved);
        ensureActive(signal);
        const result = await scope.api.POST(
          "/api/v1/recording-batches/{id}/commit",
          {
            params: { path: { id: saved.id } },
            body: attempt,
            signal,
          },
        );
        if (
          [404, 409, 412].includes(result.response.status) &&
          result.error?.code !== "account_changed" &&
          !scope.signal.aborted
        ) {
          update(
            await saveNativeBatch(scope, saved, {
              ...saved,
              attempt: undefined,
            }),
          );
          setNotification(
            "The recording batch changed. Check the files and try again.",
          );
          void review.retry();
          return;
        }
        const journey = createdJourney.parse(
          journeyResult(result, scope, refresh),
        );
        ensureActive(signal);
        update(
          await saveNativeBatch(
            scope,
            saved,
            undefined,
            saved.files.map((file) => file.copyId),
          ),
        );
        void scope.queryClient.invalidateQueries({ queryKey: historyKey });
        void scope.queryClient.invalidateQueries({ queryKey: dashboardKey });
        if (focused.current && canSubmit(scope))
          router.replace({
            pathname: "/journeys/[journeyId]",
            params: { journeyId: journey.id },
          });
      },
      "Couldn’t confirm the save. Try again to open the same journey.",
    );
  }

  if (local.isError)
    return (
      <JourneyRetry
        text="Couldn’t open your saved recordings."
        busy={local.isFetching}
        retry={() => void local.refetch()}
      />
    );
  if (!local.isFetchedAfterMount)
    return <AppText text="Checking for staged recordings" subdued />;
  if (draft?.attempt)
    return (
      <Panel>
        <AppText
          text="Finishing your journey save"
          variant="section"
          accessibilityRole="header"
        />
        {notification && (
          <StatusNotice notice={{ text: notification, tone: "error" }} />
        )}
        <Action
          label={busy === "save" ? "Checking save…" : "Retry save"}
          disabled={Boolean(busy)}
          variant="primary"
          onPress={() => {
            if (draft.attempt) save(draft.attempt);
          }}
        />
      </Panel>
    );

  const files = draft?.files ?? [];
  const expired = Boolean(
    draft?.expiresAt && Date.parse(draft.expiresAt) <= Date.now(),
  );
  return (
    <View style={journeyStyles.group}>
      <Panel compact={files.length > 0}>
        <AppText
          text={files.length ? "Recordings" : "Add GPX files"}
          variant="section"
          accessibilityRole="header"
        />
        {!files.length && (
          <AppText
            text={`Choose recordings from the same trip. Up to ${gpxBatchLimits.files} files, 50 MiB per file and 200 MiB total.`}
            subdued
          />
        )}
        <Action
          ref={chooseButton}
          label={files.length ? "Add files" : "Choose files"}
          variant={files.length ? "secondary" : "primary"}
          disabled={Boolean(busy)}
          onPress={() => choose()}
        />
      </Panel>
      {notification && (
        <StatusNotice notice={{ text: notification, tone: "warning" }} />
      )}
      {expired && (
        <StatusNotice
          notice={{
            text: "The uploaded draft expired. Upload again to review the copies on this device.",
            tone: "warning",
          }}
        />
      )}
      {files.map((file) => {
        const status =
          file.importId && !expired ? review.status(file.importId) : undefined;
        const stage = status?.data?.stage;
        const active = progress?.id === file.id;
        const state = active
          ? progress.bytes === undefined
            ? "Preparing upload"
            : `Uploaded ${recordingSize(progress.bytes)}`
          : status?.isError
            ? "Couldn’t check the recording"
            : stage === "ready"
              ? "Ready for review"
              : stage === "rejected"
                ? "This file doesn’t contain a supported GPX recording"
                : stage === "failed"
                  ? "Couldn’t read this recording"
                  : file.importId && !expired
                    ? "Reading recording"
                    : file.uploadId && !expired
                      ? "Upload paused"
                      : "On this device";
        return (
          <Panel compact key={file.id}>
            <AppText text={file.name} variant="label" />
            <AppText text={`${recordingSize(file.bytes)} · ${state}`} subdued />
            {errors[file.id] && (
              <StatusNotice
                notice={{ text: errors[file.id], tone: "warning" }}
              />
            )}
            {errors[file.id] && !file.importId && (
              <>
                <Action
                  label="Retry upload"
                  accessibilityLabel={`Retry upload for ${file.name}`}
                  disabled={Boolean(busy)}
                  onPress={() => upload(file)}
                />
                <Action
                  label="Choose original file"
                  accessibilityLabel={`Choose original file for ${file.name}`}
                  disabled={Boolean(busy)}
                  onPress={() => choose(file)}
                />
              </>
            )}
            {stage === "failed" && (
              <Action
                label="Retry reading"
                accessibilityLabel={`Retry reading ${file.name}`}
                disabled={Boolean(busy)}
                onPress={() => retryReading(file)}
              />
            )}
            {status?.isError && (
              <Action
                label="Check status again"
                disabled={Boolean(busy)}
                onPress={() => void status.refetch()}
              />
            )}
            <Action
              label="Remove"
              variant="text"
              accessibilityLabel={`Remove ${file.name}`}
              disabled={Boolean(busy)}
              onPress={() => remove(file)}
            />
          </Panel>
        );
      })}
      {busy === "upload" ? (
        <Action
          label="Pause upload"
          onPress={() => operation.current?.abort()}
        />
      ) : (
        (expired || files.some((file) => !file.importId)) && (
          <Action
            label="Upload for review"
            variant="primary"
            disabled={Boolean(busy)}
            onPress={() => upload()}
          />
        )
      )}
      {draft && !expired && (
        <NativeRecordingReview
          key={draft.id}
          scope={scope}
          batch={draft}
          review={review}
          busy={Boolean(busy)}
          save={save}
        />
      )}
    </View>
  );
}
