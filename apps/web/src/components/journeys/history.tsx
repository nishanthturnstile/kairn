import type { PrivateJourney } from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../lib/journey-api";
import type { AccountScope } from "../../lib/session";
import { useSessionAccess } from "../../lib/session-access";
import { PageHeading } from "../page-heading";
import { Button } from "../ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "../ui/empty";
import { JourneyDate } from "./dates";
import { JourneyLoading, JourneyRetry } from "./states";

type Page = { items: PrivateJourney[]; nextCursor: string | null };
const sectionTitles = { upcoming: "Upcoming", recent: "Recent journeys" };
const scrollKey = (scope: AccountScope) => [
  scope.accountId,
  "journey-history-scroll",
];

export function JourneyHistoryPage({ scope }: { scope: AccountScope }) {
  const { refresh } = useSessionAccess();
  const history = useQuery({
    queryKey: historyKey(scope),
    refetchOnMount: "always",
    async queryFn({ signal }) {
      const result = journeyResult(
        await scope.api.GET("/api/v1/journeys", { signal }),
        scope,
        refresh,
      );
      if (!("upcoming" in result))
        throw new Error("Expected initial journey history.");
      return result;
    },
  });
  return (
    <section className="grid max-w-2xl gap-6 sm:gap-8">
      <PageHeading title="Journeys" />
      <Button asChild className="justify-self-start">
        <Link to="/journeys/new">Create journey</Link>
      </Button>
      {!history.isFetchedAfterMount || history.isPending ? (
        <JourneyLoading label="Loading your journeys" />
      ) : history.isError ? (
        <JourneyRetry
          title="Couldn’t load your journeys"
          busy={history.isFetching}
          retry={() => void history.refetch()}
        />
      ) : (
        <HistorySections
          scope={scope}
          key={history.data.asOf}
          upcoming={history.data.upcoming}
          recent={history.data.recent}
          asOf={history.data.asOf}
        />
      )}
    </section>
  );
}

function HistorySections({
  scope,
  upcoming,
  recent,
  asOf,
}: {
  scope: AccountScope;
  upcoming: Page;
  recent: Page;
  asOf: string;
}) {
  useEffect(() => {
    const top = scope.queryClient.getQueryData<number>(scrollKey(scope));
    if (top === undefined) return;
    scope.queryClient.removeQueries({
      queryKey: scrollKey(scope),
      exact: true,
    });
    window.scrollTo(0, top);
  }, [scope]);

  if (!upcoming.items.length && !recent.items.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No journeys yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  return (
    <>
      <HistorySection
        scope={scope}
        section="upcoming"
        initial={upcoming}
        asOf={asOf}
      />
      <HistorySection
        scope={scope}
        section="recent"
        initial={recent}
        asOf={asOf}
      />
    </>
  );
}

function HistorySection({
  scope,
  section,
  initial,
  asOf,
}: {
  scope: AccountScope;
  section: keyof typeof sectionTitles;
  initial: Page;
  asOf: string;
}) {
  const { refresh } = useSessionAccess();
  const [page, setPage] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function loadMore() {
    if (!page.nextCursor || request.current || scope.signal.aborted) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const result = journeyResult(
        await scope.api.GET("/api/v1/journeys", {
          params: { query: { section, cursor: page.nextCursor } },
          signal: controller.signal,
        }),
        scope,
        refresh,
      );
      controller.signal.throwIfAborted();
      if (
        !("page" in result) ||
        result.asOf !== asOf ||
        result.section !== section
      )
        throw new Error("Expected a continuation of this journey history.");
      setPage((previous) => ({
        items: [
          ...new Map(
            [...previous.items, ...result.page.items].map((item) => [
              item.id,
              item,
            ]),
          ).values(),
        ],
        nextCursor: result.page.nextCursor,
      }));
    } catch (error) {
      if (controller.signal.aborted || scope.signal.aborted) return;
      if (error instanceof JourneyRequestError && error.status === 400) {
        void scope.queryClient.invalidateQueries({
          queryKey: historyKey(scope),
        });
      } else {
        setFailed(true);
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted && !scope.signal.aborted)
        setLoading(false);
    }
  }

  return (
    <section
      className="grid min-w-0 gap-3"
      aria-labelledby={`journeys-${section}`}
    >
      <h2 id={`journeys-${section}`} className="text-xl font-semibold">
        {sectionTitles[section]}
      </h2>
      {page.items.length ? (
        <ul className="divide-y rounded-card control-border bg-card">
          {page.items.map((journey) => (
            <li key={journey.id}>
              <Link
                to="/journeys/$journeyId"
                params={{ journeyId: journey.id }}
                onClick={() =>
                  scope.queryClient.setQueryData(
                    scrollKey(scope),
                    window.scrollY,
                  )
                }
                className="grid min-h-touch min-w-0 content-center gap-1 rounded-control px-4 py-3 hover:bg-muted"
              >
                <span className="font-semibold">{journey.title}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {journey.schedule ? (
                    <>
                      <JourneyDate minute={journey.schedule.intendedStart} />
                      {journey.schedule.intendedEnd ? (
                        <span>
                          to{" "}
                          <JourneyDate minute={journey.schedule.intendedEnd} />
                        </span>
                      ) : (
                        <span>End date unknown</span>
                      )}
                    </>
                  ) : (
                    "Dates unavailable"
                  )}
                  {journey.state === "archived" && <span>Archived</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          {section === "upcoming"
            ? "No upcoming journeys"
            : "No recent journeys"}
        </Empty>
      )}
      {failed && (
        <JourneyRetry
          title="Couldn’t load more journeys"
          retry={() => void loadMore()}
        />
      )}
      {page.nextCursor && !failed && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading
            ? "Loading…"
            : section === "upcoming"
              ? "Load more upcoming journeys"
              : "Load more recent journeys"}
        </Button>
      )}
    </section>
  );
}
