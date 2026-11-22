import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountSettings } from "../components/account/settings";
import { AuthForm, type AuthMode } from "../components/auth/form";
import { AuthScreen } from "../components/auth/screen";
import { JourneyLoading } from "../components/journeys/states";
import { Button } from "../components/ui/button";
import { authClient } from "../lib/auth";
import { readInvitationHandoff } from "../lib/invitation-handoff";
import { journeyReturnTo, saveJourneyReturnTo } from "../lib/journey-return";
import { useOnboarding } from "../lib/onboarding";
import { useSessionAccess } from "../lib/session-access";

export const Route = createFileRoute("/account")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    mode?: AuthMode;
    verification?: "confirmed";
    passwordReset?: "complete" | "pending";
    error?: string;
    returnTo?: ReturnType<typeof journeyReturnTo>;
  } => ({
    mode:
      search.mode === "sign-up" ||
      search.mode === "recover" ||
      search.mode === "resend"
        ? search.mode
        : undefined,
    verification:
      search.verification === "confirmed" ? ("confirmed" as const) : undefined,
    passwordReset:
      search.passwordReset === "complete" || search.passwordReset === "pending"
        ? search.passwordReset
        : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    returnTo: journeyReturnTo(search.returnTo),
  }),
  component: AccountPage,
});

function AccountPage() {
  const { data } = authClient.useSession();
  const { scope } = Route.useRouteContext();
  const verification = Route.useSearch();
  const navigate = Route.useNavigate();
  const {
    state,
    refresh,
    signOutError,
    signOut,
    signOutPending,
    signInAccount,
    setSignInAccount,
  } = useSessionAccess();
  const confirmed = verification.error ? undefined : verification.verification;
  const returnTo =
    verification.returnTo ??
    (confirmed && readInvitationHandoff() ? "/journey-invitations" : undefined);
  const progress = useOnboarding();
  const [hadGuestForm, setHadGuestForm] = useState(state === "signed-out");
  useEffect(() => {
    if (state === "signed-out") setHadGuestForm(true);
  }, [state]);
  useEffect(() => {
    const accountId = state === "verified" ? scope.accountId : null;
    if (returnTo && state !== "checking")
      saveJourneyReturnTo(returnTo, accountId ?? undefined);
    if (!accountId || (!returnTo && signInAccount !== accountId)) return;
    setSignInAccount(null);
    void navigate({ to: "/", replace: true });
  }, [
    navigate,
    returnTo,
    scope.accountId,
    setSignInAccount,
    signInAccount,
    state,
  ]);
  if (state === "checking" && (!hadGuestForm || signOutPending))
    return (
      <JourneyLoading
        label={signOutPending ? "Signing out" : "Checking your session"}
      />
    );
  if (state === "unavailable")
    return (
      <AuthScreen
        title={
          signOutError ? "Sign-out unavailable" : "Account access unavailable"
        }
        description={
          signOutError ??
          "Kairn couldn’t check your session. Try again to reconnect."
        }
      >
        <Button
          size="lg"
          onClick={() => (signOutError ? void signOut() : refresh())}
        >
          Try again
        </Button>
      </AuthScreen>
    );
  if (
    state === "verified" &&
    scope.accountId &&
    data?.user.id === scope.accountId
  ) {
    if (returnTo || signInAccount === scope.accountId)
      return <output className="text-muted-foreground">Opening Kairn</output>;
    return (
      <AccountSettings
        key={scope.accountId}
        scope={scope}
        accountId={scope.accountId}
        name={data.user.name}
        email={data.user.email}
        resumeSetup={progress.data?.state === "pending"}
        signOutError={signOutError}
      />
    );
  }
  return (
    <AuthForm
      mode={verification.mode ?? "sign-in"}
      canResumeUnbound={Boolean(returnTo || confirmed)}
      verification={verification.error ? "invalid" : confirmed}
      passwordReset={verification.passwordReset}
      onModeChange={(mode) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            verification: previous.error ? undefined : previous.verification,
            error: undefined,
            mode: mode === "sign-in" ? undefined : mode,
          }),
        })
      }
    />
  );
}
