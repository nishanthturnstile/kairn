import { createContext, useContext } from "react";
import type { AccountScope } from "./session";

export const SessionAccess = createContext<{
  state: "checking" | "signed-out" | "verified" | "unavailable";
  refresh: (rejectedScope?: AccountScope) => void;
  signOut: (options?: { switchInvitationAccount?: boolean }) => void;
  signOutFailed: boolean;
  signOutPending: boolean;
  signInAccount: string | null;
  setSignInAccount: (accountId: string | null) => void;
} | null>(null);

export function useSessionAccess() {
  const access = useContext(SessionAccess);
  if (!access) throw new Error("The web session provider is missing.");
  return access;
}
