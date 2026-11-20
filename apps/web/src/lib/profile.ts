import { useQuery } from "@tanstack/react-query";
import { journeyResult } from "./journey-api";
import type { AccountScope } from "./session";
import { useSessionAccess } from "./session-access";

export function profileQueryKey(accountId: string) {
  return [accountId, "profile"];
}

export function useProfile(scope: AccountScope, accountId: string) {
  const { refresh } = useSessionAccess();
  return useQuery({
    queryKey: profileQueryKey(accountId),
    async queryFn({ signal }) {
      return journeyResult(
        await scope.api.GET("/api/v1/profile", {
          params: { header: { "x-expected-account": accountId } },
          signal,
        }),
        scope,
        refresh,
      );
    },
  });
}
