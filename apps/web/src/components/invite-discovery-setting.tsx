import { useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const visible = profile.data?.inviteDiscoverable === true;

  async function update() {
    setBusy(true);
    setFailure(false);
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
      scope.queryClient.setQueryData(queryKey, saved);
    } catch {
      if (!scope.signal.aborted) setFailure(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="invitation-search-setting"
      className="grid gap-2 pt-4"
    >
      <h3 id="invitation-search-setting" className="font-semibold">
        Invitation search
      </h3>
      <p className="text-sm text-muted-foreground">
        Allow journey organisers to find you by display name or exact email.
        Search results show only your name.
      </p>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={!profile.data || busy}
        onClick={() => void update()}
      >
        {busy
          ? "Saving…"
          : visible
            ? "Turn off invitation search"
            : "Allow invitation search"}
      </Button>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t save this preference. Try again.
        </p>
      )}
    </section>
  );
}
