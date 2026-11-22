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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../lib/journey-api";
import type { AccountScope } from "../../lib/session";
import { useSessionAccess } from "../../lib/session-access";
import { JourneyMap } from "../illustrations/journey-map";
import { Alert, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button, ButtonLink } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Skeleton } from "../ui/skeleton";
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
  const lastSectionHash = useRef("");
  useEffect(() => {
    if (!timeline) return;

    let frame = 0;
    function revealSection() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hash = window.location.hash;
        const heading = journeyTimelineSections.some(
          (section) => hash === `#journeys-${section}`,
        )
          ? document.getElementById(hash.slice(1))
          : null;
        lastSectionHash.current = hash;
        if (heading && heading !== document.activeElement) {
          heading.focus({ preventScroll: true });
          heading.scrollIntoView({ block: "start", behavior: "instant" });
        }
      });
    }

    if (lastSectionHash.current !== window.location.hash) revealSection();
    window.addEventListener("hashchange", revealSection);
    window.addEventListener("popstate", revealSection);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", revealSection);
      window.removeEventListener("popstate", revealSection);
    };
  }, [timeline]);

  const empty =
    timeline &&
    journeyTimelineSections.every(
      (section) => !timeline.timeline[section].items.length,
    );
  return (
    <div className="@container/journeys grid gap-section">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="text-4xl font-bold tracking-tight @min-[48rem]/journeys:text-5xl">
            Journeys
          </h1>
          <p className="text-muted-foreground">
            Plan what’s next and revisit where you’ve been.
          </p>
        </div>
        {!loading && !empty && (
          <CreateJourneyLink className="w-full @min-[28rem]/journeys:w-auto" />
        )}
      </header>
      {loading ? (
        <div className="grid gap-3">
          <JourneyLoading label="Loading your journeys" />
          <Skeleton aria-hidden="true" className="h-32 w-full" />
        </div>
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
    </div>
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
      <Empty className="grid gap-0 overflow-hidden p-0 @min-[39rem]/journeys:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid content-center justify-items-start gap-5 p-5 @min-[39rem]/journeys:p-8">
          <EmptyHeader className="gap-2">
            <EmptyTitle className="text-2xl font-bold text-pretty @min-[39rem]/journeys:text-3xl">
              No journeys yet
            </EmptyTitle>
            <EmptyDescription className="max-w-[40ch]">
              Plan somewhere you’re going or keep a private record of somewhere
              you’ve been.
            </EmptyDescription>
          </EmptyHeader>
          <CreateJourneyLink />
        </div>
        <div className="hidden @min-[39rem]/journeys:grid">
          <JourneyMap />
        </div>
      </Empty>
    );
  return (
    <div className="grid gap-3">
      {present.length > 1 && (
        <nav
          aria-label="Journey sections"
          className="flex flex-wrap gap-x-4 control-border-b pb-2"
        >
          {present.map((section) => (
            <a
              key={section}
              href={`#journeys-${section}`}
              className="inline-flex min-h-touch items-center rounded-control text-sm font-semibold text-muted-foreground underline decoration-border underline-offset-4 hover:text-primary hover:decoration-current"
            >
              {sections[section].title}
            </a>
          ))}
        </nav>
      )}
      {present.map((section) => (
        <HistorySection
          key={section}
          scope={scope}
          section={section}
          initial={timeline[section]}
          asOf={asOf}
        />
      ))}
    </div>
  );
}

function CreateJourneyLink({ className }: { className?: string }) {
  return (
    <ButtonLink
      size="lg"
      className={className}
      render={<Link to="/journeys/new" />}
    >
      Create journey
    </ButtonLink>
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
  const [page, setPage] = useState<
    Page & { focusAfterLoad?: { journeyId?: string } }
  >(initial);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const pending = page.focusAfterLoad;
    if (
      !pending ||
      (document.activeElement !== moreButton.current &&
        document.activeElement !== document.body)
    )
      return;
    const row = pending.journeyId
      ? list.current?.querySelector<HTMLAnchorElement>(
          `[data-timeline-journey="${CSS.escape(pending.journeyId)}"]`,
        )
      : null;
    (row ?? heading.current)?.focus();
  }, [page.focusAfterLoad]);
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
      const items = new Map(page.items.map((item) => [item.id, item]));
      const firstAdded = result.page.items.find((item) => !items.has(item.id));
      const moveFocus =
        document.activeElement === moreButton.current &&
        (firstAdded || !result.page.nextCursor);
      for (const item of result.page.items) items.set(item.id, item);
      setPage({
        items: [...items.values()],
        nextCursor: result.page.nextCursor,
        focusAfterLoad: moveFocus ? { journeyId: firstAdded?.id } : undefined,
      });
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
        "grid min-w-0 items-start gap-x-5 gap-y-2 px-2 py-3 @min-[45rem]/journeys:grid-cols-[minmax(10rem,1fr)_minmax(0,3.2fr)] @min-[45rem]/journeys:px-4",
        active ? "rounded-card control-border bg-accent" : "control-border-b",
      )}
      aria-labelledby={`journeys-${section}`}
    >
      <h2
        ref={heading}
        id={`journeys-${section}`}
        tabIndex={-1}
        className="flex min-w-0 items-start gap-2 rounded-control text-lg font-bold @min-[45rem]/journeys:px-2 @min-[45rem]/journeys:py-2"
      >
        <Icon
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-primary"
        />
        <span className="min-w-0">{title}</span>
      </h2>
      <div className="grid min-w-0 gap-3 @min-[45rem]/journeys:border-s @min-[45rem]/journeys:border-border @min-[45rem]/journeys:ps-5">
        <ul ref={list} className="divide-y divide-border">
          {page.items.map((journey) => (
            <li key={journey.id}>
              <Link
                to="/journeys/$journeyId"
                params={{ journeyId: journey.id }}
                data-timeline-journey={journey.id}
                onClick={() =>
                  scope.queryClient.setQueryData(
                    scrollKey(scope),
                    window.scrollY,
                  )
                }
                className={cn(
                  "group grid min-h-touch min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-control px-2 py-3 focus-visible:-outline-offset-2",
                  active ? "hover:bg-card/55" : "hover:bg-muted",
                )}
              >
                <span className="grid min-w-0 gap-1.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="text-lg font-semibold underline-offset-4 group-hover:underline">
                      {journey.title}
                    </span>
                    {journey.state === "archived" && <Badge>Archived</Badge>}
                  </span>
                  {journey.schedule ? (
                    <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
                      <span className="text-muted-foreground">Starts</span>
                      <JourneyDate minute={journey.schedule.intendedStart} />
                      {journey.schedule.intendedEnd ? (
                        <>
                          <span className="text-muted-foreground">Ends</span>
                          <JourneyDate minute={journey.schedule.intendedEnd} />
                        </>
                      ) : (
                        <span className="col-span-full text-muted-foreground">
                          No end date
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Dates unavailable
                    </span>
                  )}
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
          <Alert variant="destructive">
            <AlertTitle>Couldn’t load more journeys</AlertTitle>
          </Alert>
        )}
        {page.nextCursor && (
          <Button
            ref={moreButton}
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={loading}
            focusableWhenDisabled
            onClick={() => void loadMore()}
          >
            {loading ? "Loading…" : failed ? "Try again" : more}
          </Button>
        )}
      </div>
    </section>
  );
}
