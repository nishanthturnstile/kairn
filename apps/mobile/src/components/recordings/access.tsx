import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "react-native";
import { journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import { JourneyRetry } from "../journeys/states";

export function ManageRecordingAccess({
  scope,
  journeyId,
  id,
  sourceId,
  archived,
  changed,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
  id: string;
  sourceId: string;
  archived: boolean;
  changed: (text: string) => void;
}) {
  const { refresh } = useMobileSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const route = "/api/v1/journeys/{journeyId}/sources/{sourceId}/review";
  const params = { path: { journeyId, sourceId } };
  const access = useQuery({
    queryKey: ["recording-access", journeyId, sourceId],
    enabled: open,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(route, { params, signal }),
        scope,
        refresh,
      ),
  });
  const grant = access.isError || access.isFetching ? undefined : access.data;

  async function apply(action: "share" | "withdraw" | "remove") {
    if (busy || !grant) return;
    setBusy(true);
    setError(false);
    try {
      const result =
        action === "remove"
          ? journeyResult(
              await scope.api.DELETE(
                "/api/v1/journeys/{journeyId}/recordings/{id}",
                {
                  params: { path: { journeyId, id } },
                  body: { expectedGrantRevision: grant.revision },
                },
              ),
              scope,
              refresh,
            )
          : journeyResult(
              await scope.api.POST(route, {
                params,
                body: { action, expectedRevision: grant.revision },
              }),
              scope,
              refresh,
            );
      const text =
        action === "share"
          ? "Recording available for journey review."
          : action === "withdraw"
            ? "Access withdrawn."
            : "Recording removed. The original is still under Your recordings.";
      changed(
        "confirmation" in result && result.confirmation === "pending"
          ? `${text} Independent confirmation is pending.`
          : text,
      );
      if (action !== "remove") await access.refetch();
    } catch {
      if (!scope.signal.aborted) {
        setError(true);
        await access.refetch();
      }
    } finally {
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  function confirm(action: "withdraw" | "remove") {
    Alert.alert(
      action === "withdraw"
        ? "Withdraw access?"
        : "Remove recording from journey?",
      action === "withdraw"
        ? "This removes the recording from the journey’s review audience and shared draft."
        : "This removes the recording and its review access from the journey. The original stays under Your recordings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action === "withdraw" ? "Withdraw access" : "Remove recording",
          style: "destructive",
          onPress: () => void apply(action),
        },
      ],
    );
  }

  return (
    <>
      <Action
        label={open ? "Close access settings" : "Manage access"}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <Panel>
          {error && (
            <StatusNotice
              notice={{
                text: "Couldn’t confirm this change. Check access and try again.",
                tone: "warning",
              }}
            />
          )}
          {access.isError ? (
            <JourneyRetry
              text="Couldn’t check the recording audience."
              retry={() => void access.refetch()}
            />
          ) : !grant ? (
            <AppText text="Checking the recording audience" subdued />
          ) : (
            <>
              <AppText
                text={
                  grant.scope === "only_me"
                    ? "Only you can see this recording."
                    : "This recording is available to active coauthors and designated publishers."
                }
              />
              {grant.scope === "only_me" ? (
                !archived && (
                  <Action
                    label="Share for journey review"
                    disabled={busy}
                    onPress={() => void apply("share")}
                  />
                )
              ) : (
                <Action
                  label="Withdraw from journey"
                  disabled={busy}
                  onPress={() => confirm("withdraw")}
                />
              )}
              <Action
                label="Remove recording from journey"
                disabled={busy}
                onPress={() => confirm("remove")}
              />
            </>
          )}
        </Panel>
      )}
    </>
  );
}
