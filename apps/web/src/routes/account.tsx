import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, LogOut, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthForm, type AuthMode } from "../components/auth/form";
import { AuthScreen } from "../components/auth/screen";
import { InviteDiscoverySetting } from "../components/invite-discovery-setting";
import { JourneyLoading } from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { ProfileName } from "../components/profile-name";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, ButtonLink } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ContentLoading } from "../components/ui/loading";
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

type Feedback = {
  text: string;
  variant: "default" | "destructive" | "success" | "warning";
};

const sessionDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
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
      <div className="@container/account grid gap-6">
        <PageHeading title="Account" />
        {signOutError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{signOutError}</AlertDescription>
          </Alert>
        )}
        {progress.data?.state === "pending" && (
          <ButtonLink
            render={<Link to="/onboarding" />}
            className="justify-self-start"
          >
            Resume setup
          </ButtonLink>
        )}
        <div className="grid items-start gap-4 @min-[48rem]/account:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <section aria-labelledby="account-profile" className="min-w-0">
            <Card>
              <CardHeader>
                <h2 id="account-profile" className="text-xl font-semibold">
                  Profile
                </h2>
              </CardHeader>
              <CardContent className="grid min-w-0 divide-y divide-border/50">
                <div className="pb-4">
                  <ProfileName
                    accountId={scope.accountId}
                    scope={scope}
                    embedded
                    fallbackName={data.user.name}
                  />
                </div>
                <dl className="grid gap-1 pt-4">
                  <dt className="text-sm font-semibold text-muted-foreground">
                    Email address
                  </dt>
                  <dd className="font-semibold wrap-anywhere">
                    {data.user.email}
                  </dd>
                  <dd className="flex items-center gap-1.5 text-sm font-semibold text-success">
                    <BadgeCheck
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    Verified
                  </dd>
                </dl>
                <InviteDiscoverySetting
                  scope={scope}
                  accountId={scope.accountId}
                />
              </CardContent>
            </Card>
          </section>
          <SignedInDevices id={scope.accountId} />
        </div>
      </div>
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

function SignedInDevices({ id }: { id: string }) {
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

  const currentDeviceId = devices.data?.currentDeviceId;
  const sessions = devices.data?.devices.toSorted(
    (a, b) =>
      Number(b.id === currentDeviceId) - Number(a.id === currentDeviceId),
  );

  return (
    <section aria-labelledby="account-devices" className="min-w-0">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="account-devices" className="text-xl font-semibold">
            Signed-in devices
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void signOut()}
          >
            <LogOut aria-hidden="true" data-icon="inline-start" />
            Sign out
          </Button>
        </CardHeader>
        <CardContent className="@container/device-list grid gap-3">
          {devices.isPending && <ContentLoading label="Loading devices" />}
          {devices.isError && (
            <Alert variant="destructive">
              <AlertDescription>Couldn’t load your devices.</AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={devices.isFetching}
                className="justify-self-start"
                onClick={() => void devices.refetch()}
              >
                Try again
              </Button>
            </Alert>
          )}
          {sessions?.length ? (
            <ul className="grid gap-2">
              {sessions.map((device) => {
                const current = device.id === currentDeviceId;
                return (
                  <li
                    key={device.id}
                    data-current={current}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border/50 px-2 py-3 sm:px-3 data-[current=true]:border-transparent data-[current=true]:bg-accent data-[current=true]:text-accent-foreground"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <MonitorSmartphone
                        aria-hidden="true"
                        className="mt-0.5 hidden size-5 shrink-0 @min-[12rem]/device-list:block"
                      />
                      <div className="grid min-w-0 gap-0.5">
                        <p className="font-semibold">
                          {current ? "This device" : "Other device"}
                        </p>
                        <p
                          className={
                            current
                              ? "text-sm"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          Signed in{" "}
                          <time dateTime={device.createdAt}>
                            {sessionDate.format(new Date(device.createdAt))}
                          </time>
                        </p>
                      </div>
                    </div>
                    {!current && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="px-2 sm:px-3"
                        disabled={revoking}
                        onClick={() => void revoke(device.id)}
                      >
                        Revoke device
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            sessions && (
              <p className="text-muted-foreground">
                No signed-in devices to show.
              </p>
            )
          )}
          {feedback && (
            <Alert
              variant={feedback.variant}
              role={feedback.variant === "destructive" ? "alert" : "status"}
            >
              <AlertDescription>{feedback.text}</AlertDescription>
            </Alert>
          )}
          {!feedback && Boolean(devices.data?.pendingRestrictions) && (
            <Alert variant="warning" role="status">
              <AlertDescription>
                Account changes await recovery confirmation.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
