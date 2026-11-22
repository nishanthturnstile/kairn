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
  const [signOutError, setSignOutError] = useState<string>();
  const [submittingSignOut, setSubmittingSignOut] = useState(false);
  const [signOutRequested, setSignOutRequested] = useState(false);
  const [signInAccount, setSignInAccountId] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const signOutInFlight = useRef(false);
  const signOutOriginRejected = useRef(false);
  const previousAccount = useRef<string | null>(null);
  const switchingInvitationAccount = useRef(false);
  const setSignInAccount = useCallback((id: string | null) => {
    if (id) setSignOutError(undefined);
    setSignInAccountId(id);
  }, []);
  const accountId =
    !current.error && current.data?.user?.emailVerified
      ? current.data.user.id
      : null;
  // The automatic sign-out refresh can replace the explicit session request.
  const signOutPending =
    signOutRequested &&
    (submittingSignOut ||
      rechecking ||
      current.isRefetching ||
      current.isPending);
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
  const recheck = useCallback(async () => {
    if (refreshInFlight.current || signOutInFlight.current) return;
    refreshInFlight.current = true;
    setRechecking(true);
    session.setVerifiedAccount(null);
    try {
      await refetch();
    } finally {
      refreshInFlight.current = false;
      setRechecking(false);
    }
  }, [refetch]);
  const refresh = useCallback(
    (rejectedScope?: AccountScope) => {
      if (rejectedScope && session.getSnapshot() !== rejectedScope) return;
      void recheck();
    },
    [recheck],
  );
  async function signOut(options?: { switchInvitationAccount?: boolean }) {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    signOutOriginRejected.current = false;
    const invitation = readInvitationHandoff();
    switchingInvitationAccount.current = Boolean(
      options?.switchInvitationAccount && invitation && !invitation.accountId,
    );
    if (!switchingInvitationAccount.current) clearInvitationHandoff();
    setSignOutError(undefined);
    setSignOutRequested(true);
    setSubmittingSignOut(true);
    setSignInAccount(null);
    session.setVerifiedAccount(null);
    try {
      try {
        const { error } = await authClient.signOut();
        signOutOriginRejected.current = error?.code === "INVALID_ORIGIN";
      } catch {
        // The request may have committed before its response was lost.
      }
      // Check the server even if an earlier refresh is in flight or the POST failed.
      await refetch();
    } finally {
      setSubmittingSignOut(false);
    }
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
    if (state === "signed-out") setSignOutError(undefined);
    if (!signOutRequested || state === "checking") return;
    if (state === "signed-out") {
      notify("You’re signed out.");
    } else {
      setSignOutError(
        signOutOriginRejected.current
          ? "Couldn’t sign out from this address. Open Kairn at its configured address and try again."
          : state === "unavailable"
            ? "Couldn’t confirm that you signed out. Try again."
            : "Couldn’t sign out. Try again.",
      );
    }
    signOutInFlight.current = false;
    setSignOutRequested(false);
  }, [signOutRequested, state, notify]);
  return (
    <SessionAccess.Provider
      value={{
        state,
        refresh,
        signOut,
        signOutError,
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
