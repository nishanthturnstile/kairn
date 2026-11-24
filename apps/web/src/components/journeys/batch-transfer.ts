import type { RecordingUpload } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { journeyResult } from "@/lib/journey-api";
import { readBatch, sendBatchFile } from "@/lib/recording-batch";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";

export type BatchFile = {
  id: string;
  name: string;
  bytes: number;
  file?: File;
  position?: number;
  upload?: RecordingUpload;
  busy?: "queued" | "transferring" | "removing";
  message?: string;
};

type BatchSession = {
  id: string;
  expiresAt?: string;
  pending: (Pick<BatchFile, "id" | "name" | "bytes"> & { position: number })[];
};

export type RestoredBatch = {
  id: string;
  expiresAt?: string;
  files: BatchFile[];
};

function batchKey(scope: AccountScope) {
  return `kairn:recording-batch:${scope.accountId}`;
}

export function forgetBrowserBatch(scope: AccountScope, batchId: string) {
  try {
    const storageKey = batchKey(scope);
    const value = sessionStorage.getItem(storageKey);
    if (value && (JSON.parse(value) as BatchSession).id === batchId)
      sessionStorage.removeItem(storageKey);
  } catch {
    // The server save receipt remains available when browser storage is blocked.
  }
}

export function useResumableBatch(scope: AccountScope) {
  const { refresh } = useSessionAccess();
  const [stored] = useState<BatchSession | null>(() => {
    try {
      const value = sessionStorage.getItem(batchKey(scope));
      if (value) {
        const data = JSON.parse(value) as BatchSession;
        if (typeof data?.id === "string" && Array.isArray(data.pending))
          return data;
      }
    } catch {
      // An unavailable browser store cannot supply a draft to recover.
    }
    return null;
  });
  const recovered = useQuery<RestoredBatch | null>({
    queryKey: [scope.accountId, "recording-batch", stored?.id],
    enabled: stored !== null,
    queryFn: async ({ signal }) => {
      if (!stored) return null;
      const remote = await readBatch(scope, refresh, stored.id, signal);
      if (!remote && stored.expiresAt) {
        if (!signal.aborted && !scope.signal.aborted)
          forgetBrowserBatch(scope, stored.id);
        return null;
      }
      const files: BatchFile[] = (remote?.files ?? []).map(
        ({ commandId, position, upload }) => ({
          id: commandId,
          position,
          upload,
          name: upload.fileName,
          bytes: upload.byteLength,
        }),
      );
      const received = new Set(files.map(({ id }) => id));
      files.push(...stored.pending.filter(({ id }) => !received.has(id)));
      files.sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
      return { id: stored.id, expiresAt: remote?.expiresAt, files };
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  return {
    ...recovered,
    previousDraftUnavailable: Boolean(
      stored?.expiresAt && recovered.isSuccess && !recovered.data,
    ),
  };
}

export function useBatchTransfer(
  scope: AccountScope,
  initial: RestoredBatch | null | undefined,
) {
  const { refresh } = useSessionAccess();
  const [files, setRows] = useState<BatchFile[]>(initial?.files ?? []);
  const latest = useRef(files);
  const [sending, setSending] = useState(false);
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt);
  const expiry = useRef(initial?.expiresAt);
  const lastStored = useRef("");
  const batch = useRef(initial?.id);
  const nextPosition = useRef(
    Math.max(
      -1,
      ...(initial?.files.map(({ position }) => position ?? -1) ?? []),
    ) + 1,
  );
  const lifetime = useRef<AbortController>(null);
  const transferBatch = useRef<AbortController>(null);
  const transfers = useRef(new Map<string, AbortController>());
  const sendingRef = useRef(false);
  const removed = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  function replaceFiles(next: BatchFile[]) {
    latest.current = next;
    setRows(next);
    if (!batch.current) return;
    const draft: BatchSession = {
      id: batch.current,
      expiresAt: expiry.current,
      pending: next.flatMap(({ id, name, bytes, position, upload }) =>
        position !== undefined && !upload
          ? [{ id, name, bytes, position }]
          : [],
      ),
    };
    const serialized = JSON.stringify(draft);
    if (serialized === lastStored.current) return;
    try {
      sessionStorage.setItem(batchKey(scope), serialized);
      lastStored.current = serialized;
    } catch {
      // Keep this draft available in the current view if storage is blocked.
    }
  }

  function setFiles(update: (previous: BatchFile[]) => BatchFile[]) {
    replaceFiles(update(latest.current));
  }

  function updateFile(id: string, attributes: Partial<BatchFile>) {
    setFiles((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...attributes } : item,
      ),
    );
  }

  async function start() {
    if (sendingRef.current || !lifetime.current || scope.signal.aborted) return;
    const pauseController = new AbortController();
    const stageSignal = AbortSignal.any([
      scope.signal,
      lifetime.current.signal,
      pauseController.signal,
    ]);
    if (expiry.current && Date.parse(expiry.current) <= Date.now()) {
      batch.current = undefined;
      expiry.current = undefined;
      setExpiresAt(undefined);
      nextPosition.current = 0;
      replaceFiles(
        latest.current.flatMap(({ id, name, bytes, file }) =>
          file ? [{ id, name, bytes, file }] : [],
        ),
      );
    }
    const pending = latest.current.filter(
      (item) =>
        item.file &&
        !item.busy &&
        (!item.upload || item.upload.state === "uploading"),
    );
    if (!pending.length) return;
    transferBatch.current = pauseController;
    sendingRef.current = true;
    setSending(true);
    batch.current ??= crypto.randomUUID();
    const batchId = batch.current;
    const queue = pending.map((item) => ({
      ...item,
      position: item.position ?? nextPosition.current++,
    }));
    const positions = new Map(queue.map(({ id, position }) => [id, position]));
    setFiles((current) =>
      current.map((item) => {
        const position = positions.get(item.id);
        return position === undefined
          ? item
          : { ...item, position, busy: "queued", message: undefined };
      }),
    );
    async function sendNext() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (stageSignal.aborted) return;
        if (!item?.file || removed.current.has(item.id)) continue;
        const controller = new AbortController();
        transfers.current.set(item.id, controller);
        const signal = AbortSignal.any([stageSignal, controller.signal]);
        updateFile(item.id, { busy: "transferring" });
        try {
          const upload = await sendBatchFile({
            scope,
            refresh,
            batchId,
            position: item.position,
            commandId: item.id,
            existing: item.upload,
            file: item.file,
            signal,
            onProgress: (upload) => {
              if (signal.aborted) return;
              expiry.current = upload.expiresAt;
              setExpiresAt(upload.expiresAt);
              updateFile(item.id, { upload });
            },
          });
          if (!signal.aborted && upload.state !== "uploading")
            updateFile(item.id, { file: undefined });
        } catch (error) {
          if (!signal.aborted)
            updateFile(item.id, {
              message:
                error instanceof Error &&
                error.message.startsWith("Choose the original")
                  ? error.message
                  : "Couldn’t upload this file. Try again.",
              ...(item.upload?.state === "uploading" &&
              error instanceof Error &&
              error.message.startsWith("Choose the original")
                ? { file: undefined }
                : {}),
            });
        } finally {
          transfers.current.delete(item.id);
          if (!signal.aborted) updateFile(item.id, { busy: undefined });
        }
      }
    }
    try {
      await Promise.all([sendNext(), sendNext()]);
    } finally {
      sendingRef.current = false;
      transferBatch.current = null;
      if (!scope.signal.aborted && !lifetime.current?.signal.aborted) {
        if (pauseController.signal.aborted) {
          setFiles((current) =>
            current.map((item) =>
              item.busy === "queued" || item.busy === "transferring"
                ? { ...item, busy: undefined }
                : item,
            ),
          );
        }
        setSending(false);
      }
    }
  }

  async function remove(item: BatchFile) {
    if (
      !lifetime.current ||
      item.busy === "removing" ||
      (item.busy === "transferring" && !item.upload)
    )
      return false;
    const signal = AbortSignal.any([scope.signal, lifetime.current.signal]);
    removed.current.add(item.id);
    transfers.current.get(item.id)?.abort();
    updateFile(item.id, { busy: "removing" });
    try {
      const id =
        item.upload?.id ??
        (batch.current && item.position !== undefined
          ? (
              await readBatch(scope, refresh, batch.current, signal)
            )?.files.find(({ commandId }) => commandId === item.id)?.upload.id
          : undefined);
      if (id) {
        const response = await scope.api.DELETE("/api/v1/uploads/{id}", {
          params: { path: { id } },
          signal,
        });
        journeyResult(response, scope, refresh);
      }
      if (signal.aborted) return false;
      setFiles((current) => current.filter(({ id }) => id !== item.id));
      return true;
    } catch {
      removed.current.delete(item.id);
      if (!signal.aborted)
        updateFile(item.id, {
          busy: undefined,
          message: "Couldn’t remove this file. Try again.",
        });
      return false;
    }
  }

  async function refreshBatch() {
    const id = batch.current;
    const current = latest.current;
    if (!id || !lifetime.current || current.some((item) => item.busy)) return;
    const signal = AbortSignal.any([scope.signal, lifetime.current.signal]);
    const remote = await readBatch(scope, refresh, id, signal);
    if (signal.aborted || batch.current !== id || latest.current !== current)
      return;
    const localOnly = current.filter((item) => !item.upload);
    if (!remote && expiry.current) {
      forgetBrowserBatch(scope, id);
      batch.current = undefined;
      expiry.current = undefined;
      nextPosition.current = 0;
      setExpiresAt(undefined);
      replaceFiles(
        localOnly.flatMap(({ id, name, bytes, file }) =>
          file ? [{ id, name, bytes, file }] : [],
        ),
      );
      return;
    }
    if (!remote) return;
    const previous = new Map(current.map((item) => [item.id, item]));
    const positions = new Set(remote.files.map((item) => item.position));
    const next = remote.files.map(({ commandId, position, upload }) => {
      const local = previous.get(commandId);
      previous.delete(commandId);
      nextPosition.current = Math.max(nextPosition.current, position + 1);
      return {
        id: commandId,
        name: local?.name ?? upload.fileName,
        bytes: upload.byteLength,
        file: upload.state === "uploading" ? local?.file : undefined,
        position,
        upload,
      };
    });
    expiry.current = remote.expiresAt;
    setExpiresAt(remote.expiresAt);
    replaceFiles([
      ...next,
      ...localOnly
        .filter(({ id }) => previous.has(id))
        .map((item) =>
          item.position !== undefined && positions.has(item.position)
            ? { ...item, position: undefined }
            : item,
        ),
    ]);
  }

  return {
    files,
    replaceFiles,
    currentFiles: () => latest.current,
    start,
    pause: () => transferBatch.current?.abort(),
    remove,
    refreshBatch,
    updateFile,
    sending,
    expiresAt,
    batchId: batch.current,
  };
}
