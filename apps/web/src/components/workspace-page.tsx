import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

interface WorkspacePageProps {
  title: string;
  description: string;
  accountRequired?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}

export function WorkspacePage({
  title,
  description,
  accountRequired = false,
  emptyTitle,
  emptyDescription,
}: WorkspacePageProps) {
  return (
    <section className="grid gap-8">
      <header className="grid gap-2 border-b pb-6">
        <h1 className="font-heading text-title font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground">{description}</p>
      </header>
      {accountRequired ? (
        <Alert className="p-5" role="status">
          <AlertTitle>Account access is unavailable</AlertTitle>
          <AlertDescription>
            This space opens when you can sign in.
          </AlertDescription>
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
        className="grid gap-3 rounded-lg border bg-card p-6"
        aria-busy="true"
      >
        <span className="text-sm text-muted-foreground">
          Checking availability
        </span>
        <Skeleton className="h-4 w-40 max-w-full motion-reduce:animate-none" />
        <Skeleton className="h-4 w-64 max-w-full motion-reduce:animate-none" />
      </output>
    );

  if (readiness.isError)
    return (
      <Alert variant="destructive" className="gap-2 p-5">
        <AlertTitle>Couldn’t connect to Kairn</AlertTitle>
        <AlertDescription>
          Check your connection, then try again.
        </AlertDescription>
        <Button
          className="min-h-11 w-fit"
          variant="outline"
          onClick={() => void readiness.refetch()}
          disabled={readiness.isFetching}
        >
          Try again
        </Button>
      </Alert>
    );

  return (
    <Empty className="items-start rounded-lg border border-solid bg-card p-6 text-left">
      <EmptyHeader className="items-start">
        <EmptyTitle className="text-lg">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
