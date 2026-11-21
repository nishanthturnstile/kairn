import {
  createRootRouteWithContext,
  Link,
  Navigate,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppearanceSwitcher } from "../components/appearance-switcher";
import { AuthLayout } from "../components/auth-layout";
import { JourneyLoading, JourneyRetry } from "../components/journeys/states";
import { Button } from "../components/ui/button";
import { WorkspaceLayout } from "../components/workspace-layout";
import { publicEnvironment } from "../env";
import { clearInvitationHandoff } from "../lib/invitation-handoff";
import {
  boundJourneyReturn,
  clearJourneyReturn,
  discardOtherAccountReturn,
  journeyReturnTo,
  saveJourneyReturnTo,
  workspaceDestination,
} from "../lib/journey-return";
import { OnboardingAccess, useWorkspaceOnboarding } from "../lib/onboarding";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";

export const Route = createRootRouteWithContext<{
  scope: AccountScope;
}>()({
  component: AppShell,
});

function AppShell() {
  const { scope } = Route.useRouteContext();
  const access = useSessionAccess();
  const pathname = useRouterState({
    select: ({ matches, location }) =>
      (matches.at(-1)?.pathname ?? location.pathname).replace(/\/+$/, "") ||
      "/",
  });
  const onboarding = pathname === "/onboarding";
  if (
    access.state !== "verified" ||
    pathname === "/account/reset" ||
    pathname === "/journey-invitations"
  ) {
    return (
      <AuthLayout>
        <WorkspaceEntry scope={scope} pathname={pathname} />
      </AuthLayout>
    );
  }
  if (!onboarding && scope.accountId) {
    return (
      <WorkspaceLayout
        scope={scope}
        accountId={scope.accountId}
        pathname={pathname}
      >
        <WorkspaceEntry scope={scope} pathname={pathname} />
      </WorkspaceLayout>
    );
  }
  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr]">
      <Button
        asChild
        variant="outline"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-20"
      >
        <a href="#main">Skip to content</a>
      </Button>
      <header className="control-border-b bg-card">
        <div className="mx-auto flex max-w-[67rem] flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 sm:py-3 lg:px-8">
          <Link
            to="/dashboard"
            className="flex min-h-touch items-center text-xl font-semibold text-primary hover:underline"
          >
            {publicEnvironment.appName}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <AppearanceSwitcher />
            <Button asChild variant="ghost">
              <Link to="/account">Account</Link>
            </Button>
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full min-w-0 max-w-[72rem] wrap-anywhere px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
      >
        <WorkspaceEntry scope={scope} pathname={pathname} />
      </main>
    </div>
  );
}

function WorkspaceEntry({
  scope,
  pathname,
}: {
  scope: AccountScope;
  pathname: string;
}) {
  const access = useSessionAccess();
  const onboarding = pathname === "/onboarding";
  const progress = useWorkspaceOnboarding(scope, pathname !== "/account/reset");
  const outlet = (
    <OnboardingAccess.Provider value={progress}>
      <Outlet />
    </OnboardingAccess.Provider>
  );

  useEffect(() => {
    if (
      ![
        "/",
        "/account",
        "/account/reset",
        "/onboarding",
        "/journey-invitations",
      ].includes(pathname)
    )
      clearInvitationHandoff();
    if (access.state !== "verified" || !scope.accountId) return;
    discardOtherAccountReturn(scope.accountId);
    if (
      progress.data &&
      progress.data.state !== "pending" &&
      boundJourneyReturn(scope.accountId) === pathname
    )
      clearJourneyReturn(scope.accountId);
  }, [access.state, pathname, progress.data, scope.accountId]);

  if (
    pathname === "/account" ||
    pathname === "/account/reset" ||
    pathname === "/journey-invitations"
  )
    return outlet;
  if (access.state === "checking")
    return (
      <JourneyLoading
        label={access.signOutPending ? "Signing out" : "Checking your session"}
      />
    );
  if (access.state !== "verified" || !scope.accountId) {
    return (
      <Navigate
        to="/account"
        search={{ returnTo: journeyReturnTo(pathname) }}
        replace
      />
    );
  }
  if (progress.isError)
    return (
      <div className="grid max-w-2xl gap-4">
        <JourneyRetry
          title="Couldn’t check your setup"
          busy={progress.isFetching}
          retry={() => void progress.refetch()}
        />
        <Button asChild variant="outline" className="justify-self-start">
          <Link to="/account">Account</Link>
        </Button>
      </div>
    );
  if (!progress.data) return <JourneyLoading label="Checking your setup" />;
  if (progress.data.state === "pending" && !onboarding)
    return <EnterOnboarding accountId={scope.accountId} pathname={pathname} />;
  if (pathname === "/") {
    const target = boundJourneyReturn(scope.accountId);
    return <Navigate {...workspaceDestination(target)} replace />;
  }
  return outlet;
}

function EnterOnboarding({
  accountId,
  pathname,
}: {
  accountId: string;
  pathname: string;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    const target = journeyReturnTo(pathname);
    if (target) saveJourneyReturnTo(target, accountId);
    void navigate({ to: "/onboarding", replace: true });
  }, [accountId, navigate, pathname]);
  return <JourneyLoading label="Opening setup" />;
}
