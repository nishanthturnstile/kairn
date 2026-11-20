import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { initializeAppearance } from "./lib/appearance";
import { authClient } from "./lib/auth";
import type { AccountScope } from "./lib/session";
import { createWebSession } from "./lib/session";
import { SessionAccess } from "./lib/session-access";
import { routeTree } from "./routeTree.gen";
import "./index.css";

initializeAppearance();
const session = createWebSession(window.location.origin);

function createCreatorRouter(scope: ReturnType<typeof session.getSnapshot>) {
  return createRouter({
    routeTree,
    context: { scope },
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createCreatorRouter>;
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("The application root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <CreatorApp />
  </StrictMode>,
);

function CreatorApp() {
  const current = authClient.useSession();
  const [rechecking, setRechecking] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const transition = useRef(false);
  const accountId =
    !current.error && current.data?.user?.emailVerified
      ? current.data.user.id
      : null;
  useEffect(() => {
    if (!current.isPending && !rechecking)
      session.setVerifiedAccount(accountId);
  }, [accountId, current.isPending, rechecking]);
  const scope = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const router = useMemo(() => createCreatorRouter(scope), [scope]);
  const refetch = current.refetch;
  const recheck = useCallback(
    async (action?: () => Promise<void>) => {
      if (transition.current) return;
      transition.current = true;
      setRechecking(true);
      session.setVerifiedAccount(null);
      try {
        await action?.();
        await refetch();
      } finally {
        transition.current = false;
        setRechecking(false);
      }
    },
    [refetch],
  );
  const refresh = useCallback(
    (rejectedScope?: AccountScope) => {
      if (rejectedScope && session.getSnapshot() !== rejectedScope) return;
      void recheck();
    },
    [recheck],
  );
  function signOut() {
    void recheck(async () => {
      setSignOutFailed(false);
      try {
        setSignOutFailed(Boolean((await authClient.signOut()).error));
      } catch {
        setSignOutFailed(true);
      }
    });
  }
  const state =
    rechecking || current.isPending
      ? "checking"
      : current.error
        ? "unavailable"
        : accountId !== scope.accountId
          ? "checking"
          : accountId
            ? "verified"
            : "signed-out";
  return (
    <SessionAccess.Provider value={{ state, refresh, signOut, signOutFailed }}>
      <QueryClientProvider
        key={scope.accountId ?? "signed-out"}
        client={scope.queryClient}
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionAccess.Provider>
  );
}
