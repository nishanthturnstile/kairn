import type { PrivateJourney } from "@kairn/contracts";
import {
  type JourneyTimelineSection,
  journeyTimelineSections,
} from "@kairn/contracts/journeys";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Image,
  Pressable,
  SectionList,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../journey-api";
import { departureKey } from "../../membership-attempt";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { DestinationTopBar } from "../destination";
import {
  Action,
  AppText,
  focusOutline,
  StatusNotice,
  touchTarget,
} from "../ui";
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
const beach = require("../../../assets/onboarding/beach.jpg");
type Section = JourneyTimelineSection;
type Page = { items: PrivateJourney[]; nextCursor: string | null };
type Continuations = { asOf: string; pages: Partial<Record<Section, Page>> };

function rowDates(journey: PrivateJourney) {
  if (!journey.schedule) return "Dates unavailable";
  const start = formatJourneyLocalMinute(journey.schedule.intendedStart.local);
  const end = journey.schedule.intendedEnd
    ? formatJourneyLocalMinute(journey.schedule.intendedEnd.local)
    : null;
  return end
    ? `${start.date}, ${start.time} to ${end.date}, ${end.time}`
    : `${start.date}, ${start.time} · No end date`;
}

export function JourneyHistory({ scope }: { scope: VerifiedMobileScope }) {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const stackHeader = width < 365 || fontScale > 1.35;
  const { refresh, recheck } = useMobileSession();
  const [continuations, setContinuations] = useState<Continuations>();
  const [failed, setFailed] = useState<Section>();
  const [loading, setLoading] = useState<Section>();
  const inFlight = useRef(false);
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
            ...sectionInfo[id],
            data: page.items,
            nextCursor: page.nextCursor,
          },
        ];
      })
    : [];

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
    <SafeAreaView edges={["top", "left", "right"]} style={journeyStyles.screen}>
      <SectionList
        sections={sections}
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
              {(sections.length > 0 || history.isError) && (
                <Action
                  label="Create journey"
                  variant="primary"
                  onPress={create}
                />
              )}
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
              <StatusNotice
                notice={{ text: "Loading your journeys", tone: "info" }}
              />
            ) : (
              sections.length === 0 && (
                <View style={styles.empty}>
                  <Image source={beach} accessible={false} style={styles.art} />
                  <View style={styles.emptyCopy}>
                    <AppText
                      text="No journeys yet"
                      variant="section"
                      accessibilityRole="header"
                    />
                    <AppText
                      text="Plan somewhere you’re going or keep a private record of somewhere you’ve been."
                      subdued
                    />
                    <Action
                      label="Create journey"
                      variant="primary"
                      onPress={create}
                    />
                  </View>
                </View>
              )
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeading}>
            <AppText
              text={section.title}
              variant="section"
              accessibilityRole="header"
            />
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <JourneyRow
            journey={item}
            active={section.id === "active"}
            first={index === 0}
            last={index === section.data.length - 1}
            open={() =>
              router.push({
                pathname: "/journeys/[journeyId]",
                params: { journeyId: item.id },
              })
            }
          />
        )}
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
    </SafeAreaView>
  );
}

function JourneyRow({
  journey,
  active,
  first,
  last,
  open,
}: {
  journey: PrivateJourney;
  active: boolean;
  first: boolean;
  last: boolean;
  open: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const dates = rowDates(journey);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${journey.title}, ${dates}${journey.state === "archived" ? ", Archived" : ""}`}
      onPress={open}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.row,
        first && styles.first,
        last && styles.last,
        active && styles.active,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <View style={styles.rowCopy}>
        <AppText text={journey.title} variant={active ? "section" : "label"} />
        <AppText text={dates} variant="caption" subdued />
        {journey.state === "archived" && (
          <AppText text="Archived" variant="caption" subdued />
        )}
      </View>
      <View style={styles.chevron} accessible={false} />
    </Pressable>
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
    art: { width: "100%", height: 156 },
    emptyCopy: { gap: space.step12, padding: space.step16 },
    sectionHeading: { paddingBottom: space.step8 },
    row: {
      minHeight: touchTarget,
      backgroundColor: color.surface,
      borderColor: color.boundary,
      borderTopWidth: border.control,
      borderStartWidth: border.control,
      borderEndWidth: border.control,
      padding: space.step16,
      flexDirection: "row",
      alignItems: "center",
      gap: space.step12,
    },
    first: {
      borderTopStartRadius: radius.card,
      borderTopEndRadius: radius.card,
    },
    last: {
      borderBottomStartRadius: radius.card,
      borderBottomEndRadius: radius.card,
      borderBottomWidth: border.control,
      marginBottom: space.step12,
    },
    active: { backgroundColor: color.actionWash },
    rowCopy: { flex: 1, minWidth: 0, gap: space.step4 },
    chevron: {
      width: space.step8,
      height: space.step8,
      borderTopWidth: 2,
      borderRightWidth: 2,
      borderColor: color.secondaryText,
      transform: [{ rotate: "45deg" }],
    },
    pressed: { backgroundColor: color.actionWash },
    focused: focusOutline(color.information),
    footer: { gap: space.step8, marginTop: space.step8 },
  }),
);
