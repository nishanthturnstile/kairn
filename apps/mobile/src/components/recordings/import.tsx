import type {
  RecordingCommit,
  RecordingImport,
  RecordingUpload,
} from "@kairn/contracts/recordings";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { ensureActive } from "../../api";
import { journeyResult, refreshJourneyViews } from "../../journey-api";
import { gpxJourneyCreation } from "../../journey-creation";
import { useMobileSession } from "../../mobile-session";
import {
  mobileRecordingDraftKey,
  mobileRecordingImportsKey,
  pickRecording,
  recordingRequestMessage,
  recordingSize,
  uploadRecording,
} from "../../recording-api";
import type { VerifiedMobileScope } from "../../session";
import {
  CorruptRecordingSelection,
  claimRecordingCommand,
  discardCorruptRecordingDraft,
  discardRecordingDraft,
  type MobileRecordingDraft,
  RecordingSelectionChanged,
  readRecordingCommand,
  readRecordingDraft,
  recordingWifiOnly,
  saveRecordingDraft,
} from "../../storage/recording-import";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import { JourneyFlowHeading } from "../journeys/flow";
import { JourneyRetry, JourneyScreen } from "../journeys/states";
import { NativeRecordingReview } from "./review";

export function NativeUnfinishedImports({
  scope,
}: {
  scope: VerifiedMobileScope;
}) {
  const router = useRouter();
  const { refresh } = useMobileSession();
  const draft = useQuery({
    queryKey: mobileRecordingDraftKey,
    queryFn: () => readRecordingDraft(scope),
    refetchOnMount: "always",
  });
  const pending = useInfiniteQuery({
    queryKey: [...mobileRecordingImportsKey, "pending"],
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
    refetchOnMount: "always",
  });
  const saved =
    draft.isFetchedAfterMount && !draft.isError ? draft.data : undefined;
  const items =
    pending.isFetchedAfterMount && !pending.isError
      ? (pending.data?.pages.flatMap(({ imports }) => imports) ?? [])
      : [];
  return (
    <JourneyScreen density="compact" safeBottom>
      <JourneyFlowHeading
        title="Unfinished imports"
        description="Choose a recording to continue reviewing."
      />
      {saved?.input && (
        <Panel>
          <AppText text={saved.input.fileName} variant="label" />
          <Action
            label="Resume saved selection"
            onPress={() => router.push("/journeys/import")}
          />
        </Panel>
      )}
      {pending.isError ? (
        <JourneyRetry
          text="Couldn’t load unfinished imports."
          busy={pending.isFetching}
          retry={() => void pending.refetch()}
        />
      ) : !pending.isFetchedAfterMount ? (
        <StatusNotice
          notice={{ text: "Checking unfinished imports", tone: "info" }}
        />
      ) : items.length === 0 && !saved?.input ? (
        <AppText text="There are no unfinished imports." subdued />
      ) : (
        items
          .filter(({ id }) => id !== saved?.importId)
          .map((item) => (
            <Panel key={item.id}>
              <AppText text={item.fileName} variant="label" />
              <Action
                label="Resume import"
                accessibilityLabel={`Resume import · ${item.fileName}`}
                onPress={() =>
                  router.push({
                    pathname: "/journeys/import",
                    params: { importId: item.id },
                  })
                }
              />
            </Panel>
          ))
      )}
      {pending.hasNextPage && (
        <Action
          label="More imports"
          disabled={pending.isFetchingNextPage}
          onPress={() => void pending.fetchNextPage()}
        />
      )}
    </JourneyScreen>
  );
}

export function NativeRecordingImport({
  scope,
  importId,
  initialJourney,
  fresh,
  editOnly = false,
}: {
  scope: VerifiedMobileScope;
  importId?: string;
  initialJourney?: string;
  fresh: boolean;
  editOnly?: boolean;
}) {
  const router = useRouter();
  const { refresh, canSubmit } = useMobileSession();
  const network = useNetworkState();
  const operation = useRef<AbortController>(null);
  const [busy, setBusy] = useState<
    "picker" | "upload" | "cancel" | "process"
  >();
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<RecordingUpload>();
  const [savingWifi, setSavingWifi] = useState(false);
  const operationKind = useRef<typeof busy>(undefined);
  const wifi = useQuery({
    queryKey: ["recording-wifi-only"],
    queryFn: async () => recordingWifiOnly(scope),
  });
  const waitingForWifi = wifi.data === true;
  const wifiReady =
    wifi.isSuccess &&
    wifi.isFetchedAfterMount &&
    !wifi.isFetching &&
    !savingWifi;
  const [acceptedLocalDraft, setAcceptedLocalDraft] = useState(!fresh);
  const [chosenImport, setChosenImport] = useState(importId);
  const draft = useQuery({
    queryKey: mobileRecordingDraftKey,
    refetchOnMount: "always",
    queryFn: async () => readRecordingDraft(scope),
  });
  const saved = draft.data ?? {};
  const localMatch = !chosenImport || saved.importId === chosenImport;
  const entryId =
    chosenImport ?? (acceptedLocalDraft ? saved.importId : undefined);
  const command = useQuery({
    queryKey: ["recording-command", entryId],
    enabled: Boolean(entryId && !editOnly),
    refetchOnMount: "always",
    queryFn: async () =>
      entryId ? readRecordingCommand(scope, entryId) : null,
  });
  const destination =
    initialJourney ??
    (localMatch && acceptedLocalDraft ? saved.journeyId : undefined);
  const entry = useQuery<RecordingImport>({
    queryKey: ["recording-import", entryId],
    enabled: Boolean(entryId) && network.isConnected !== false,
    refetchInterval: ({ state }) =>
      state.data?.stage === "queued" ? 1000 : false,
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
  const committed = useQuery({
    queryKey: ["recording-result", entryId],
    enabled:
      Boolean(!editOnly && entry.data?.consumed && !entry.isError) &&
      network.isConnected !== false,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/result", {
          params: { path: { id: entryId ?? "" } },
          signal,
        }),
        scope,
        refresh,
      ),
  });

  useEffect(() => {
    const change = AppState.addEventListener("change", (state) => {
      if (
        state === "background" &&
        operationKind.current === "upload" &&
        operation.current
      )
        operation.current.abort();
    });
    return () => {
      change.remove();
      operation.current?.abort();
    };
  }, []);

  function update(next: MobileRecordingDraft, upload?: RecordingUpload) {
    ensureActive(scope.signal);
    scope.queryClient.setQueryData(mobileRecordingDraftKey, next);
    if (upload) setReceipt(upload);
  }

  async function execute(
    kind: typeof busy,
    action: (signal: AbortSignal) => Promise<void>,
    fallback: string,
  ) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    operationKind.current = kind;
    setBusy(kind);
    setMessage("");
    try {
      await action(controller.signal);
    } catch (error) {
      if (!scope.signal.aborted && error instanceof RecordingSelectionChanged) {
        await draft.refetch();
        setMessage("The saved selection changed. Check it before continuing.");
      } else if (!scope.signal.aborted)
        setMessage(
          controller.signal.aborted && kind === "upload"
            ? "Upload paused. Confirmed parts will be kept."
            : recordingRequestMessage(error, fallback),
        );
    } finally {
      operation.current = null;
      operationKind.current = undefined;
      if (!scope.signal.aborted) setBusy(undefined);
    }
  }

  function choose() {
    void execute(
      "picker",
      async (signal) => {
        const next = await pickRecording(scope, saved, destination, signal);
        if (!next) return;
        setAcceptedLocalDraft(true);
        update(next);
      },
      "Couldn’t read or save the selected file. Free some space or choose it again.",
    );
  }

  function upload() {
    if (!wifiReady) {
      setMessage("Check your upload preference before continuing.");
      return;
    }
    if (network.isConnected === false) {
      setMessage("Reconnect to upload this recording.");
      return;
    }
    if (waitingForWifi && network.type !== "WIFI") {
      setMessage("Waiting for Wi-Fi. Your selection is saved on this device.");
      return;
    }
    if (!canSubmit(scope)) {
      setMessage("Wait for the session check to finish, then try again.");
      return;
    }
    void execute(
      "upload",
      async (signal) => {
        await uploadRecording(
          scope,
          saved,
          signal,
          waitingForWifi,
          refresh,
          (next, state) => {
            setAcceptedLocalDraft(true);
            update(next, state);
          },
        );
        void scope.queryClient.invalidateQueries({
          queryKey: mobileRecordingImportsKey,
        });
      },
      "Couldn’t finish the upload. Try again to resume confirmed parts, or choose the original file again.",
    );
  }

  function cancel() {
    Alert.alert(
      "Discard this upload?",
      "The original in your files stays available.",
      [
        { text: "Keep upload", style: "cancel" },
        {
          text: "Discard upload",
          style: "destructive",
          onPress: () => {
            void execute(
              "cancel",
              async (signal) => {
                if (saved.uploadId && !saved.importId) {
                  const path = { id: saved.uploadId };
                  const result = await scope.api.DELETE(
                    "/api/v1/uploads/{id}",
                    { params: { path }, signal },
                  );
                  if (result.response.status === 409) {
                    const recovered = journeyResult(
                      await scope.api.GET("/api/v1/uploads/{id}", {
                        params: { path },
                        signal,
                      }),
                      scope,
                      refresh,
                    );
                    if (recovered.importId) {
                      const next = { ...saved, importId: recovered.importId };
                      await saveRecordingDraft(scope, saved, next);
                      update(next, recovered);
                      return;
                    }
                  }
                  journeyResult(result, scope, refresh);
                }
                await discardRecordingDraft(scope, saved);
                update({});
                setChosenImport(undefined);
                setReceipt(undefined);
              },
              "Couldn’t confirm cancellation. Try again when connected.",
            );
          },
        },
      ],
    );
  }

  function complete(result: RecordingCommit) {
    if (entryId) void claimRecordingCommand(scope, entryId).catch(() => {});
    if (saved.importId === entryId) {
      void saveRecordingDraft(scope, saved)
        .then(() => {
          if (!scope.signal.aborted) update({});
        })
        .catch(() => {});
    }
    void refreshJourneyViews(scope).catch(() => {});
    void scope.queryClient.invalidateQueries({
      queryKey: mobileRecordingImportsKey,
    });
    if (result.journeyId) {
      scope.queryClient.setQueryData(
        ["recording-receipt", result.journeyId],
        result,
      );
      router.replace({
        pathname: "/journeys/[journeyId]",
        params: { journeyId: result.journeyId },
      });
    } else
      router.replace({
        pathname: "/your-recordings",
        params: { recording: result.recordingId, saved: "1" },
      });
  }

  const visible =
    entry.isError || network.isConnected === false ? undefined : entry.data;
  const localVisible = acceptedLocalDraft || !saved.importId ? saved : {};
  const acknowledged =
    receipt?.parts.reduce((sum, part) => sum + part.byteLength, 0) ?? 0;

  return (
    <JourneyScreen density="compact" safeBottom>
      <JourneyFlowHeading
        title={editOnly ? "Edit a saved recording" : "Import a GPX recording"}
        description={
          editOnly
            ? "Review recorded sections and adjust their times. Shared drafts keep their current revision until a coauthor accepts an update."
            : "Review the recorded sections and choose the private journey to save them to."
        }
      />
      {message && <StatusNotice notice={{ text: message, tone: "info" }} />}
      {entryId ? (
        visible?.consumed && !editOnly ? (
          <Panel>
            <AppText text="Recording saved" variant="label" />
            {committed.data && !committed.isError && (
              <Action
                label="Open saved recording"
                variant="primary"
                onPress={() => {
                  if (committed.data) complete(committed.data);
                }}
              />
            )}
            {committed.isError && (
              <JourneyRetry
                text="Couldn’t recover the save."
                retry={() => void committed.refetch()}
              />
            )}
            <Action
              label="Import another GPX"
              onPress={() => {
                setChosenImport(undefined);
                setAcceptedLocalDraft(false);
              }}
            />
          </Panel>
        ) : visible?.stage === "ready" ? (
          !editOnly && command.isError ? (
            <JourneyRetry
              text="Couldn’t recover the saved command."
              retry={() => void command.refetch()}
            />
          ) : !editOnly && !command.isFetchedAfterMount ? (
            <StatusNotice
              notice={{ text: "Checking pending save", tone: "info" }}
            />
          ) : (
            <NativeRecordingReview
              key={visible.id}
              scope={scope}
              entry={visible}
              initialJourney={destination}
              initialPending={
                editOnly ? undefined : (command.data ?? undefined)
              }
              editOnly={editOnly}
              persistPending={async (pending) => {
                const stored = await claimRecordingCommand(
                  scope,
                  visible.id,
                  pending,
                );
                scope.queryClient.setQueryData(
                  ["recording-command", visible.id],
                  stored ?? null,
                );
                return stored;
              }}
              onComplete={complete}
            />
          )
        ) : entry.isError ? (
          <JourneyRetry
            text="Couldn’t load this private import."
            busy={entry.isFetching}
            retry={() => void entry.refetch()}
          />
        ) : visible ? (
          <Panel>
            <AppText
              text="Uploaded privately"
              variant="label"
              accessibilityRole="header"
            />
            <AppText text={visible.fileName} />
            <StatusNotice
              notice={{
                text:
                  visible.stage === "queued"
                    ? "Reading recording"
                    : visible.issue === "no_recorded_path"
                      ? "This file has no continuous recorded section with two usable track points."
                      : visible.stage === "rejected"
                        ? "Choose another GPX file. The uploaded recording could not be read."
                        : "Couldn’t finish reading the recording.",
                tone: visible.stage === "queued" ? "info" : "warning",
              }}
            />
            {visible.stage === "failed" && (
              <Action
                label="Retry processing"
                disabled={Boolean(busy)}
                onPress={() =>
                  void execute(
                    "process",
                    async (signal) => {
                      const next = journeyResult(
                        await scope.api.POST("/api/v1/imports/{id}/retry", {
                          params: { path: { id: visible.id } },
                          signal,
                        }),
                        scope,
                        refresh,
                      );
                      scope.queryClient.setQueryData(
                        ["recording-import", visible.id],
                        next,
                      );
                    },
                    "Couldn’t restart processing. Try again when connected.",
                  )
                }
              />
            )}
            {visible.stage !== "queued" && (
              <Action
                label="Choose another file"
                onPress={() => {
                  setChosenImport(undefined);
                  setAcceptedLocalDraft(false);
                }}
              />
            )}
          </Panel>
        ) : (
          <StatusNotice
            notice={{
              text:
                network.isConnected === false
                  ? "Reconnect to check this private import"
                  : "Checking the private upload",
              tone: "info",
            }}
          />
        )
      ) : draft.isError ? (
        <Panel>
          <JourneyRetry
            text="Couldn’t read your saved selection."
            busy={draft.isFetching}
            retry={() => void draft.refetch()}
          />
          {draft.error instanceof CorruptRecordingSelection && (
            <Action
              label="Clear saved selection"
              onPress={() => {
                const corrupt = draft.error;
                if (!(corrupt instanceof CorruptRecordingSelection)) return;
                Alert.alert(
                  "Clear saved selection?",
                  "Any original you uploaded remains under Your recordings.",
                  [
                    { text: "Keep", style: "cancel" },
                    {
                      text: "Clear selection",
                      style: "destructive",
                      onPress: () => {
                        void discardCorruptRecordingDraft(scope, corrupt)
                          .then(() => draft.refetch())
                          .catch(() =>
                            setMessage("Couldn’t clear the saved selection."),
                          );
                      },
                    },
                  ],
                );
              }}
            />
          )}
        </Panel>
      ) : !draft.isFetchedAfterMount ? (
        <StatusNotice
          notice={{ text: "Checking saved selection", tone: "info" }}
        />
      ) : (
        <Panel>
          <AppText
            text={destination ? "Existing journey" : "New journey"}
            variant="label"
          />
          <AppText
            text="GPX files up to 50 MiB. Only you can review the file before saving."
            subdued
          />
          {localVisible.input && (
            <AppText text={localVisible.input.fileName} variant="label" />
          )}
          {localVisible.input && (
            <AppText
              text={`${recordingSize(localVisible.input.byteLength)} · Saved on this device`}
              subdued
            />
          )}
          {busy === "picker" && (
            <StatusNotice
              notice={{
                text: "Waiting for the selected document",
                tone: "info",
              }}
            />
          )}
          {busy === "upload" && (
            <AppText text={`${recordingSize(acknowledged)} acknowledged`} />
          )}
          <Action
            label={
              localVisible.input ? "Choose another file" : "Choose GPX file"
            }
            variant={localVisible.input ? "secondary" : "primary"}
            disabled={Boolean(busy)}
            onPress={choose}
          />
          {localVisible.input && (
            <Action
              label={
                busy === "upload"
                  ? "Uploading for review…"
                  : saved.uploadId
                    ? "Retry upload"
                    : "Upload for review"
              }
              variant="primary"
              disabled={Boolean(busy) || !wifiReady}
              onPress={upload}
            />
          )}
          {localVisible.input && wifi.isError && (
            <JourneyRetry
              text="Couldn’t check your Wi-Fi preference."
              busy={wifi.isFetching}
              retry={() => void wifi.refetch()}
            />
          )}
          {localVisible.input && wifi.isSuccess && (
            <Action
              label={waitingForWifi ? "Wi-Fi only on" : "Use Wi-Fi only"}
              variant="text"
              accessibilityState={{ checked: waitingForWifi }}
              disabled={Boolean(busy) || !wifiReady}
              onPress={() => {
                setSavingWifi(true);
                void recordingWifiOnly(scope, !waitingForWifi)
                  .then((value) => {
                    if (!scope.signal.aborted)
                      scope.queryClient.setQueryData(
                        ["recording-wifi-only"],
                        value,
                      );
                  })
                  .catch(() => {
                    if (!scope.signal.aborted)
                      setMessage("Couldn’t save your Wi-Fi preference.");
                  })
                  .finally(() => {
                    if (!scope.signal.aborted) setSavingWifi(false);
                  });
              }}
            />
          )}
          {busy === "upload" ? (
            <Action
              label="Pause upload"
              onPress={() => operation.current?.abort()}
            />
          ) : (
            localVisible.input && (
              <Action
                label="Cancel upload"
                disabled={Boolean(busy)}
                onPress={cancel}
              />
            )
          )}
        </Panel>
      )}
      {!editOnly && visible?.stage !== "ready" && (
        <Action
          label={
            gpxJourneyCreation
              ? "Plan without a recording"
              : "Create journey manually"
          }
          variant="text"
          onPress={() =>
            router.push(
              gpxJourneyCreation
                ? { pathname: "/journeys/new", params: { intent: "plan" } }
                : "/journeys/new",
            )
          }
        />
      )}
    </JourneyScreen>
  );
}
