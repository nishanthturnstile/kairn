import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { journeyResult } from "./journey-api";
import type { AccountScope } from "./session";
import { useSessionAccess } from "./session-access";

export const onboardingKey = (scope: AccountScope) => [
  scope.accountId,
  "onboarding",
];

export function useWorkspaceOnboarding(scope: AccountScope, enabled: boolean) {
  const { state, refresh } = useSessionAccess();
  return useQuery({
    queryKey: onboardingKey(scope),
    enabled: enabled && state === "verified" && scope.accountId !== null,
    refetchOnWindowFocus: "always",
    async queryFn({ signal }) {
      const result = await scope.api.GET("/api/v1/onboarding", {
        params: { header: { "x-expected-account": scope.accountId ?? "" } },
        signal,
      });
      return journeyResult(result, scope, refresh);
    },
  });
}

export const OnboardingAccess = createContext<ReturnType<
  typeof useWorkspaceOnboarding
> | null>(null);

export function useOnboarding() {
  const progress = useContext(OnboardingAccess);
  if (!progress) throw new Error("The web onboarding provider is missing.");
  return progress;
}
