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
import { LaunchFeedback } from "./components/ui/loading";
import { ToastProvider, useReceiptToast } from "./components/ui/toast";
import { initializeAppearance } from "./lib/appearance";
import { authClient } from "./lib/auth";
import {
  captureInvitationFragment,
  clearInvitationHandoff,
  readInvitationHandoff,
} from "./lib/invitation-handoff";
import type { AccountScope } from "./lib/session";
import { createWebSession } from "./lib/session";
import { SessionAccess } from "./lib/session-access";
import { routeTree } from "./routeTree.gen";
import "./index.css";

initializeAppearance();
captureInvitationFragment();
const session = createWebSession(window.location.origin);

function createCreatorRouter(scope: ReturnType<typeof session.getSnapshot>) {
  return createRouter({
    routeTree,
    context: { scope },
    scrollRestoration: true,
    defaultPendingComponent: LaunchFeedback,
    defaultPendingMs: 200,
    defaultPendingMinMs: 0,
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
    <ToastProvider>
      <CreatorApp />
    </ToastProvider>
  </StrictMode>,
);

function CreatorApp() {
  const notify = useReceiptToast();
  const current = authClient.useSession();
  const [rechecking, setRechecking] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [signOutRequested, setSignOutRequested] = useState(false);
  const [signInAccount, setSignInAccountId] = useState<string | null>(null);
  const transition = useRef(false);
  const previousAccount = useRef<string | null>(null);
  const switchingInvitationAccount = useRef(false);
  const setSignInAccount = useCallback((id: string | null) => {
    if (id) setSignOutRequested(false);
    setSignInAccountId(id);
  }, []);
  const accountId =
    !current.error && current.data?.user?.emailVerified
      ? current.data.user.id
      : null;
  // The automatic sign-out refresh can replace the explicit session request.
  const signOutPending =
    signOutRequested &&
    (rechecking || (accountId !== null && current.isRefetching));
  const checking = current.isPending || rechecking || signOutPending;
  useEffect(() => {
    if (!checking) {
      if (
        !current.error &&
        previousAccount.current &&
        previousAccount.current !== accountId
      ) {
        if (!(switchingInvitationAccount.current && accountId === null))
          clearInvitationHandoff();
        switchingInvitationAccount.current = false;
      }
      if (!current.error) previousAccount.current = accountId;
      session.setVerifiedAccount(accountId);
    }
  }, [accountId, checking, current.error]);
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
  function signOut(options?: { switchInvitationAccount?: boolean }) {
    switchingInvitationAccount.current = Boolean(
      options?.switchInvitationAccount &&
        readInvitationHandoff() &&
        !readInvitationHandoff()?.accountId,
    );
    if (!switchingInvitationAccount.current) clearInvitationHandoff();
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
  const state = checking
    ? "checking"
    : current.error
      ? "unavailable"
      : accountId !== scope.accountId
        ? "checking"
        : accountId
          ? "verified"
          : "signed-out";

  useEffect(() => {
    if (!signOutRequested || state === "checking") return;
    if (state === "signed-out") notify("You’re signed out.");
    setSignOutRequested(false);
  }, [signOutRequested, state, notify]);
  return (
    <SessionAccess.Provider
      value={{
        state,
        refresh,
        signOut,
        signOutFailed,
        signOutPending,
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
    </SessionAccess.Provider>
  );
}
