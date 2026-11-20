import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthForm, type AuthMode } from "../components/auth-form";
import { JourneyLoading } from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { ProfileName } from "../components/profile-name";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { authClient } from "../lib/auth";
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

type Feedback = {
  text: string;
  variant: "default" | "destructive" | "success" | "warning";
};

const feedbackTextClass = {
  default: "text-muted-foreground",
  destructive: "text-destructive",
  success: "text-success",
  warning: "text-warning",
};

function AccountPage() {
  const { data } = authClient.useSession();
  const { scope } = Route.useRouteContext();
  const verification = Route.useSearch();
  const navigate = Route.useNavigate();
  const {
    state,
    refresh,
    signOutFailed,
    signOutPending,
    signInAccount,
    setSignInAccount,
  } = useSessionAccess();
  const { returnTo, verification: confirmed } = verification;
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
      <section className="grid gap-4 rounded-card control-border bg-card p-4 sm:p-8">
        <PageHeading title="Sign in" />
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            Account access is temporarily unavailable.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => refresh()}
        >
          Try again
        </Button>
      </section>
    );
  if (
    state === "verified" &&
    scope.accountId &&
    data?.user.id === scope.accountId
  ) {
    if (returnTo || signInAccount === scope.accountId)
      return <output className="text-muted-foreground">Opening Kairn</output>;
    return (
      <section className="grid max-w-lg gap-6">
        <PageHeading
          title="Account"
          description="Manage your profile, current session and signed-in devices."
        />
        {signOutFailed && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>Couldn’t sign out. Try again.</AlertDescription>
          </Alert>
        )}
        {progress.data?.state === "pending" && (
          <Button asChild className="justify-self-start">
            <Link to="/onboarding">Resume setup</Link>
          </Button>
        )}
        <ProfileName accountId={scope.accountId} scope={scope} />
        <SignedInAccount email={data.user.email} id={scope.accountId} />
      </section>
    );
  }
  return (
    <div className="grid gap-4">
      {verification.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            That verification link is invalid or has expired.
          </AlertDescription>
        </Alert>
      )}
      {verification.passwordReset && (
        <Alert
          variant={
            verification.passwordReset === "pending" ? "warning" : "success"
          }
          role="status"
        >
          <AlertDescription>
            {verification.passwordReset === "pending"
              ? "Password changed and devices signed out. Recovery confirmation is pending."
              : "Password changed. Sign in with your new password."}
          </AlertDescription>
        </Alert>
      )}
      <AuthForm
        mode={verification.mode ?? "sign-in"}
        canResumeUnbound={Boolean(returnTo || confirmed)}
        emailVerificationConfirmed={
          confirmed === "confirmed" && !verification.error
        }
        showResend={Boolean(verification.error)}
        onModeChange={(mode) =>
          void navigate({
            search: (previous) => ({
              ...previous,
              mode: mode === "sign-in" ? undefined : mode,
            }),
          })
        }
      />
    </div>
  );
}

function SignedInAccount({ email, id }: { email: string; id: string }) {
  const { signOut } = useSessionAccess();
  const [feedback, setFeedback] = useState<Feedback>();
  const [revoking, setRevoking] = useState(false);
  const devices = useQuery({
    queryKey: [id, "devices"],
    async queryFn({ signal }) {
      const { data, error } = await authClient.$fetch<IdentityDevices>(
        "/devices",
        { signal },
      );
      if (error) throw new Error("Device list unavailable");
      return data;
    },
  });

  async function revoke(deviceId: string) {
    setFeedback(undefined);
    setRevoking(true);
    try {
      const { data, error } = await authClient.$fetch<RestrictionConfirmation>(
        "/devices/revoke",
        { method: "POST", body: { id: deviceId } },
      );
      if (error) {
        setFeedback({
          variant: "destructive",
          text: "Couldn’t revoke this session. Sign in again to refresh your session.",
        });
        return;
      }
      const pending = data?.confirmation === "pending";
      setFeedback({
        variant: pending ? "warning" : "success",
        text: pending
          ? "Device signed out. Recovery confirmation is pending."
          : "Device signed out.",
      });
      await devices.refetch();
    } catch {
      setFeedback({
        variant: "destructive",
        text: "Couldn’t reach Kairn. Try again.",
      });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4 rounded-card control-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <p className="min-w-0 font-semibold">{email}</p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
      <h2 className="text-xl font-semibold">Signed-in devices</h2>
      {devices.isPending && (
        <output className="text-muted-foreground">Loading devices</output>
      )}
      {devices.isError && (
        <p className="text-destructive" role="alert">
          Couldn’t load your devices.
        </p>
      )}
      {devices.data && (
        <ul className="grid gap-3">
          {devices.data.devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
            >
              {device.id === devices.data?.currentDeviceId ? (
                <p>This device</p>
              ) : (
                <>
                  <p>
                    Session started{" "}
                    <time dateTime={device.createdAt}>
                      {new Date(device.createdAt).toLocaleString("en-IN")}
                    </time>
                  </p>
                  <Button
                    variant="outline"
                    disabled={revoking}
                    onClick={() => void revoke(device.id)}
                  >
                    Revoke device
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {feedback && (
        <p className={feedbackTextClass[feedback.variant]} role="status">
          {feedback.text}
        </p>
      )}
      {!feedback && Boolean(devices.data?.pendingRestrictions) && (
        <p className="text-warning" role="status">
          Account changes await recovery confirmation.
        </p>
      )}
    </div>
  );
}
