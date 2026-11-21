import {
  type Href,
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { authOrigin } from "./auth";
import { sessionStoragePrefix } from "./auth-origin";
import { Action, AppText, StatusNotice } from "./components/ui";
import {
  clearInvitationHandoff,
  readInvitationHandoff,
  saveInvitationHandoff,
  useInvitationExpiry,
  useInvitationHandoff,
} from "./invitation-handoff";
import { invitationPath } from "./invitation-link";
import { useMobileSession } from "./mobile-session";
import { useNativeOnboarding } from "./workspace-queries";
import {
  liveExpiry,
  type ReturnHandoff,
  readReturnHandoff,
  returnLifetime,
  workspaceHref,
  workspaceTarget,
} from "./workspace-return";

const storageKey = authOrigin
  ? `${sessionStoragePrefix(authOrigin)}_workspace_return`
  : undefined;
const storageOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type SignInEntry = { accountId: string };
type UnboundReturn = Pick<ReturnHandoff, "target" | "expiresAt">;

const WorkspaceContext = createContext<{
  progress: ReturnType<typeof useNativeOnboarding>;
  handoff?: ReturnHandoff;
  entry?: SignInEntry;
  signedIn: (entry: SignInEntry) => void;
  retainInvitationForSignIn: () => void;
  finishOnDashboard: (accountId: string) => void;
} | null>(null);

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Workspace provider is missing.");
  return workspace;
}

function restoreHandoff() {
  try {
    return storageKey
      ? readReturnHandoff(
          SecureStore.getItem(storageKey, storageOptions),
          Date.now(),
        )
      : undefined;
  } catch {
    return undefined;
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { scope, state } = useMobileSession();
  const progress = useNativeOnboarding(scope);
  const pathname = usePathname();
  const ready = Boolean(useRootNavigationState()?.key);
  const router = useRouter();
  const [entry, signedIn] = useState<SignInEntry>();
  const [handoff, setHandoff] = useState(restoreHandoff);
  const invitation = useInvitationHandoff();
  useInvitationExpiry(invitation.handoff);
  const continuation = readInvitationHandoff();
  const hasInvitation = Boolean(
    invitation.token ||
      (continuation &&
        (!scope ||
          !continuation.accountId ||
          continuation.accountId === scope.accountId)),
  );
  const unbound = useRef<UnboundReturn>(undefined);
  const retainInvitationForSignIn = useCallback(() => {
    unbound.current = {
      target: invitationPath,
      expiresAt: Date.now() + returnLifetime,
    };
  }, []);
  const previousPath = useRef<string>(undefined);
  const admittedPath = useRef<string>(undefined);
  const inFlightRoute = useRef<string>(undefined);
  const saveReturn = useCallback((value?: ReturnHandoff) => {
    setHandoff(value);
    if (!storageKey) return;
    try {
      SecureStore.setItem(
        storageKey,
        value ? JSON.stringify(value) : "",
        storageOptions,
      );
    } catch {
      // The current app session can still use its in-memory return.
    }
  }, []);
  const finishOnDashboard = useCallback(
    (accountId: string) => {
      saveReturn({
        accountId,
        target: "/dashboard",
        expiresAt: Date.now() + returnLifetime,
      });
    },
    [saveReturn],
  );
  const checkpoint = progress.data;
  const failed = progress.isError;

  useEffect(() => {
    if (!ready) return;
    const lastPath = previousPath.current;
    previousPath.current = pathname;
    const invitationRoutes = [invitationPath, "/account", "/onboarding"];
    if (
      lastPath &&
      lastPath !== pathname &&
      invitationRoutes.includes(lastPath) &&
      !invitationRoutes.includes(pathname) &&
      pathname !== "/" &&
      hasInvitation
    )
      clearInvitationHandoff();
    // A screen already entered with access is not a new return after revocation.
    if (admittedPath.current !== pathname) admittedPath.current = undefined;
    if (inFlightRoute.current === pathname) return;
    inFlightRoute.current = undefined;
    function replace(target: Href) {
      inFlightRoute.current = pathname;
      router.replace(target);
    }

    const now = Date.now();
    const incoming = workspaceTarget(pathname);
    if (state === "signed-out") {
      if (entry) signedIn(undefined);
      if (pathname === invitationPath) {
        unbound.current = hasInvitation
          ? { target: invitationPath, expiresAt: now + returnLifetime }
          : undefined;
        return;
      }
      if (pathname === "/" && hasInvitation) {
        replace(invitationPath);
        return;
      }
      if (pathname !== "/account") {
        unbound.current =
          incoming && admittedPath.current !== pathname
            ? { target: incoming, expiresAt: now + returnLifetime }
            : undefined;
        inFlightRoute.current = pathname;
        router.dismissTo("/account");
      }
      return;
    }

    if (state !== "verified" || !scope) return;
    const accountId = scope.accountId;
    if (
      invitation.handoff?.accountId &&
      invitation.handoff.accountId !== accountId
    )
      saveInvitationHandoff();
    let retained = handoff;
    if (
      retained &&
      (retained.accountId !== accountId ||
        !liveExpiry(retained.expiresAt, now) ||
        (retained.target === invitationPath && !hasInvitation))
    ) {
      saveReturn();
      retained = undefined;
    }
    if (!checkpoint || failed) return;
    const pending = checkpoint.state === "pending";
    const fromSignIn =
      pathname === "/account" && entry?.accountId === accountId;

    if (fromSignIn) {
      const continuation = unbound.current;
      const freshReturn =
        continuation &&
        liveExpiry(continuation.expiresAt, now) &&
        (continuation.target !== invitationPath || hasInvitation)
          ? continuation
          : undefined;
      signedIn(undefined);
      unbound.current = undefined;
      if (freshReturn) {
        retained = { accountId, ...freshReturn };
        saveReturn(retained);
      }
      replace(pending ? "/onboarding" : workspaceHref(retained?.target));
    } else if (pathname === "/account") {
      return;
    } else if (pending && pathname !== "/onboarding") {
      const target =
        pathname === "/" && hasInvitation ? invitationPath : incoming;
      if (target && admittedPath.current !== pathname) {
        saveReturn({
          accountId,
          target,
          expiresAt: now + returnLifetime,
        });
      }
      replace("/onboarding");
    } else if (!pending && (pathname === "/" || pathname === "/onboarding")) {
      const target =
        retained?.target ??
        (pathname === "/" && hasInvitation ? invitationPath : undefined);
      replace(workspaceHref(target));
    } else if (!pending) {
      admittedPath.current = pathname;
      if (incoming && retained?.target === incoming) saveReturn();
    }
  }, [
    checkpoint,
    entry,
    failed,
    handoff,
    hasInvitation,
    invitation.handoff?.accountId,
    pathname,
    ready,
    router,
    saveReturn,
    scope,
    state,
  ]);

  return (
    <WorkspaceContext.Provider
      value={{
        progress,
        handoff,
        entry,
        signedIn,
        finishOnDashboard,
        retainInvitationForSignIn,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function WorkspaceWaiting() {
  const router = useRouter();
  const { state, refresh } = useMobileSession();
  const { progress } = useWorkspace();
  const sessionFailed = state === "unavailable";
  const failed = sessionFailed || (state === "verified" && progress.isError);
  return (
    <SafeAreaView style={styles.waiting}>
      <AppText text="Kairn" variant="section" accessibilityRole="header" />
      <StatusNotice
        notice={
          failed
            ? {
                text: sessionFailed
                  ? "Couldn’t check your session."
                  : "Couldn’t check your setup.",
                tone: "error",
              }
            : {
                text:
                  state === "verified"
                    ? "Opening your workspace"
                    : "Checking your session",
                tone: "info",
              }
        }
      />
      {failed && (
        <Action
          label="Try again"
          onPress={() => (sessionFailed ? refresh() : void progress.refetch())}
        />
      )}
      {failed && (
        <Action label="Account" onPress={() => router.push("/account")} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(({ semantic: { color, space } }) => ({
  waiting: {
    flex: 1,
    backgroundColor: color.canvas,
    justifyContent: "center",
    gap: space.step12,
    padding: space.step24,
  },
}));
