import { QueryClientProvider } from "@tanstack/react-query";
import { fetch as nativeFetch } from "expo/fetch";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { authOrigin, mobileAuth } from "./auth";
import {
  createMobileSession,
  isVerifiedMobileScope,
  type MobileAccountScope,
  type VerifiedMobileScope,
} from "./session";

import {
  dashboardKey,
  devicesKey,
  onboardingKey,
  profileKey,
} from "./workspace-keys";

const client = mobileAuth;
const store = createMobileSession(
  client && authOrigin
    ? {
        origin: authOrigin,
        send: nativeFetch,
        getCookie: () => client.getCookie(),
      }
    : undefined,
);
const useAuthSession =
  client?.useSession ??
  (() => ({
    data: null,
    isPending: false,
    error: null,
    refetch: async () => {},
  }));

const Context = createContext<{
  state: "checking" | "signed-out" | "verified" | "unavailable";
  scope?: VerifiedMobileScope;
  isRevalidating: boolean;
  canSubmit: (scope: VerifiedMobileScope) => boolean;
  recheck: () => Promise<void>;
  refresh: (rejectedScope?: MobileAccountScope) => void;
  signOut: () => Promise<boolean>;
} | null>(null);

export function useMobileSession() {
  const session = useContext(Context);
  if (!session) throw new Error("The mobile session provider is missing.");
  return session;
}

export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const current = useAuthSession();
  const [checking, setChecking] = useState(false);
  const [isRevalidating, setRevalidating] = useState(false);
  const signingOut = useRef(false);
  const sessionCheck = useRef<Promise<void> | undefined>(undefined);
  const scope = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const accountId =
    !current.error && current.data?.user.emailVerified
      ? current.data.user.id
      : null;
  const refetch = current.refetch;
  const recheck = useCallback(() => {
    sessionCheck.current ??= refetch().finally(() => {
      sessionCheck.current = undefined;
    });
    return sessionCheck.current;
  }, [refetch]);

  useEffect(() => {
    if (!checking && !current.isPending) store.setVerifiedAccount(accountId);
  }, [accountId, checking, current.isPending]);

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && previous !== "active" && !signingOut.current) {
        const active = store.getSnapshot();
        if (isVerifiedMobileScope(active)) {
          const finish = store.beginForegroundCheck();
          setRevalidating(true);
          void recheck()
            .then(async () => {
              if (!active.signal.aborted)
                await Promise.all([
                  active.queryClient.invalidateQueries({
                    queryKey: ["journeys"],
                  }),
                  active.queryClient.invalidateQueries({
                    queryKey: dashboardKey,
                  }),
                  active.queryClient.invalidateQueries({
                    queryKey: onboardingKey,
                  }),
                  active.queryClient.invalidateQueries({
                    queryKey: profileKey,
                  }),
                  active.queryClient.invalidateQueries({
                    queryKey: devicesKey,
                  }),
                ]);
            })
            .finally(() => {
              if (finish()) setRevalidating(false);
            });
        } else void recheck();
      }
      previous = state;
    });
    return () => subscription.remove();
  }, [recheck]);

  const refresh = useCallback(
    (rejectedScope?: MobileAccountScope) => {
      if (
        signingOut.current ||
        (rejectedScope && rejectedScope !== store.getSnapshot())
      )
        return;
      setChecking(true);
      store.setVerifiedAccount(null);
      void recheck().finally(() => {
        if (!signingOut.current) setChecking(false);
      });
    },
    [recheck],
  );

  async function signOut() {
    if (!client || signingOut.current) return false;
    signingOut.current = true;
    setChecking(true);
    store.setVerifiedAccount(null);
    try {
      const { data, error } = await client.signOut();
      await refetch();
      return !error && data?.success === true;
    } catch {
      await refetch();
      return false;
    } finally {
      signingOut.current = false;
      setChecking(false);
    }
  }

  const sessionState = !client
    ? "unavailable"
    : checking || current.isPending
      ? "checking"
      : current.error
        ? "unavailable"
        : scope.accountId !== accountId
          ? "checking"
          : accountId
            ? "verified"
            : "signed-out";
  const verified =
    sessionState === "verified" && isVerifiedMobileScope(scope)
      ? scope
      : undefined;
  return (
    <QueryClientProvider client={scope.queryClient}>
      <Context.Provider
        value={{
          state: verified && isRevalidating ? "checking" : sessionState,
          scope: verified,
          isRevalidating,
          canSubmit: store.canSubmit,
          recheck,
          refresh,
          signOut,
        }}
      >
        {children}
      </Context.Provider>
    </QueryClientProvider>
  );
}
