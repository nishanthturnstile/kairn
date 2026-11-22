import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { journeyReturnTo } from "../../lib/journey-return";
import { useSessionAccess } from "../../lib/session-access";
import { PageHeading } from "../page-heading";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button, ButtonLink } from "../ui/button";

export { ContentLoading as JourneyLoading } from "../ui/loading";

import { ContentLoading } from "../ui/loading";

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
        <ContentLoading label="Checking your session" />
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
            <ButtonLink
              render={
                <Link
                  to="/account"
                  search={{ returnTo: returnTo ?? undefined }}
                />
              }
            >
              Sign in
            </ButtonLink>
          </AlertAction>
        </Alert>
      )}
    </section>
  );
}

export function JourneyBackLink() {
  return (
    <ButtonLink
      render={<Link to="/journeys" />}
      variant="ghost"
      size="sm"
      className="justify-self-start"
    >
      <ArrowLeft aria-hidden="true" data-icon="inline-start" />
      Back to Journeys
    </ButtonLink>
  );
}
