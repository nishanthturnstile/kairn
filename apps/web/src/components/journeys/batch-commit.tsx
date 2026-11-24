import { journeyPath } from "@kairn/contracts/journeys";
import {
  type CommitRecordingBatch,
  commitRecordingBatch,
} from "@kairn/contracts/recordings";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useReceiptToast } from "@/components/ui/toast";
import { historyKey, JourneyRequestError } from "@/lib/journey-api";
import {
  type InviteDraft,
  isInviteDraftList,
  type PendingInviteBatch,
} from "@/lib/journey-invitations";
import { commitBatch } from "@/lib/recording-batch";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { queueJourneyInvitations } from "./batch-invitations";
import { forgetBrowserBatch } from "./batch-transfer";
import { SavedJourneyInviteDialog } from "./saved-journey-invite-dialog";

export type BatchSaveAttempt = {
  batchId: string;
  body: CommitRecordingBatch;
  invitees?: InviteDraft[];
  sendBeforeOpening?: true;
  savedJourneyId?: string;
  pendingInvitations?: PendingInviteBatch;
  finishedIn?: string;
};
export type BatchCommit = {
  save: (attempt: BatchSaveAttempt) => void;
  pending: boolean;
  saving: boolean;
  savedJourneyId?: string;
  feedback: ReactNode;
  action: ReactNode;
};

function attemptKey(scope: AccountScope) {
  return `kairn:recording-batch-save:${scope.accountId}`;
}

export function useBatchSaveEntryKey() {
  return useLocation({
    select: ({ state }) => state.__TSR_key ?? state.key ?? "",
  });
}

function readAttempt(
  scope: AccountScope,
  entryKey: string,
): BatchSaveAttempt | null {
  try {
    const raw = sessionStorage.getItem(attemptKey(scope));
    if (!raw) return null;
    const value: BatchSaveAttempt = JSON.parse(raw);
    return typeof value?.batchId === "string" &&
      commitRecordingBatch.safeParse(value.body).success &&
      (value.invitees === undefined || isInviteDraftList(value.invitees)) &&
      (value.sendBeforeOpening === undefined ||
        value.sendBeforeOpening === true) &&
      (value.savedJourneyId === undefined ||
        journeyPath.safeParse({ journeyId: value.savedJourneyId }).success) &&
      (value.finishedIn === undefined ||
        (value.finishedIn === entryKey && !!value.savedJourneyId)) &&
      (value.pendingInvitations === undefined ||
        (journeyPath.safeParse({ journeyId: value.pendingInvitations?.key })
          .success &&
          isInviteDraftList(value.pendingInvitations.drafts)))
      ? value
      : null;
  } catch {
    return null;
  }
}

function writeAttempt(scope: AccountScope, attempt: BatchSaveAttempt) {
  sessionStorage.setItem(attemptKey(scope), JSON.stringify(attempt));
}

function clearAttempt(scope: AccountScope) {
  try {
    sessionStorage.removeItem(attemptKey(scope));
  } catch {
    // This view can still display the confirmed result if storage is blocked.
  }
}

export function hasPendingBatchSave(scope: AccountScope, entryKey: string) {
  return readAttempt(scope, entryKey) !== null;
}

export function BatchCommitGate({
  scope,
  children,
  onSavePendingChange,
}: {
  scope: AccountScope;
  children: (commit: BatchCommit) => ReactNode;
  onSavePendingChange: (pending: boolean) => void;
}) {
  const navigate = useNavigate();
  const notify = useReceiptToast();
  const { refresh } = useSessionAccess();
  const entryKey = useBatchSaveEntryKey();
  const [attempt, setAttempt] = useState(() => readAttempt(scope, entryKey));
  const savedJourneyId =
    attempt?.finishedIn === entryKey ? attempt.savedJourneyId : undefined;
  const [restoring, setRestoring] = useState(attempt !== null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const lifetime = useRef<AbortController>(null);
  const submitting = useRef(false);
  const retry = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!saving && attempt && (restoring || !savedJourneyId))
      retry.current?.focus();
  }, [attempt, restoring, savedJourneyId, saving]);

  function openJourney(id: string) {
    clearAttempt(scope);
    void navigate({
      to: "/journeys/$journeyId",
      params: { journeyId: id },
      replace: true,
    });
  }

  async function save(next: BatchSaveAttempt) {
    if (submitting.current || !lifetime.current || scope.signal.aborted) return;
    const signal = AbortSignal.any([scope.signal, lifetime.current.signal]);
    try {
      writeAttempt(scope, next);
    } catch {
      setNotice(
        "Couldn’t store the save attempt in this tab. Try again after allowing site storage.",
      );
      return;
    }
    submitting.current = true;
    onSavePendingChange(true);
    setNotice(undefined);
    setAttempt(next);
    setSaving(true);
    try {
      const id =
        next.savedJourneyId ??
        (await commitBatch(scope, refresh, next.batchId, next.body, signal)).id;
      if (signal.aborted) return;
      forgetBrowserBatch(scope, next.batchId);
      void scope.queryClient.invalidateQueries({ queryKey: historyKey(scope) });
      void scope.queryClient.invalidateQueries({
        queryKey: [scope.accountId, "dashboard"],
      });

      const drafts = next.invitees?.filter(
        ({ status }) => !status || status === "rate_limited",
      );
      const batch =
        next.pendingInvitations ??
        (drafts?.length ? { key: crypto.randomUUID(), drafts } : undefined);
      if (batch?.drafts.length) {
        const confirmed = {
          ...next,
          savedJourneyId: id,
          pendingInvitations: batch,
        };
        setAttempt(confirmed);
        try {
          // Write the key before sending so a lost response can be replayed.
          writeAttempt(scope, confirmed);
          queueJourneyInvitations(
            scope,
            refresh,
            id,
            batch,
            next.sendBeforeOpening ? notify : undefined,
          );
        } catch {
          if (signal.aborted) return;
          setNotice("Journey created. Retry to complete the invitations.");
          return;
        }
      }
      if (signal.aborted) return;
      if (next.sendBeforeOpening) {
        const finished: BatchSaveAttempt = {
          batchId: next.batchId,
          body: next.body,
          savedJourneyId: id,
          finishedIn: entryKey,
        };
        try {
          // Keep this receipt for reloads of the current creation screen.
          writeAttempt(scope, finished);
        } catch {
          // The stored send attempt can still recover the same journey.
        }
        setAttempt(finished);
      } else {
        setAttempt(null);
        openJourney(id);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (
        error instanceof JourneyRequestError &&
        [400, 404, 409, 412, 422].includes(error.status)
      ) {
        clearAttempt(scope);
        setAttempt(null);
        setRestoring(false);
        onSavePendingChange(false);
        void scope.queryClient.invalidateQueries({
          queryKey: [scope.accountId, "batch-review", next.batchId],
        });
        setNotice(
          "Couldn’t save this batch. Check the current recordings and try again.",
        );
      } else {
        setNotice(
          "Couldn’t confirm the save. Retry to recover the same journey.",
        );
      }
    } finally {
      submitting.current = false;
      if (!signal.aborted) setSaving(false);
    }
  }

  const feedback = (
    <>
      {notice && (
        <Alert variant="warning">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {savedJourneyId && (
        <p role="status" className="text-sm font-semibold">
          Journey saved.
        </p>
      )}
      {restoring && !savedJourneyId && !notice && !saving && (
        <p className="text-sm text-muted-foreground">
          You have a journey save awaiting confirmation.
        </p>
      )}
    </>
  );
  const action = attempt && (
    <Button
      type="button"
      ref={retry}
      size="lg"
      disabled={saving}
      focusableWhenDisabled={saving}
      feedback={saving ? "pending" : "idle"}
      onClick={() =>
        savedJourneyId ? openJourney(savedJourneyId) : void save(attempt)
      }
    >
      {savedJourneyId
        ? "Open journey"
        : attempt.sendBeforeOpening
          ? saving
            ? "Sending invitations…"
            : "Retry send"
          : saving
            ? "Creating journey…"
            : "Retry save"}
    </Button>
  );
  if (restoring)
    return (
      <section
        aria-label={
          savedJourneyId ? "Saved journey" : "Unconfirmed journey save"
        }
        className="grid justify-items-start gap-3"
      >
        {feedback}
        <div className="flex flex-wrap items-center gap-2">
          {savedJourneyId && (
            <SavedJourneyInviteDialog
              scope={scope}
              journeyId={savedJourneyId}
              title={attempt?.body.title ?? "Journey"}
            />
          )}
          {action}
        </div>
      </section>
    );
  return children({
    save: (next) => void save(next),
    pending: !!attempt,
    saving,
    savedJourneyId,
    feedback,
    action,
  });
}
