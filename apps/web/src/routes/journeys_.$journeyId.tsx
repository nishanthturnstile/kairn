import { journeyPath } from "@kairn/contracts/journeys";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useLayoutEffect, useRef } from "react";
import {
  JourneyMetadata,
  JourneyOverview,
} from "../components/journeys/detail";
import {
  JourneyBackLink,
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { Alert, AlertTitle } from "../components/ui/alert";
import { ButtonLink } from "../components/ui/button";
import { useJourneyAccess } from "../lib/journey-access";
import type { AccountScope } from "../lib/session";

const pageLayout =
  "@container/journey-detail grid w-full min-w-0 gap-4 [--fold-control:2.75rem]";

export const Route = createFileRoute("/journeys_/$journeyId")({
  component: JourneyDetailRoute,
});

function JourneyDetailRoute() {
  const { journeyId } = Route.useParams();
  const { scope } = Route.useRouteContext();
  if (!journeyPath.safeParse({ journeyId }).success)
    return <UnavailableJourney />;
  return (
    <JourneyGate title="Journey" returnTo={`/journeys/${journeyId}`}>
      <JourneyDetail key={journeyId} journeyId={journeyId} scope={scope} />
    </JourneyGate>
  );
}

function UnavailableJourney() {
  return (
    <section className={pageLayout}>
      <JourneyBackLink />
      <PageHeading title="Journey" />
      <UnavailableNotice />
    </section>
  );
}

function UnavailableNotice() {
  return (
    <div className="grid max-w-2xl justify-items-start gap-3">
      <Alert>
        <AlertTitle>This journey is unavailable</AlertTitle>
      </Alert>
      <ButtonLink render={<Link to="/dashboard" />} variant="ghost">
        Go to Dashboard
      </ButtonLink>
    </div>
  );
}

function JourneyDetail({
  scope,
  journeyId,
}: {
  scope: AccountScope;
  journeyId: string;
}) {
  const detail = useJourneyAccess(scope, journeyId);
  const heading = useRef<HTMLHeadingElement>(null);
  const peopleLink = useRef<HTMLAnchorElement>(null);
  const presented = useRef(false);
  const returnToPeople = useRef(false);
  const rememberPeopleFocus = useCallback((link: HTMLAnchorElement | null) => {
    if (!link && peopleLink.current === document.activeElement)
      returnToPeople.current = true;
    peopleLink.current = link;
  }, []);
  const unavailable =
    !detail.checking &&
    !detail.isError &&
    detail.isFetchedAfterMount &&
    detail.data === null;
  const snapshot =
    detail.isFetchedAfterMount && !detail.isError && !detail.checking
      ? detail.data
      : undefined;
  const ready = Boolean(snapshot);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!ready) {
      if (returnToPeople.current && active === document.body)
        heading.current?.focus();
      if (unavailable) returnToPeople.current = false;
      return;
    }
    if (
      returnToPeople.current &&
      (active === document.body || active === heading.current)
    )
      peopleLink.current?.focus();
    else if (!presented.current && active === document.body)
      heading.current?.focus();
    returnToPeople.current = false;
    presented.current = true;
  }, [ready, unavailable]);

  return (
    <section className={pageLayout}>
      <JourneyBackLink />
      <div className="grid min-w-0 gap-section">
        <header className="grid gap-3">
          <h1
            ref={heading}
            tabIndex={-1}
            className="w-fit min-w-0 max-w-[28ch] text-4xl font-bold tracking-tight wrap-anywhere outline-none @min-[48rem]/journey-detail:text-5xl"
          >
            {snapshot?.journey.title ?? "Journey"}
          </h1>
          {snapshot && <JourneyMetadata {...snapshot} />}
        </header>
        {snapshot ? (
          <JourneyOverview
            journey={snapshot.journey}
            peopleRef={rememberPeopleFocus}
          />
        ) : unavailable ? (
          <UnavailableNotice />
        ) : (
          <div className="grid min-w-0 max-w-2xl gap-4">
            {detail.offline ? (
              <Alert>
                <AlertTitle>Reconnect to check journey access</AlertTitle>
              </Alert>
            ) : detail.isError ? (
              <JourneyRetry
                title="Couldn’t load this journey"
                busy={detail.checking}
                retry={() => void detail.refetch()}
              />
            ) : (
              <JourneyLoading
                label={
                  detail.isFetchedAfterMount
                    ? "Checking journey access"
                    : "Loading journey"
                }
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
