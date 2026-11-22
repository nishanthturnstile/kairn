import { useRef, useState } from "react";
import { ensureActive } from "../api";
import { journeyResult } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import type { VerifiedMobileScope } from "../session";
import { profileKey } from "../workspace-keys";
import { useNativeProfile } from "../workspace-queries";
import { Choice } from "./fold/controls";
import { AppText, Panel, StatusNotice } from "./fold/primitives";

export function InviteDiscoverySetting({
  scope,
}: {
  scope: VerifiedMobileScope;
}) {
  const { refresh, canSubmit } = useMobileSession();
  const profile = useNativeProfile(scope);
  const saving = useRef(false);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const current = profile.data?.inviteDiscoverable;

  async function toggle() {
    if (current === undefined || saving.current || !canSubmit(scope)) return;
    saving.current = true;
    setPendingValue(!current);
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
      scope.queryClient.setQueryData(profileKey, updated);
    } catch {
      if (!scope.signal.aborted) {
        setFailed(true);
        void profile.refetch();
      }
    } finally {
      saving.current = false;
      setPendingValue(null);
    }
  }

  return (
    <Panel>
      <AppText
        text="Invitation search"
        variant="section"
        accessibilityRole="header"
      />
      <AppText
        text="Let organisers find you by display name or exact email when they invite people to a journey."
        subdued
      />
      <StatusNotice
        notice={
          failed
            ? {
                text: "Couldn’t save your preference. Try again.",
                tone: "error",
              }
            : null
        }
      />
      {current !== undefined && !profile.isError && (
        <Choice
          kind="switch"
          label="Allow invitation search"
          checked={pendingValue ?? current}
          disabled={pendingValue !== null}
          busy={pendingValue !== null}
          onChange={() => void toggle()}
        />
      )}
    </Panel>
  );
}
