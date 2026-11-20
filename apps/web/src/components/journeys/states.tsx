import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { journeyReturnTo } from "../../lib/journey-return";
import { useSessionAccess } from "../../lib/session-access";
import { PageHeading } from "../page-heading";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

export function JourneyLoading({ label }: { label: string }) {
  return (
    <output className="grid gap-3 rounded-card control-border bg-card p-4">
      <span className="text-muted-foreground">{label}</span>
      <Skeleton className="h-4 w-40 max-w-full" />
      <Skeleton className="h-4 w-64 max-w-full" />
    </output>
  );
}

export function JourneyRetry({
  title,
  retry,
  busy = false,
}: {
  title: string;
  retry: () => void;
  busy?: boolean;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertAction>
        <Button type="button" variant="outline" disabled={busy} onClick={retry}>
          {busy ? "Trying again…" : "Try again"}
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function JourneyGate({
  title,
  returnTo = "/journeys",
  children,
}: {
  title: string;
  returnTo?: ReturnType<typeof journeyReturnTo> | null;
  children: ReactNode;
}) {
  const access = useSessionAccess();
  if (access.state === "verified") return children;
  return (
    <section className="grid max-w-2xl gap-6">
      <PageHeading title={title} />
      {access.state === "checking" && (
        <JourneyLoading label="Checking your session" />
      )}
      {access.state === "unavailable" && (
        <JourneyRetry
          title="Couldn’t check your session"
          retry={() => access.refresh()}
        />
      )}
      {access.state === "signed-out" && (
        <Alert>
          <AlertTitle>Sign in to continue</AlertTitle>
          <AlertDescription>Your journeys are private.</AlertDescription>
          <AlertAction>
            <Button asChild>
              <Link to="/account" search={{ returnTo: returnTo ?? undefined }}>
                Sign in
              </Link>
            </Button>
          </AlertAction>
        </Alert>
      )}
    </section>
  );
}

export function JourneyBackLink() {
  return (
    <Button asChild variant="outline" className="justify-self-start">
      <Link to="/journeys">Back to Journeys</Link>
    </Button>
  );
}
