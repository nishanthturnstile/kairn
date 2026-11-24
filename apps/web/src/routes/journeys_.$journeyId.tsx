import { journeyPath } from "@kairn/contracts/journeys";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { JourneyInvitationStatus } from "../components/journeys/batch-invitations";
import { DeleteJourney } from "../components/journeys/delete-journey";
import {
  JourneyMetadata,
  JourneyOverview,
} from "../components/journeys/detail";
import {
  JourneyDepartureRecovery,
  JourneyPeopleDialog,
} from "../components/journeys/people-dialog";
import {
  JourneyBackLink,
  JourneyGate,
  JourneyLoading,
  JourneyRetry,
} from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { JourneyRecordings } from "../components/recordings/journey-recordings";
import { JourneyRouteMap } from "../components/recordings/journey-route-map";
import { Alert, AlertTitle } from "../components/ui/alert";
import { ButtonLink } from "../components/ui/button";
import { useJourneyAccess } from "../lib/journey-access";
import { gpxJourneyCreation } from "../lib/journey-creation";
import { readDeparture } from "../lib/journey-departure";
import type { AccountScope } from "../lib/session";

const pageLayout =
  "@container/journey-detail grid w-full min-w-0 gap-4 [--fold-control:2.75rem]";

export const Route = createFileRoute("/journeys_/$journeyId")({
  validateSearch: (search): { addRecording?: true } =>
    search.addRecording === true || search.addRecording === "true"
      ? { addRecording: true }
      : {},
  component: JourneyDetailRoute,
});

function JourneyDetailRoute() {
  const { journeyId } = Route.useParams();
  const { scope } = Route.useRouteContext();
  const { addRecording } = Route.useSearch();
  if (!journeyPath.safeParse({ journeyId }).success)
    return <UnavailableJourney />;
  return (
    <JourneyGate title="Journey" returnTo={`/journeys/${journeyId}`}>
      <JourneyDetail
        key={journeyId}
        journeyId={journeyId}
        scope={scope}
        addRecording={addRecording}
      />
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
  addRecording,
}: {
  scope: AccountScope;
  journeyId: string;
  addRecording?: true;
}) {
  const detail = useJourneyAccess(scope, journeyId);
  const navigate = Route.useNavigate();
  const openedFromImport = useRef(Boolean(addRecording));
  const consumeImportHandoff = useCallback(() => {
    void navigate({ search: {}, replace: true, resetScroll: false });
  }, [navigate]);
  const heading = useRef<HTMLHeadingElement>(null);
  const presented = useRef(false);
  const peopleButton = useRef<HTMLButtonElement>(null);
  const restorePeopleFocus = useRef(false);
  const unavailable =
    !detail.checking &&
    !detail.isError &&
    detail.isFetchedAfterMount &&
    detail.data === null;
  const snapshot =
    detail.isFetchedAfterMount && !detail.isError && !detail.revalidating
      ? detail.data
      : undefined;
  const checked = detail.isFetchedAfterMount ? detail.data : undefined;
  const departure = unavailable ? readDeparture(scope, journeyId) : undefined;
  const checking = detail.offline ? (
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
  );
  const people = checked && (
    <JourneyPeopleDialog
      journey={checked.journey}
      scope={scope}
      suspension={snapshot ? undefined : checking}
      wideTrigger={!gpxJourneyCreation}
      triggerRef={peopleButton}
    />
  );
  const ready = Boolean(snapshot);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!ready) {
      if (peopleButton.current && active === peopleButton.current) {
        restorePeopleFocus.current = true;
        heading.current?.focus();
      }
      if (unavailable) restorePeopleFocus.current = false;
      return;
    }
    if (
      restorePeopleFocus.current &&
      (active === document.body || active === heading.current)
    )
      peopleButton.current?.focus();
    else if (!presented.current && active === document.body)
      heading.current?.focus();
    restorePeopleFocus.current = false;
    presented.current = true;
  }, [ready, unavailable]);

  return (
    <section className={pageLayout}>
      <JourneyBackLink />
      <div className="grid min-w-0 gap-section">
        <header className="grid gap-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <h1
              ref={heading}
              tabIndex={-1}
              className={
                gpxJourneyCreation
                  ? "min-w-0 flex-1 basis-64 text-xl font-bold tracking-tight wrap-anywhere outline-none sm:text-3xl"
                  : "w-fit min-w-0 max-w-[28ch] text-4xl font-bold tracking-tight wrap-anywhere outline-none @min-[48rem]/journey-detail:text-5xl"
              }
            >
              {snapshot?.journey.title ?? "Journey"}
            </h1>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {gpxJourneyCreation && <div hidden={!snapshot}>{people}</div>}
              {snapshot?.journey.capabilities.includes("administrator") &&
                snapshot.journey.capabilities.includes("publisher") && (
                  <DeleteJourney journey={snapshot.journey} scope={scope} />
                )}
            </div>
          </div>
          {snapshot && (
            <JourneyMetadata {...snapshot} showSchedule={gpxJourneyCreation} />
          )}
        </header>
        {!gpxJourneyCreation && checked && (
          <div hidden={!snapshot}>
            <JourneyOverview journey={checked.journey} peopleAction={people} />
          </div>
        )}
        {snapshot && (
          <>
            {gpxJourneyCreation &&
              snapshot.journey.state === "draft" &&
              snapshot.journey.capabilities.includes("administrator") && (
                <JourneyInvitationStatus scope={scope} journeyId={journeyId} />
              )}
            <JourneyRouteMap
              scope={scope}
              journeyId={journeyId}
              onlyWithRecordings={!gpxJourneyCreation}
            />
          </>
        )}
        {checked && (
          <div hidden={!snapshot}>
            {gpxJourneyCreation ? (
              <details
                className="group min-w-0 rounded-control border bg-card"
                open={
                  openedFromImport.current ||
                  Boolean(
                    scope.queryClient.getQueryData([
                      scope.accountId,
                      "recording-receipt",
                      journeyId,
                    ]),
                  ) ||
                  undefined
                }
              >
                <summary className="flex min-h-control cursor-pointer list-none items-center gap-1.5 rounded-control px-3 text-sm font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 group-open:rotate-180"
                  />
                  Recordings
                </summary>
                <JourneyRecordings
                  scope={scope}
                  journeyId={journeyId}
                  archived={checked.journey.state === "archived"}
                  addInitiallyOpen={addRecording}
                  onInitialAddOpen={consumeImportHandoff}
                  suspension={snapshot ? undefined : checking}
                  embedded
                />
              </details>
            ) : (
              <JourneyRecordings
                scope={scope}
                journeyId={journeyId}
                archived={checked.journey.state === "archived"}
                addInitiallyOpen={addRecording}
                onInitialAddOpen={consumeImportHandoff}
                suspension={snapshot ? undefined : checking}
              />
            )}
          </div>
        )}
        {!snapshot &&
          (unavailable ? (
            departure ? (
              <JourneyDepartureRecovery scope={scope} pending={departure} />
            ) : (
              <UnavailableNotice />
            )
          ) : (
            <div className="grid min-w-0 max-w-2xl gap-4">{checking}</div>
          ))}
      </div>
    </section>
  );
}
