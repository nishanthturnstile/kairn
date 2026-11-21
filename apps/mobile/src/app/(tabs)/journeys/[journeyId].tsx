import type { JourneySchedule, PrivateJourney } from "@kairn/contracts";
import { journeyPath } from "@kairn/contracts/journeys";
import {
  formatJourneyLocalMinute,
  journeyScheduleAsOf,
  journeyScheduleStatus,
  journeyStatusLabels,
} from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../../../api";
import {
  JourneyGate,
  JourneyRetry,
  JourneyScreen,
  useJourneyReentry,
} from "../../../components/journeys/states";
import { Action, AppText, Panel, StatusNotice } from "../../../components/ui";
import { detailKey, historyKey, journeyResult } from "../../../journey-api";
import { useMobileSession } from "../../../mobile-session";
import type { VerifiedMobileScope } from "../../../session";

export default function JourneyDetailRoute() {
  const params = useLocalSearchParams();
  const path = journeyPath.safeParse({ journeyId: params.journeyId });
  if (!path.success) return <UnavailableJourney />;
  const { journeyId } = path.data;
  return (
    <JourneyGate title="Journey" destination={journeyId}>
      {(scope) => (
        <JourneyDetail
          key={`${scope.accountId}/${journeyId}`}
          scope={scope}
          journeyId={journeyId}
        />
      )}
    </JourneyGate>
  );
}

function UnavailableJourney() {
  const router = useRouter();
  return (
    <JourneyScreen>
      <AppText text="Journey" variant="title" accessibilityRole="header" />
      <Panel>
        <StatusNotice
          notice={{ text: "This journey is unavailable.", tone: "info" }}
        />
        <Action
          label="Back to Journeys"
          onPress={() => router.dismissTo("/journeys")}
        />
      </Panel>
    </JourneyScreen>
  );
}

function displayedMinute(value: JourneySchedule["intendedStart"]) {
  const { date, time } = formatJourneyLocalMinute(value.local);
  return `${date} · ${time}`;
}

function JourneyDetail({
  scope,
  journeyId,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
}) {
  const router = useRouter();
  const { refresh } = useMobileSession();
  const focused = useIsFocused();
  const offline = useNetworkState().isConnected === false;
  const key = useMemo(() => detailKey(journeyId), [journeyId]);
  useJourneyReentry(scope, key);
  const detail = useQuery({
    queryKey: key,
    enabled: focused && !offline,
    refetchOnMount: "always",
    refetchInterval: focused && !offline ? 30_000 : false,
    async queryFn({ signal }) {
      const result = await scope.api.GET("/api/v1/journeys/{journeyId}", {
        params: { path: { journeyId } },
        signal,
      });
      if (result.response.status === 404) {
        ensureActive(scope.signal);
        ensureActive(signal);
        scope.queryClient.removeQueries({ queryKey: ["journeys", "page"] });
        void scope.queryClient.resetQueries({
          queryKey: historyKey,
          exact: true,
        });
        return null;
      }
      return {
        journey: journeyResult(result, scope, refresh),
        asOf: journeyScheduleAsOf(result.response.headers),
      };
    },
  });
  if (!detail.isError && detail.isFetchedAfterMount && detail.data === null)
    return <UnavailableJourney />;
  const snapshot =
    focused &&
    !offline &&
    detail.isFetchedAfterMount &&
    !detail.isError &&
    !detail.isFetching
      ? detail.data
      : undefined;
  return (
    <JourneyScreen>
      {snapshot ? (
        <>
          <JourneyOverview {...snapshot} />
          <Panel>
            <AppText
              text="People"
              variant="section"
              accessibilityRole="header"
            />
            <AppText
              text={
                snapshot.journey.capabilities.includes("administrator")
                  ? "Organiser"
                  : snapshot.journey.capabilities.length === 0
                    ? "Participant"
                    : "Journey member"
              }
              subdued
            />
            <Action
              label="View People"
              onPress={() =>
                router.push({
                  pathname: "/journeys/[journeyId]/people",
                  params: { journeyId },
                })
              }
            />
          </Panel>
          <Action
            label="Back to Journeys"
            variant="text"
            onPress={() => router.dismissTo("/journeys")}
          />
        </>
      ) : (
        <>
          <AppText text="Journey" variant="title" accessibilityRole="header" />
          {offline ? (
            <StatusNotice
              notice={{
                text: "Reconnect to check access to this journey.",
                tone: "info",
              }}
            />
          ) : detail.isError ? (
            <JourneyRetry
              text="Couldn’t load this journey."
              retry={() => void detail.refetch()}
              busy={detail.isFetching}
            />
          ) : (
            <StatusNotice notice={{ text: "Loading journey", tone: "info" }} />
          )}
        </>
      )}
    </JourneyScreen>
  );
}

function JourneyOverview({
  journey,
  asOf,
}: {
  journey: PrivateJourney;
  asOf: number;
}) {
  const { schedule } = journey;
  const status = schedule && journeyScheduleStatus(schedule, asOf);
  return (
    <View style={styles.overview}>
      <View style={styles.heading}>
        <AppText
          text={journey.title}
          variant="title"
          accessibilityRole="header"
        />
        <View style={styles.metadata}>
          {status && (
            <View style={styles.status}>
              <AppText
                text={journeyStatusLabels[status]}
                variant="caption"
                style={styles.statusLabel}
              />
            </View>
          )}
          <AppText text="Private" variant="caption" subdued />
          {journey.state === "archived" && (
            <AppText text="Archived" variant="caption" subdued />
          )}
        </View>
      </View>
      <View style={styles.schedule}>
        <AppText text="Schedule" variant="section" accessibilityRole="header" />
        {schedule ? (
          <>
            <View>
              <ScheduleStop
                label="Intended start"
                minute={schedule.intendedStart}
                first
              />
              <ScheduleStop
                label="Intended end"
                minute={schedule.intendedEnd}
              />
            </View>
            <View style={styles.timezone}>
              <AppText text="Timezone" variant="caption" subdued />
              <AppText text={schedule.timeZone} variant="label" />
            </View>
          </>
        ) : (
          <AppText text="Dates unavailable" subdued />
        )}
      </View>
    </View>
  );
}

function ScheduleStop({
  label,
  minute,
  first,
}: {
  label: string;
  minute: JourneySchedule["intendedEnd"];
  first?: boolean;
}) {
  return (
    <View style={[styles.stop, first && styles.firstStop]}>
      {first && <View style={styles.line} accessible={false} />}
      <View
        style={[styles.dot, minute && styles.filledDot]}
        accessible={false}
      />
      <AppText text={label} variant="caption" subdued />
      <AppText
        text={minute ? displayedMinute(minute) : "End date unknown"}
        variant="label"
        subdued={!minute}
      />
    </View>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    overview: {
      overflow: "hidden",
      borderRadius: radius.card,
      borderColor: color.boundary,
      borderWidth: border.control,
      backgroundColor: color.surface,
    },
    heading: {
      backgroundColor: color.actionWash,
      padding: space.step16,
      gap: space.step12,
    },
    metadata: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: space.step12,
    },
    status: {
      maxWidth: "100%",
      borderRadius: radius.control,
      backgroundColor: color.surface,
      paddingVertical: space.step4,
      paddingHorizontal: space.step8,
    },
    statusLabel: { color: color.action },
    schedule: {
      borderTopColor: color.boundary,
      borderTopWidth: border.control,
      gap: space.step16,
      padding: space.step16,
    },
    stop: { paddingStart: space.step24, gap: space.step4 },
    firstStop: { paddingBottom: space.step16 },
    line: {
      position: "absolute",
      start: space.step4,
      top: space.step8,
      bottom: -space.step8,
      width: border.control,
      backgroundColor: color.boundary,
    },
    dot: {
      position: "absolute",
      start: 0,
      top: space.step8,
      width: 9,
      height: 9,
      borderRadius: space.step8,
      borderColor: color.action,
      borderWidth: border.control,
      backgroundColor: color.surface,
    },
    filledDot: { backgroundColor: color.action },
    timezone: {
      borderTopColor: color.boundary,
      borderTopWidth: border.control,
      paddingTop: space.step12,
      gap: space.step4,
    },
  }),
);
