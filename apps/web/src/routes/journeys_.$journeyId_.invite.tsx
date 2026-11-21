import type { PrivateJourney } from "@kairn/contracts";
import { journeyPath } from "@kairn/contracts/journeys";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { cn } from "cn";
import { Check } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import ferry from "../assets/konkan-ferry.webp";
import { InviteComposer } from "../components/journeys/invite-composer";
import { JourneyLoading, JourneyRetry } from "../components/journeys/states";
import { Alert, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { journeyInvitationsKey, useJourneyAccess } from "../lib/journey-access";
import type { AccountScope } from "../lib/session";

export const Route = createFileRoute("/journeys_/$journeyId_/invite")({
  component: InviteRoute,
});

function InviteRoute() {
  const { journeyId } = Route.useParams();
  const { scope } = Route.useRouteContext();
  const valid = journeyPath.safeParse({ journeyId }).success;
  const access = useJourneyAccess(scope, journeyId, valid);
  const [sending, setSending] = useState(false);
  const journey = access.isFetchedAfterMount ? access.data?.journey : undefined;
  if (!valid || (access.isFetchedAfterMount && access.data === null))
    return <Navigate to="/journeys" replace />;
  if (
    journey &&
    (journey.state !== "draft" ||
      !journey.capabilities.includes("administrator"))
  )
    return (
      <Navigate to="/journeys/$journeyId" params={{ journeyId }} replace />
    );
  const suspended = access.isError || access.revalidating;
  const accessNotice = (
    <div className="grid min-w-0 gap-3">
      {access.offline ? (
        <Alert>
          <AlertTitle>Reconnect to invite people</AlertTitle>
        </Alert>
      ) : access.isError ? (
        <JourneyRetry
          title="Couldn’t check journey access"
          busy={access.checking}
          retry={() => void access.refetch()}
        />
      ) : (
        <JourneyLoading label="Checking journey access" />
      )}
      {(access.offline || access.isError) && !sending && (
        <Button asChild variant="outline" className="justify-self-start">
          <Link to="/journeys/$journeyId" params={{ journeyId }} replace>
            Open journey
          </Link>
        </Button>
      )}
    </div>
  );
  return (
    <div className="@container/journey-invite mx-auto grid w-full min-w-0 max-w-5xl gap-5">
      {journey ? (
        <JourneyInvitations
          key={journey.id}
          scope={scope}
          journey={journey}
          suspended={suspended}
          accessNotice={accessNotice}
          onBusy={setSending}
        />
      ) : (
        accessNotice
      )}
    </div>
  );
}

function JourneyInvitations({
  scope,
  journey,
  suspended,
  accessNotice,
  onBusy,
}: {
  scope: AccountScope;
  journey: PrivateJourney;
  suspended: boolean;
  accessNotice: ReactNode;
  onBusy: (busy: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = Route.useNavigate();
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="grid min-w-0 gap-5">
      <header className="grid min-w-0 overflow-hidden rounded-card bg-primary text-primary-foreground @min-[34rem]/journey-invite:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-center justify-items-start gap-3 p-5 @min-[34rem]/journey-invite:p-7">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Check aria-hidden="true" className="size-4 shrink-0" />
            Journey saved
          </p>
          <div className="grid min-w-0 gap-1">
            <h1
              ref={heading}
              tabIndex={-1}
              className="wrap-anywhere text-4xl font-semibold"
            >
              Invite people
            </h1>
            <p
              className={cn("wrap-anywhere text-lg", suspended && "invisible")}
            >
              {journey.title}
            </p>
          </div>
        </div>
        <div className="relative hidden min-h-44 @min-[34rem]/journey-invite:block">
          <img
            src={ferry}
            alt=""
            width={1040}
            height={1300}
            className="absolute inset-0 size-full object-cover object-[50%_57%]"
          />
        </div>
      </header>
      <div className="grid min-w-0">
        <div
          className={cn(
            "col-start-1 row-start-1 min-w-0",
            suspended && "invisible",
          )}
          inert={suspended}
        >
          <InviteComposer
            journeyId={journey.id}
            title={journey.title}
            scope={scope}
            open
            afterCreation
            suspended={suspended}
            onBusy={onBusy}
            onClose={() =>
              void navigate({
                to: "/journeys/$journeyId",
                params: { journeyId: journey.id },
                replace: true,
              })
            }
            onSent={() =>
              void scope.queryClient.invalidateQueries({
                queryKey: journeyInvitationsKey(scope, journey.id),
              })
            }
          />
        </div>
        {suspended && (
          <div className="col-start-1 row-start-1 self-start">
            {accessNotice}
          </div>
        )}
      </div>
    </div>
  );
}
