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
  const [signOutRequested, setSignOutRequested] = useState(false);
  const [signInAccount, setSignInAccountId] = useState<string | null>(null);
  const transition = useRef(false);
  const setSignInAccount = useCallback((id: string | null) => {
    if (id) setSignOutRequested(false);
    setSignInAccountId(id);
  }, []);
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
    setSignOutRequested(true);
    setSignInAccount(null);
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
  const showSignedOut = signOutRequested && state === "signed-out";
  useEffect(() => {
    if (signOutRequested && state === "verified") setSignOutRequested(false);
    if (!showSignedOut) return;
    const timeout = window.setTimeout(() => setSignOutRequested(false), 5_000);
    return () => window.clearTimeout(timeout);
  }, [showSignedOut, signOutRequested, state]);
  return (
    <SessionAccess.Provider
      value={{
        state,
        refresh,
        signOut,
        signOutFailed,
        signOutPending: signOutRequested && rechecking,
        signInAccount,
        setSignInAccount,
      }}
    >
      <QueryClientProvider
        key={scope.accountId ?? "signed-out"}
        client={scope.queryClient}
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
      <div
        role="status"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex"
      >
        {showSignedOut && (
          <div className="sign-out-toast flex min-w-0 items-center gap-3 rounded-card bg-primary px-4 py-3 font-semibold text-primary-foreground wrap-anywhere shadow-[0_4px_16px_rgb(0_0_0/14%)]">
            <span
              aria-hidden="true"
              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-current"
            >
              <span className="confirmation-check" />
            </span>
            You’re signed out.
          </div>
        )}
      </div>
    </SessionAccess.Provider>
  );
}
