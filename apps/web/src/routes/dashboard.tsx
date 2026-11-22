import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  CreateJourneyLink,
  DashboardOverview,
} from "@/components/dashboard/overview";
import {
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "@/components/journeys/states";
import { Skeleton } from "@/components/ui/skeleton";
import { journeyResult } from "@/lib/journey-api";
import { useOnboarding } from "@/lib/onboarding";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const { scope } = Route.useRouteContext();
  return (
    <JourneyGate title="Dashboard" returnTo={null}>
      {scope.accountId && (
        <DashboardHome scope={scope} accountId={scope.accountId} />
      )}
    </JourneyGate>
  );
}

function DashboardHome({
  scope,
  accountId,
}: {
  scope: AccountScope;
  accountId: string;
}) {
  const { refresh } = useSessionAccess();
  const { data: setup } = useOnboarding();
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useQuery({
    queryKey: [accountId, "dashboard"],
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    async queryFn({ signal }) {
      const result = await scope.api.GET("/api/v1/dashboard", {
        params: { header: { "x-expected-account": accountId } },
        signal,
      });
      return journeyResult(result, scope, refresh);
    },
  });

  useEffect(() => {
    heading.current?.focus();
  }, []);

  // Keep private journey data out of the transition while access is checked.
  const current =
    summary.isFetching || summary.isError ? undefined : summary.data;
  const showCreate = Boolean(summary.data?.journeyCount) || summary.isError;

  return (
    <div className="@container/dashboard grid gap-section">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-4xl font-bold tracking-tight @min-[48rem]/dashboard:text-5xl"
          >
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Your upcoming plans and recent journeys.
          </p>
        </div>
        {showCreate && <CreateJourneyLink />}
      </header>
      {current ? (
        <DashboardOverview
          summary={current}
          intent={setup?.state === "completed" ? setup.intent : undefined}
        />
      ) : summary.isError ? (
        <JourneyRetry
          title="Couldn’t load your Dashboard"
          busy={summary.isFetching}
          retry={() => void summary.refetch()}
        />
      ) : (
        <div className="grid gap-3">
          <JourneyLoading label="Loading your Dashboard" />
          <Skeleton
            aria-hidden="true"
            className="h-36 w-full @min-[42rem]/dashboard:h-60"
          />
        </div>
      )}
    </div>
  );
}
