import { QueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "./api";

function createAccountScope(accountId: string | null, origin: string) {
  const lifetime = new AbortController();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 15_000 },
      mutations: { retry: false },
    },
  });
  const api = createWebApiClient();

  api.use({
    onRequest({ request }) {
      lifetime.signal.throwIfAborted();
      if (new URL(request.url).origin !== origin)
        throw new Error("API requests must use the application origin.");
      return new Request(request, {
        signal: AbortSignal.any([request.signal, lifetime.signal]),
        redirect: "error",
        cache: "no-store",
        credentials: "same-origin",
      });
    },
    onResponse() {
      lifetime.signal.throwIfAborted();
    },
  });

  return {
    accountId,
    api,
    queryClient,
    dispose() {
      lifetime.abort();
      void queryClient.cancelQueries();
      queryClient.clear();
    },
  };
}

export type AccountScope = ReturnType<typeof createAccountScope>;

export function createWebSession(origin: string) {
  let scope = createAccountScope(null, origin);
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
      scope = createAccountScope(accountId, origin);
      for (const listener of listeners) listener();
    },
  };
}
