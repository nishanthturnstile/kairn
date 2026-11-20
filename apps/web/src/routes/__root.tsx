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
import { publicEnvironment } from "../env";
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

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/journeys", label: "Journeys" },
  { to: "/discover", label: "Discover" },
  { to: "/saved", label: "Saved" },
  { to: "/account", label: "Account" },
] as const;

function AppShell() {
  const { scope } = Route.useRouteContext();
  const access = useSessionAccess();
  const pathname = useRouterState({
    select: ({ matches, location }) =>
      (matches.at(-1)?.pathname ?? location.pathname).replace(/\/+$/, "") ||
      "/",
  });
  const onboarding = pathname === "/onboarding";
  if (access.state !== "verified" || pathname === "/account/reset") {
    return (
      <AuthLayout>
        <WorkspaceEntry scope={scope} pathname={pathname} />
      </AuthLayout>
    );
  }
  return (
    <div
      className={
        onboarding
          ? "grid min-h-svh grid-rows-[auto_1fr]"
          : "grid min-h-svh grid-rows-[auto_1fr] lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-1"
      }
    >
      <Button
        asChild
        variant="outline"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-10"
      >
        <a href="#main">Skip to content</a>
      </Button>
      {onboarding ? (
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
      ) : (
        <header className="grid content-start gap-3 control-border-b bg-card px-4 py-3 sm:px-6 lg:gap-8 lg:border-b-0 lg:control-border-e lg:py-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:flex-col lg:items-start lg:gap-4">
            <Link
              to="/dashboard"
              className="flex min-h-touch min-w-touch items-center text-xl font-semibold text-primary hover:underline"
            >
              {publicEnvironment.appName}
            </Link>
            <AppearanceSwitcher />
          </div>
          <nav aria-label="Main" className="flex flex-wrap gap-1 lg:flex-col">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{
                  exact: to !== "/account" && to !== "/journeys",
                }}
                className="flex min-h-touch min-w-touch items-center rounded-control px-3 py-2 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground aria-[current=page]:underline aria-[current=page]:underline-offset-4"
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
      )}
      <main
        id="main"
        tabIndex={-1}
        className={
          onboarding
            ? "mx-auto w-full min-w-0 max-w-[72rem] wrap-anywhere px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
            : "mx-auto w-full min-w-0 max-w-248 wrap-anywhere px-4 py-8 sm:px-6 lg:px-section lg:py-16"
        }
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
    if (access.state !== "verified" || !scope.accountId) return;
    discardOtherAccountReturn(scope.accountId);
    if (
      progress.data &&
      progress.data.state !== "pending" &&
      boundJourneyReturn(scope.accountId) === pathname
    )
      clearJourneyReturn(scope.accountId);
  }, [access.state, pathname, progress.data, scope.accountId]);

  if (pathname === "/account" || pathname === "/account/reset") return outlet;
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
  if (pathname === "/")
    return (
      <Navigate
        {...workspaceDestination(boundJourneyReturn(scope.accountId))}
        replace
      />
    );
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
