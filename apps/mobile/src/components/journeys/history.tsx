import type { PrivateJourney } from "@kairn/contracts";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import {
  historyKey,
  JourneyRequestError,
  journeyResult,
} from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { DestinationTopBar } from "../destination";
import {
  Action,
  AppText,
  focusOutline,
  Panel,
  StatusNotice,
  touchTarget,
} from "../ui";
import { JourneyRetry, journeyStyles, useJourneyReentry } from "./states";

const sectionInfo = {
  upcoming: {
    title: "Upcoming",
    empty: "No upcoming journeys",
    more: "Load more upcoming journeys",
  },
  recent: {
    title: "Recent journeys",
    empty: "No recent journeys",
    more: "Load more recent journeys",
  },
};
type Section = keyof typeof sectionInfo;
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
    : `${start.date}, ${start.time} · End date unknown`;
}

export function JourneyHistory({ scope }: { scope: VerifiedMobileScope }) {
  const router = useRouter();
  const { refresh, recheck } = useMobileSession();
  const [continuations, setContinuations] = useState<Continuations>();
  const [failed, setFailed] = useState<Section>();
  const [loading, setLoading] = useState<Section>();
  const inFlight = useRef(false);
  useJourneyReentry(scope, historyKey);
  const history = useQuery({
    queryKey: historyKey,
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
  const current =
    history.isFetchedAfterMount && !history.isError ? history.data : undefined;
  const pages =
    current && continuations?.asOf === current.asOf ? continuations.pages : {};
  const sections =
    current && (current.upcoming.items.length || current.recent.items.length)
      ? (["upcoming", "recent"] as const).map((id) => {
          const page = pages[id] ?? current[id];
          return {
            id,
            ...sectionInfo[id],
            data: page.items,
            nextCursor: page.nextCursor,
          };
        })
      : [];

  async function loadMore(section: Section, cursor: string) {
    if (!current || inFlight.current || scope.signal.aborted) return;
    inFlight.current = true;
    setLoading(section);
    setFailed(undefined);
    const initial = pages[section] ?? current[section];
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

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={journeyStyles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={journeyStyles.content}
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
            <AppText
              text="Journeys"
              variant="title"
              accessibilityRole="header"
            />
            <Action
              label="Create journey"
              variant="primary"
              onPress={() => router.push("/journeys/new")}
            />
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
                <Panel>
                  <AppText
                    text="No journeys yet"
                    variant="section"
                    accessibilityRole="header"
                  />
                </Panel>
              )
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <AppText
            text={section.title}
            variant="section"
            accessibilityRole="header"
          />
        )}
        renderItem={({ item }) => (
          <JourneyRow
            journey={item}
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
          ) : section.data.length === 0 ? (
            <Panel>
              <AppText text={section.empty} subdued />
            </Panel>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function JourneyRow({
  journey,
  open,
}: {
  journey: PrivateJourney;
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
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <AppText text={journey.title} variant="label" />
      <AppText text={dates} subdued />
      {journey.state === "archived" && <AppText text="Archived" subdued />}
    </Pressable>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { color, border, radius, space } }) => ({
    row: {
      minHeight: touchTarget,
      marginTop: space.step8,
      borderRadius: radius.card,
      backgroundColor: color.surface,
      borderColor: color.boundary,
      borderWidth: border.control,
      padding: space.step16,
      gap: space.step4,
    },
    pressed: { backgroundColor: color.actionWash },
    focused: focusOutline(color.information),
    footer: { gap: space.step8, marginTop: space.step8 },
  }),
);
