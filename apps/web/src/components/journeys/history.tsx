import type { PrivateJourney } from "@kairn/contracts";
import {
  type JourneyTimelineSection,
  journeyTimelineSections,
} from "@kairn/contracts/journeys";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Compass,
  History,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import beach from "../../assets/onboarding-beach.webp";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../lib/journey-api";
import type { AccountScope } from "../../lib/session";
import { useSessionAccess } from "../../lib/session-access";
import { PageHeading } from "../page-heading";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { JourneyDate } from "./dates";
import { JourneyLoading, JourneyRetry } from "./states";

type Page = { items: PrivateJourney[]; nextCursor: string | null };
const sections = {
  active: {
    title: "Active now",
    icon: Compass,
    more: "Load more active journeys",
  },
  upcoming: {
    title: "Upcoming",
    icon: CalendarDays,
    more: "Load more upcoming journeys",
  },
  past: {
    title: "Past journeys",
    icon: History,
    more: "Load more past journeys",
  },
  incomplete: {
    title: "Open-ended and undated",
    icon: CalendarClock,
    more: "Load more journeys with incomplete dates",
  },
};
const scrollKey = (scope: AccountScope) => [
  scope.accountId,
  "journey-history-scroll",
];

export function JourneyHistoryPage({ scope }: { scope: AccountScope }) {
  const { refresh } = useSessionAccess();
  const history = useQuery({
    queryKey: historyKey(scope),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    async queryFn({ signal }) {
      const result = journeyResult(
        await scope.api.GET("/api/v1/journeys", {
          params: { query: { view: "timeline" } },
          signal,
        }),
        scope,
        refresh,
      );
      if (!("timeline" in result))
        throw new Error("Expected the journey timeline.");
      return result;
    },
  });
  const loading = !history.isFetchedAfterMount || history.isPending;
  const timeline = !loading && !history.isError ? history.data : undefined;
  const empty =
    timeline &&
    journeyTimelineSections.every(
      (section) => !timeline.timeline[section].items.length,
    );
  return (
    <section className="@container/journeys mx-auto grid max-w-5xl gap-6 sm:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading title="Journeys" />
        {!loading && !empty && <CreateJourneyLink />}
      </div>
      {loading ? (
        <JourneyLoading label="Loading your journeys" />
      ) : history.isError ? (
        <JourneyRetry
          title="Couldn’t load your journeys"
          busy={history.isFetching}
          retry={() => void history.refetch()}
        />
      ) : timeline ? (
        <HistorySections
          scope={scope}
          key={timeline.asOf}
          timeline={timeline.timeline}
          asOf={timeline.asOf}
        />
      ) : null}
    </section>
  );
}

function HistorySections({
  scope,
  timeline,
  asOf,
}: {
  scope: AccountScope;
  timeline: Record<JourneyTimelineSection, Page>;
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

  const present = journeyTimelineSections.filter(
    (section) => timeline[section].items.length > 0,
  );
  if (!present.length)
    return (
      <Empty className="grid gap-0 overflow-hidden p-0 @min-[35rem]/journeys:grid-cols-[minmax(0,1fr)_44%]">
        <div className="grid content-center gap-5 p-5 @min-[35rem]/journeys:p-8 @min-[54rem]/journeys:p-10">
          <EmptyHeader>
            <EmptyTitle className="text-4xl">No journeys yet</EmptyTitle>
            <EmptyDescription className="max-w-[40ch]">
              Plan somewhere you’re going or keep a private record of somewhere
              you’ve been.
            </EmptyDescription>
          </EmptyHeader>
          <div className="justify-self-start">
            <CreateJourneyLink />
          </div>
        </div>
        <div className="relative min-h-36 bg-muted @min-[35rem]/journeys:min-h-68">
          <img
            src={beach}
            alt=""
            width={1152}
            height={864}
            className="absolute inset-0 size-full object-cover object-[50%_56%]"
          />
        </div>
      </Empty>
    );
  return present.map((section) => (
    <HistorySection
      key={section}
      scope={scope}
      section={section}
      initial={timeline[section]}
      asOf={asOf}
    />
  ));
}

function CreateJourneyLink() {
  return (
    <Button asChild>
      <Link to="/journeys/new">
        <Plus aria-hidden="true" data-icon="inline-start" />
        Create journey
      </Link>
    </Button>
  );
}

function HistorySection({
  scope,
  section,
  initial,
  asOf,
}: {
  scope: AccountScope;
  section: JourneyTimelineSection;
  initial: Page;
  asOf: string;
}) {
  const { refresh } = useSessionAccess();
  const [page, setPage] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const { title, icon: Icon, more } = sections[section];
  const active = section === "active";

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
      className={cn(
        "grid min-w-0 gap-3",
        active &&
          "rounded-card control-border bg-accent px-4 pt-4 pb-2 sm:px-6 sm:pt-5",
      )}
      aria-labelledby={`journeys-${section}`}
    >
      <h2
        id={`journeys-${section}`}
        className="flex min-w-0 items-start gap-2 text-xl font-semibold"
      >
        <Icon
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-primary"
        />
        <span className="min-w-0">{title}</span>
      </h2>
      <ul
        className={cn(
          "divide-y divide-border",
          active ? "divide-border/60" : "rounded-card control-border bg-card",
        )}
      >
        {page.items.map((journey) => (
          <li key={journey.id}>
            <Link
              to="/journeys/$journeyId"
              params={{ journeyId: journey.id }}
              onClick={() =>
                scope.queryClient.setQueryData(scrollKey(scope), window.scrollY)
              }
              className={cn(
                "group grid min-h-touch min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-control py-4 focus-visible:-outline-offset-2",
                active ? "px-1 hover:bg-card/55" : "px-4 hover:bg-muted",
              )}
            >
              <span className="grid min-w-0 gap-1">
                <span
                  className={cn(
                    "font-semibold group-hover:underline",
                    active && "text-xl",
                  )}
                >
                  {journey.title}
                </span>
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
                        <span>No end date</span>
                      )}
                    </>
                  ) : (
                    "Dates unavailable"
                  )}
                  {journey.state === "archived" && <span>Archived</span>}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
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
          {loading ? "Loading…" : more}
        </Button>
      )}
    </section>
  );
}
