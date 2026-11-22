import { useRef, useState } from "react";
import { ensureActive } from "../api";
import { journeyResult } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import type { VerifiedMobileScope } from "../session";
import { profileKey } from "../workspace-keys";
import { useNativeProfile } from "../workspace-queries";
import { Choice } from "./fold/controls";
import { Action, AppText, StatusNotice } from "./fold/primitives";

export function InviteDiscoverySetting({
  scope,
}: {
  scope: VerifiedMobileScope;
}) {
  const { refresh, canSubmit, isRevalidating } = useMobileSession();
  const profile = useNativeProfile(scope);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = profile.data?.inviteDiscoverable ?? false;

  async function toggle() {
    if (!profile.data || saving.current || !canSubmit(scope)) return;
    saving.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const updated = journeyResult(
        await scope.api.PATCH("/api/v1/profile", {
          params: { header: { "x-expected-account": scope.accountId } },
          body: { inviteDiscoverable: !current },
        }),
        scope,
        refresh,
      );
      await scope.queryClient.cancelQueries({
        queryKey: profileKey,
        exact: true,
      });
      ensureActive(scope.signal);
      scope.queryClient.setQueryData<typeof updated>(profileKey, (previous) =>
        previous
          ? { ...previous, inviteDiscoverable: updated.inviteDiscoverable }
          : updated,
      );
    } catch {
      if (!scope.signal.aborted) {
        setFailed(true);
        void profile.refetch();
      }
    } finally {
      saving.current = false;
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      {profile.data ? (
        <Choice
          kind="switch"
          label="Invitation search"
          checked={current}
          disabled={busy || isRevalidating}
          busy={busy}
          onChange={() => void toggle()}
        />
      ) : profile.isError ? (
        <>
          <StatusNotice
            notice={{ text: "Couldn’t load this preference.", tone: "error" }}
          />
          <Action
            label="Retry invitation search"
            disabled={profile.isFetching}
            onPress={() => void profile.refetch()}
          />
        </>
      ) : (
        <StatusNotice
          notice={{ text: "Loading invitation search", tone: "info" }}
        />
      )}
      <AppText
        text="Allow journey organisers to find you by display name or exact email. Search results show only your name."
        variant="caption"
        subdued
      />
      {busy && (
        <StatusNotice
          notice={{ text: "Saving invitation search", tone: "info" }}
        />
      )}
      {failed && (
        <StatusNotice
          notice={{
            text: "Couldn’t save this preference. Try again.",
            tone: "error",
          }}
        />
      )}
    </>
  );
}
