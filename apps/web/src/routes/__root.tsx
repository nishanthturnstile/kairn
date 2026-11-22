import {
  createRootRouteWithContext,
  Link,
  Navigate,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AccountEntryFrame } from "../components/account-entry-frame";
import { AuthLayout } from "../components/auth/layout";
import { JourneyLoading, JourneyRetry } from "../components/journeys/states";
import { ButtonLink } from "../components/ui/button";
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
import type { FileRoutesById } from "../routeTree.gen";

// Generic task names keep private journey names out of tab titles and browser history.
const pageTitles = {
  __root__: "Workspace",
  "/$": "Page unavailable",
  "/": "Home",
  "/account": "Account",
  "/account_/reset": "Reset password",
  "/dashboard": "Dashboard",
  "/design-system": "Fold design system",
  "/discover": "Discover",
  "/journey-invitations": "Journey invitation",
  "/journeys": "Journeys",
  "/journeys_/new": "Create a journey",
  "/journeys_/$journeyId": "Journey details",
  "/journeys_/$journeyId_/invite": "Invite people",
  "/journeys_/$journeyId_/people": "Journey people",
  "/onboarding": "Account setup",
  "/onboarding_/companions": "Invite companions",
  "/saved": "Saved",
} satisfies Record<keyof FileRoutesById, string>;

export const Route = createRootRouteWithContext<{
  scope: AccountScope;
}>()({
  component: AppShell,
});

function AppShell() {
  const { scope } = Route.useRouteContext();
  const access = useSessionAccess();
  const pageTitle = useRouterState({
    select: ({ matches }) => pageTitles[matches.at(-1)?.routeId ?? "__root__"],
  });
  useEffect(() => {
    document.title = `${pageTitle} · ${publicEnvironment.appName}`;
  }, [pageTitle]);
  const pathname = useRouterState({
    select: ({ matches, location }) => {
      const match = matches.at(-1);
      if (match?.routeId === "/$") return "/unavailable";
      return (match?.pathname ?? location.pathname).replace(/\/+$/, "") || "/";
    },
  });
  if (pathname === "/design-system") return <Outlet />;
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
        pageTitle={pageTitle}
      >
        <WorkspaceEntry scope={scope} pathname={pathname} />
      </WorkspaceLayout>
    );
  }
  return (
    <AccountEntryFrame setup>
      <main
        id="main"
        tabIndex={-1}
        className="grid w-full min-w-0 flex-1 content-start wrap-anywhere py-8 sm:py-12 lg:content-center lg:py-14"
      >
        <WorkspaceEntry scope={scope} pathname={pathname} />
      </main>
    </AccountEntryFrame>
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
  const setupPending = progress.data?.state === "pending";
  const outlet = (
    <OnboardingAccess.Provider value={progress}>
      <Outlet />
    </OnboardingAccess.Provider>
  );

  useEffect(() => {
    const target = boundJourneyReturn(scope.accountId);
    const dashboardRedirectsToInvitationSetup =
      pathname === "/dashboard" &&
      target === "/journey-invitations" &&
      (!progress.data || progress.data.state === "pending");
    if (
      !dashboardRedirectsToInvitationSetup &&
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
      (target === pathname ||
        (pathname === "/dashboard" &&
          target &&
          !boundJourneyReturn(scope.accountId, { afterSetup: true })))
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
  if (progress.isError && !(onboarding && setupPending))
    return (
      <div className="grid max-w-2xl gap-4">
        <JourneyRetry
          title="Couldn’t check your setup"
          busy={progress.isFetching}
          retry={() => void progress.refetch()}
        />
        {!onboarding && (
          <ButtonLink
            render={<Link to="/account" />}
            variant="outline"
            className="justify-self-start"
          >
            Account
          </ButtonLink>
        )}
      </div>
    );
  if (!progress.data) return <JourneyLoading label="Checking your setup" />;
  if (setupPending && !onboarding)
    return <EnterOnboarding accountId={scope.accountId} pathname={pathname} />;
  if (pathname === "/") {
    const target = boundJourneyReturn(scope.accountId, { afterSetup: true });
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
    if (target && (target !== "/dashboard" || !boundJourneyReturn(accountId)))
      saveJourneyReturnTo(target, accountId);
    void navigate({ to: "/onboarding", replace: true });
  }, [accountId, navigate, pathname]);
  return <JourneyLoading label="Opening setup" />;
}
