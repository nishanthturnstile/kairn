import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { journeyReturnTo } from "../lib/journey-return";
import { PageHeading } from "./page-heading";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

interface WorkspacePageProps {
  title: string;
  description: string;
  accountRequired?: boolean;
  returnTo?: ReturnType<typeof journeyReturnTo>;
  emptyTitle: string;
  emptyDescription: string;
}

export function WorkspacePage({
  title,
  description,
  accountRequired = false,
  returnTo,
  emptyTitle,
  emptyDescription,
}: WorkspacePageProps) {
  return (
    <section className="grid max-w-2xl gap-6 sm:gap-8">
      <PageHeading title={title} description={description} />
      {accountRequired ? (
        <Alert role="status">
          <AlertTitle>Sign in to continue</AlertTitle>
          <AlertAction>
            <Button asChild variant="outline">
              <Link to="/account" search={{ returnTo }}>
                Open your account
              </Link>
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <CollectionsState title={emptyTitle} description={emptyDescription} />
      )}
    </section>
  );
}

function CollectionsState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { scope } = useRouteContext({ from: "__root__" });
  const readiness = useQuery({
    queryKey: [scope.accountId, "readiness"],
    async queryFn({ signal }) {
      const { data } = await scope.api.GET("/api/v1/ready", { signal });
      if (data?.status !== "ready") throw new Error("Service unavailable");
      return data;
    },
  });

  if (readiness.isPending)
    return (
      <output
        className="grid gap-3 rounded-card control-border bg-card p-4"
        aria-busy="true"
      >
        <span className="text-muted-foreground">Checking availability</span>
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </output>
    );

  if (readiness.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn’t connect to Kairn</AlertTitle>
        <AlertDescription>
          Check your connection, then try again.
        </AlertDescription>
        <AlertAction>
          <Button
            variant="outline"
            onClick={() => void readiness.refetch()}
            disabled={readiness.isFetching}
          >
            {readiness.isFetching ? "Trying again…" : "Try again"}
          </Button>
        </AlertAction>
      </Alert>
    );

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
