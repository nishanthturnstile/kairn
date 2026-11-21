import { journeyScheduleAsOf } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { historyKey, journeyResult } from "./journey-api";
import type { AccountScope } from "./session";
import { useSessionAccess } from "./session-access";

export const accessRecheckInterval = 30_000;

export const journeyInvitationsKey = (scope: AccountScope, journeyId: string) =>
  [scope.accountId, "journey-invitations", journeyId] as const;

export function useJourneyAccess(
  scope: AccountScope,
  journeyId: string,
  enabled = true,
) {
  const { refresh } = useSessionAccess();
  const [foreground, setForeground] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const detail = useQuery({
    queryKey: [scope.accountId, "journey-detail", journeyId],
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: accessRecheckInterval,
    async queryFn({ signal }) {
      const result = await scope.api.GET("/api/v1/journeys/{journeyId}", {
        params: { path: { journeyId } },
        signal,
      });
      if (result.response.status === 404) {
        scope.signal.throwIfAborted();
        signal.throwIfAborted();
        void scope.queryClient.invalidateQueries({
          queryKey: historyKey(scope),
        });
        void scope.queryClient.invalidateQueries({
          queryKey: [scope.accountId, "dashboard"],
        });
        return null;
      }
      return {
        journey: journeyResult(result, scope, refresh),
        asOf: journeyScheduleAsOf(result.response.headers),
      };
    },
  });
  const refetch = detail.refetch;
  useEffect(() => {
    if (!enabled) return;
    let generation = 0;
    let stopped = false;
    function revalidate() {
      if (document.visibilityState !== "visible") return;
      const active = ++generation;
      setForeground(true);
      void scope.queryClient
        .cancelQueries({
          queryKey: [scope.accountId, "journey-detail", journeyId],
          exact: true,
        })
        .then(async () => {
          if (stopped || active !== generation || scope.signal.aborted) return;
          await refetch();
        })
        .finally(() => {
          if (!stopped && active === generation) setForeground(false);
        });
    }
    function disconnected() {
      generation++;
      setOffline(true);
      void scope.queryClient.cancelQueries({
        queryKey: [scope.accountId, "journey-detail", journeyId],
        exact: true,
      });
    }
    function connected() {
      setOffline(false);
      revalidate();
    }
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", connected);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("online", connected);
    };
  }, [enabled, journeyId, refetch, scope]);
  const revalidating = offline || foreground || detail.isPaused;
  return {
    ...detail,
    offline,
    revalidating,
    checking: revalidating || detail.isFetching,
  };
}

export async function refreshJourneyViews(scope: AccountScope) {
  await scope.queryClient.cancelQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === scope.accountId &&
      (String(queryKey[1]).startsWith("journey-") ||
        queryKey[1] === "dashboard"),
  });
  scope.signal.throwIfAborted();
  void scope.queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === scope.accountId &&
      (String(queryKey[1]).startsWith("journey-") ||
        queryKey[1] === "dashboard"),
  });
}
