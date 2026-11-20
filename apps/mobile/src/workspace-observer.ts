import type { OnboardingProgress } from "@kairn/contracts";
import { QueryObserver } from "@tanstack/react-query";
import { journeyResult } from "./journey-api";
import type { VerifiedMobileScope } from "./session";
import { onboardingKey } from "./workspace-keys";

export function observeOnboarding(
  scope: VerifiedMobileScope,
  refresh: (rejectedScope: VerifiedMobileScope) => void,
) {
  return new QueryObserver<OnboardingProgress>(scope.queryClient, {
    queryKey: onboardingKey,
    async queryFn({ signal }) {
      return journeyResult(
        await scope.api.GET("/api/v1/onboarding", {
          params: { header: { "x-expected-account": scope.accountId } },
          signal,
        }),
        scope,
        refresh,
      );
    },
  });
}
