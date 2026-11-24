import type { PrivateJourney } from "@kairn/contracts";
import {
  type JourneyTimelineSection,
  journeyTimelineSections,
} from "@kairn/contracts/journeys";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import {
  type ComponentRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  SectionList,
  type Text,
  useWindowDimensions,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../journey-api";
import { gpxJourneyCreation } from "../../journey-creation";
import { departureKey } from "../../membership-attempt";
import { useMobileSession } from "../../mobile-session";
import {
  mobileRecordingDraftKey,
  useRecordingImports,
} from "../../recording-api";
import type { VerifiedMobileScope } from "../../session";
import { readRecordingDraft } from "../../storage/recording-import";
import { DestinationTopBar } from "../destination";
import { ContentLoading, JourneyMap } from "../fold/expression";
import { Action, AppText, StatusNotice } from "../fold/primitives";
import { FoldSafeAreaView } from "../fold/screen";
import { CreateJourneyLink } from "./create-link";
import { JourneyRow } from "./journey-row";
import { JourneyRetry, journeyStyles, useJourneyReentry } from "./states";

const sectionInfo = {
  active: {
    title: "Active now",
    more: "Load more active journeys",
  },
  upcoming: {
    title: "Upcoming",
    more: "Load more upcoming journeys",
  },
  past: {
    title: "Past journeys",
    more: "Load more past journeys",
  },
  incomplete: {
    title: "Open-ended and undated",
    more: "Load more journeys with incomplete dates",
  },
} satisfies Record<JourneyTimelineSection, { title: string; more: string }>;

type Section = JourneyTimelineSection;
type Page = { items: PrivateJourney[]; nextCursor: string | null };
type Continuations = { asOf: string; pages: Partial<Record<Section, Page>> };

type HistorySection = (typeof sectionInfo)[Section] & {
  data: PrivateJourney[];
  id: Section;
  nextCursor: string | null;
};

function rowDates(journey: PrivateJourney) {
  if (!journey.schedule) return ["Dates unavailable"];
  const { intendedStart, intendedEnd } = journey.schedule;
  const start = formatJourneyLocalMinute(intendedStart.local);
  const end = intendedEnd && formatJourneyLocalMinute(intendedEnd.local);
  return [
    `Starts ${start.date} · ${start.time}`,
    end ? `Ends ${end.date} · ${end.time}` : "No end date",
  ];
}

export function JourneyHistory({ scope }: { scope: VerifiedMobileScope }) {
  const router = useRouter();
  const imports = useRecordingImports(scope, !gpxJourneyCreation);
  const localRecording = useQuery({
    queryKey: mobileRecordingDraftKey,
    refetchOnMount: "always",
    enabled: !gpxJourneyCreation && Boolean(imports.data),
    queryFn: async () => readRecordingDraft(scope),
  });
  const resumable = Boolean(
    imports.data?.imports.length || imports.data?.nextCursor,
  );
  const canResumeLocal = Boolean(
    localRecording.data?.fileId || localRecording.data?.importId,
  );
  function historyActions() {
    if (gpxJourneyCreation) return <CreateJourneyLink />;
    return (
      <View style={journeyStyles.group}>
        {imports.data && (
          <Action
            label="Import GPX"
            variant="primary"
            onPress={() =>
              router.push({
                pathname: "/journeys/import",
                params: { fresh: "1" },
              })
            }
          />
        )}
        <Action
          label={imports.data ? "Create journey manually" : "Create journey"}
          variant={imports.data ? "secondary" : "primary"}
          onPress={create}
        />
        {imports.data && (canResumeLocal || resumable) && (
          <Action
            label="Resume import"
            variant="text"
            onPress={() =>
              router.push({
                pathname: "/journeys/import",
                params: { resume: "1" },
              })
            }
          />
        )}
      </View>
    );
  }

  const { width, fontScale } = useWindowDimensions();
  const stackHeader = width < 365 || fontScale > 1.35;
  const { refresh, recheck } = useMobileSession();
  const [continuations, setContinuations] = useState<Continuations>();
  const [failed, setFailed] = useState<Section>();
  const [loading, setLoading] = useState<Section>();
  const inFlight = useRef(false);
  const list = useRef<SectionList<PrivateJourney, HistorySection>>(null);
  const displayedSections = useRef<HistorySection[]>([]);
  const headings = useRef<Partial<Record<Section, ComponentRef<typeof Text>>>>(
    {},
  );
  const jump = useRef<{
    id: Section;
    attempts: number;
  } | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancelJump = useCallback(() => {
    clearTimeout(jumpTimer.current);
    jump.current = null;
  }, []);
  useFocusEffect(useCallback(() => cancelJump, [cancelJump]));

  function seekSection() {
    const target = jump.current;
    if (!target) return;
    const sectionIndex = displayedSections.current.findIndex(
      (section) => section.id === target.id,
    );
    // A refresh can reorder or remove groups between scroll attempts.
    if (sectionIndex < 0) {
      cancelJump();
      return;
    }
    // Focus waits for the virtualized heading to mount at the scroll destination.
    jumpTimer.current = setTimeout(() => {
      const heading = headings.current[target.id];
      if (heading) AccessibilityInfo.sendAccessibilityEvent(heading, "focus");
      cancelJump();
    }, 160);
    list.current?.scrollToLocation({
      sectionIndex,
      itemIndex: 0,
      animated: false,
    });
  }

  function jumpToSection(id: Section) {
    cancelJump();
    jump.current = { id, attempts: 0 };
    seekSection();
  }

  const departure = useQuery({
    queryKey: departureKey,
    queryFn: () => null as "confirmed" | "pending" | null,
    enabled: false,
  });
  useJourneyReentry(scope, historyKey);
  const history = useQuery({
    queryKey: historyKey,
    refetchOnMount: "always",
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
  const current =
    history.isFetchedAfterMount && !history.isError ? history.data : undefined;
  const pages =
    current && continuations?.asOf === current.asOf ? continuations.pages : {};
  const sections = current
    ? journeyTimelineSections.flatMap((id) => {
        const page = pages[id] ?? current.timeline[id];
        if (!page.items.length) return [];
        return [
          {
            id,
            key: id,
            ...sectionInfo[id],
            data: page.items,
            nextCursor: page.nextCursor,
          },
        ];
      })
    : [];
  useLayoutEffect(() => {
    displayedSections.current = sections;
    const target = jump.current;
    if (target && !sections.some((section) => section.id === target.id))
      cancelJump();
  }, [cancelJump, sections]);

  async function loadMore(section: Section, cursor: string) {
    if (!current || inFlight.current || scope.signal.aborted) return;
    inFlight.current = true;
    setLoading(section);
    setFailed(undefined);
    const initial = pages[section] ?? current.timeline[section];
    try {
      const result = await scope.queryClient.fetchQuery({
        queryKey: ["journeys", "page", section, cursor],
        async queryFn({ signal }) {
          return journeyResult(
            await scope.api.GET("/api/v1/journeys", {
              params: { query: { section, cursor } },
              signal,
            }),
            scope,
            refresh,
          );
        },
      });
      if (scope.signal.aborted) return;
      if (
        !("page" in result) ||
        result.section !== section ||
        result.asOf !== current.asOf
      )
        throw new Error("Expected a continuation of this history.");
      const items = [
        ...new Map(
          [...initial.items, ...result.page.items].map((item) => [
            item.id,
            item,
          ]),
        ).values(),
      ];
      setContinuations((previous) => ({
        asOf: result.asOf,
        pages: {
          ...(previous?.asOf === result.asOf ? previous.pages : {}),
          [section]: { items, nextCursor: result.page.nextCursor },
        },
      }));
    } catch (error) {
      if (scope.signal.aborted) return;
      if (error instanceof JourneyRequestError && error.status === 400) {
        void history.refetch();
      } else setFailed(section);
    } finally {
      inFlight.current = false;
      if (!scope.signal.aborted) setLoading(undefined);
    }
  }

  const create = () => router.push("/journeys/new");
  return (
    <FoldSafeAreaView
      edges={["top", "left", "right"]}
      style={journeyStyles.screen}
    >
      <SectionList
        ref={list}
        sections={sections}
        onScrollBeginDrag={cancelJump}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          const target = jump.current;
          if (!target) return;
          cancelJump();
          if (target.attempts >= 5) return;
          jump.current = { ...target, attempts: target.attempts + 1 };
          list.current?.getScrollResponder()?.scrollTo({
            y: averageItemLength * index,
            animated: false,
          });
          jumpTimer.current = setTimeout(seekSection, 100);
        }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[journeyStyles.content, styles.list]}
        stickySectionHeadersEnabled={false}
        refreshing={history.isRefetching}
        onRefresh={() =>
          void recheck().then(() => {
            if (!scope.signal.aborted) void history.refetch();
          })
        }
        ListHeaderComponent={
          <View style={journeyStyles.contentHeader}>
            <DestinationTopBar />
            <View
              style={[styles.heading, stackHeader && styles.stackedHeading]}
            >
              <AppText
                text="Journeys"
                variant="title"
                accessibilityRole="header"
              />
              {(sections.length > 0 || history.isError) && historyActions()}
            </View>
            {departure.data && (
              <View style={journeyStyles.group}>
                <StatusNotice
                  notice={{
                    text:
                      departure.data === "pending"
                        ? "You’ve left the journey. Confirmation is pending."
                        : "You’ve left the journey.",
                    tone: departure.data === "pending" ? "warning" : "success",
                  }}
                />
                <Action
                  label="Dismiss"
                  variant="text"
                  onPress={() =>
                    scope.queryClient.setQueryData(departureKey, null)
                  }
                />
              </View>
            )}
            {history.isError ? (
              <JourneyRetry
                text="Couldn’t load your journeys."
                busy={history.isFetching}
                retry={() => void history.refetch()}
              />
            ) : !current ? (
              <ContentLoading label="Loading your journeys" />
            ) : (
              sections.length === 0 && (
                <View style={styles.empty}>
                  <View style={styles.emptyCopy}>
                    <JourneyMap />
                    <AppText
                      text="No journeys yet"
                      variant="section"
                      accessibilityRole="header"
                    />
                    <AppText
                      text="Plan somewhere you’re going or keep a private record of somewhere you’ve been."
                      subdued
                    />
                    {historyActions()}
                  </View>
                </View>
              )
            )}
            {sections.length > 1 && (
              <View style={journeyStyles.group}>
                <AppText text="Jump to a section" variant="label" />
                <View style={styles.shortcuts}>
                  {sections.map((section) => (
                    <Action
                      key={section.id}
                      label={section.title}
                      size="compact"
                      onPress={() => jumpToSection(section.id)}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeading}>
            <AppText
              ref={(heading) => {
                if (heading) headings.current[section.id] = heading;
                else delete headings.current[section.id];
              }}
              text={section.title}
              variant="section"
              accessibilityRole="header"
            />
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const dates = rowDates(item);
          const archived = item.state === "archived";
          return (
            <JourneyRow
              title={item.title}
              detail={[...dates, ...(archived ? ["Archived"] : [])].join(", ")}
              featured={section.id === "active"}
              first={index === 0}
              last={index === section.data.length - 1}
              onPress={() =>
                router.push({
                  pathname: "/journeys/[journeyId]",
                  params: { journeyId: item.id },
                })
              }
            >
              {dates.map((date) => (
                <AppText key={date} text={date} variant="caption" subdued />
              ))}
              {archived && (
                <AppText text="Archived" variant="caption" subdued />
              )}
            </JourneyRow>
          );
        }}
        renderSectionFooter={({ section }) =>
          section.nextCursor ? (
            <View style={styles.footer}>
              {failed === section.id && (
                <StatusNotice
                  notice={{
                    text: "Couldn’t load more journeys.",
                    tone: "error",
                  }}
                />
              )}
              <Action
                label={
                  loading === section.id
                    ? "Loading…"
                    : failed === section.id
                      ? "Try again"
                      : section.more
                }
                disabled={loading !== undefined}
                onPress={() => {
                  if (section.nextCursor)
                    void loadMore(section.id, section.nextCursor);
                }}
              />
            </View>
          ) : null
        }
      />
    </FoldSafeAreaView>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { color, border, radius, space } }) => ({
    list: { gap: 0 },
    heading: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.step12,
    },
    stackedHeading: { flexDirection: "column", alignItems: "stretch" },
    empty: {
      overflow: "hidden",
      borderRadius: radius.card,
      borderColor: color.boundary,
      borderWidth: border.control,
      backgroundColor: color.surface,
    },
    emptyCopy: { gap: space.step12, padding: space.step16 },
    shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: space.step8 },
    sectionHeading: { paddingTop: space.step16, paddingBottom: space.step8 },
    footer: { gap: space.step8, marginTop: space.step8 },
  }),
);
