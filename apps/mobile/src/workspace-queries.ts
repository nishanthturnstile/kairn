import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { journeyResult } from "./journey-api";
import { useMobileSession } from "./mobile-session";
import type { VerifiedMobileScope } from "./session";

import { profileKey } from "./workspace-keys";
import { observeOnboarding } from "./workspace-observer";

const idleProgress = {
  data: undefined,
  isError: false,
  isFetching: false,
} as const;

export function useNativeOnboarding(scope?: VerifiedMobileScope) {
  const { refresh } = useMobileSession();
  // This observer lives above the navigator and must switch caches on sign-in.
  const observer = useMemo(
    () => scope && observeOnboarding(scope, refresh),
    [scope, refresh],
  );
  const subscribe = useCallback(
    (listener: () => void) => observer?.subscribe(listener) ?? (() => {}),
    [observer],
  );
  const getSnapshot = useCallback(
    () => observer?.getCurrentResult() ?? idleProgress,
    [observer],
  );
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refetch = useCallback(
    () => observer?.refetch() ?? Promise.resolve(idleProgress),
    [observer],
  );
  return { ...current, refetch };
}

export function useNativeProfile(scope: VerifiedMobileScope) {
  const { refresh } = useMobileSession();
  return useQuery({
    queryKey: profileKey,
    refetchOnMount: "always",
    async queryFn({ signal }) {
      return journeyResult(
        await scope.api.GET("/api/v1/profile", {
          params: { header: { "x-expected-account": scope.accountId } },
          signal,
        }),
        scope,
        refresh,
      );
    },
  });
}
