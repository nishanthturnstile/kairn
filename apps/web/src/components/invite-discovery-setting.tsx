import { useRef, useState } from "react";
import { journeyResult } from "../lib/journey-api";
import { profileQueryKey, useProfile } from "../lib/profile";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";
import { Button } from "./ui/button";

export function InviteDiscoverySetting({
  scope,
  accountId,
}: {
  scope: AccountScope;
  accountId: string;
}) {
  const profile = useProfile(scope, accountId);
  const { refresh } = useSessionAccess();
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "failed">();
  const visible = profile.data?.inviteDiscoverable === true;
  const needsRetry = !profile.data && (profile.isError || retrying);
  const pending = busy || retrying || (needsRetry && profile.isFetching);

  async function retry() {
    setRetrying(true);
    try {
      await profile.refetch();
    } finally {
      if (!scope.signal.aborted) setRetrying(false);
    }
  }

  async function update() {
    if (saving.current || !profile.data) return;
    saving.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      const saved = journeyResult(
        await scope.api.PATCH("/api/v1/profile", {
          params: { header: { "x-expected-account": accountId } },
          body: { inviteDiscoverable: !visible },
        }),
        scope,
        refresh,
      );
      const queryKey = profileQueryKey(accountId);
      await scope.queryClient.cancelQueries({ queryKey });
      scope.signal.throwIfAborted();
      scope.queryClient.setQueryData<typeof saved>(queryKey, (previous) =>
        previous
          ? { ...previous, inviteDiscoverable: saved.inviteDiscoverable }
          : saved,
      );
      setFeedback("saved");
    } catch {
      if (!scope.signal.aborted) setFeedback("failed");
    } finally {
      saving.current = false;
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <section aria-labelledby="invitation-search-setting" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="invitation-search-setting" className="font-semibold">
          Invitation search
        </h3>
        {profile.data && (
          <span className="text-sm font-semibold text-muted-foreground">
            {visible ? "On" : "Off"}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Allow journey organisers to find you by display name or exact email.
        Search results show only your name.
      </p>
      {needsRetry && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t load this preference.
        </p>
      )}
      {(profile.data || needsRetry) && (
        <Button
          type="button"
          variant="outline"
          className="min-h-touch justify-self-start"
          focusableWhenDisabled
          disabled={pending}
          feedback={pending ? "pending" : "idle"}
          onClick={() => {
            if (needsRetry) void retry();
            else void update();
          }}
        >
          {needsRetry
            ? pending
              ? "Retrying…"
              : "Retry invitation search"
            : busy
              ? "Saving…"
              : visible
                ? "Turn off invitation search"
                : "Allow invitation search"}
        </Button>
      )}
      {!profile.data && !needsRetry && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading invitation search…
        </p>
      )}
      {feedback === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t save this preference. Try again.
        </p>
      )}
      {feedback === "saved" && (
        <p role="status" className="text-sm text-success">
          {visible ? "Invitation search is on." : "Invitation search is off."}
        </p>
      )}
    </section>
  );
}
