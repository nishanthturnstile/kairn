import { QueryClient } from "@tanstack/react-query";
import { createAuthenticatedMobileApiClient, type NativeFetch } from "./api";

interface Transport {
  origin: string;
  getCookie: () => Promise<string>;
  send: NativeFetch;
}

function accountScope(accountId: string | null, transport?: Transport) {
  const lifetime = new AbortController();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    accountId,
    queryClient,
    signal: lifetime.signal,
    api:
      accountId && transport
        ? createAuthenticatedMobileApiClient({
            ...transport,
            accountId,
            lifetime: lifetime.signal,
          })
        : undefined,
    dispose() {
      lifetime.abort();
      void queryClient.cancelQueries();
      queryClient.clear();
    },
  };
}

export type MobileAccountScope = ReturnType<typeof accountScope>;
export type VerifiedMobileScope = MobileAccountScope & {
  accountId: string;
  api: NonNullable<MobileAccountScope["api"]>;
};

export function isVerifiedMobileScope(
  scope: MobileAccountScope,
): scope is VerifiedMobileScope {
  return Boolean(scope.accountId && scope.api);
}

export function createMobileSession(transport?: Transport) {
  let scope = accountScope(null, transport);
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => scope,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setVerifiedAccount(accountId: string | null) {
      if (scope.accountId === accountId) return;
      scope.dispose();
      scope = accountScope(accountId, transport);
      for (const listener of listeners) listener();
    },
  };
}
