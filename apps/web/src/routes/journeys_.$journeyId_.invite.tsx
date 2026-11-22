import type { PrivateJourney } from "@kairn/contracts";
import { journeyPath } from "@kairn/contracts/journeys";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { cn } from "cn";
import { Check } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { JourneyFlow } from "../components/journeys/flow";
import { InviteComposer } from "../components/journeys/invite-composer";
import { JourneyLoading, JourneyRetry } from "../components/journeys/states";
import { Alert, AlertTitle } from "../components/ui/alert";
import { ButtonLink } from "../components/ui/button";
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
        <ButtonLink
          render={
            <Link to="/journeys/$journeyId" params={{ journeyId }} replace />
          }
          variant="outline"
          className="justify-self-start"
        >
          Open journey
        </ButtonLink>
      )}
    </div>
  );
  return (
    <JourneyFlow
      title="Invite people"
      description="Choose who can join your journey."
    >
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
    </JourneyFlow>
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
  const navigate = Route.useNavigate();
  const composer = useRef<HTMLDivElement>(null);
  const notice = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const control = previousFocus.current;
    if (!control?.isConnected) return;
    const active = document.activeElement;
    if (suspended) {
      if (active === document.body || composer.current?.contains(active)) {
        notice.current?.focus({ preventScroll: true });
      }
    } else if (active === document.body) {
      control.focus({ preventScroll: true });
    }
  }, [suspended]);

  return (
    <>
      <Alert variant="success" className="flex min-w-0 items-center gap-2">
        <Check aria-hidden="true" className="size-4 shrink-0" />
        <AlertTitle>Journey saved</AlertTitle>
      </Alert>
      <div className="grid min-w-0">
        <div
          ref={composer}
          className={cn(
            "col-start-1 row-start-1 min-w-0",
            suspended && "invisible",
          )}
          inert={suspended}
          onFocusCapture={(event) => {
            if (event.target instanceof HTMLElement)
              previousFocus.current = event.target;
          }}
          onBlurCapture={({ relatedTarget }) => {
            if (
              relatedTarget instanceof Node &&
              !composer.current?.contains(relatedTarget) &&
              !notice.current?.contains(relatedTarget)
            ) {
              previousFocus.current = null;
            }
          }}
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
          <section
            ref={notice}
            tabIndex={-1}
            aria-label="Journey access"
            className="journey-flow-access-notice col-start-1 row-start-1 self-start"
          >
            {accessNotice}
          </section>
        )}
      </div>
    </>
  );
}
