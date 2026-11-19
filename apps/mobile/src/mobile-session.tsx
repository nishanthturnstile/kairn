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
  const signingOut = useRef(false);
  const scope = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const accountId =
    !current.error && current.data?.user.emailVerified
      ? current.data.user.id
      : null;
  const refetch = current.refetch;
  const recheck = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useEffect(() => {
    if (!checking && !current.isPending) store.setVerifiedAccount(accountId);
  }, [accountId, checking, current.isPending]);

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && previous !== "active") {
        const active = store.getSnapshot();
        void recheck().then(() => {
          if (!active.signal.aborted)
            void active.queryClient.invalidateQueries({
              queryKey: ["journeys"],
            });
        });
      }
      previous = state;
    });
    return () => subscription.remove();
  }, [recheck]);

  function refresh(rejectedScope?: MobileAccountScope) {
    if (
      signingOut.current ||
      (rejectedScope && rejectedScope !== store.getSnapshot())
    )
      return;
    setChecking(true);
    store.setVerifiedAccount(null);
    void recheck().finally(() => setChecking(false));
  }

  async function signOut() {
    if (!client || signingOut.current) return false;
    signingOut.current = true;
    setChecking(true);
    store.setVerifiedAccount(null);
    try {
      const { error } = await client.signOut();
      await recheck();
      return !error;
    } catch {
      await recheck();
      return false;
    } finally {
      signingOut.current = false;
      setChecking(false);
    }
  }

  const state = !client
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
    state === "verified" && isVerifiedMobileScope(scope) ? scope : undefined;
  return (
    <QueryClientProvider client={scope.queryClient}>
      <Context.Provider
        value={{
          state,
          scope: verified,
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
