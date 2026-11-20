import type {
  DashboardJourney,
  DashboardSummary,
  OnboardingIntent,
} from "@kairn/contracts";
import { journeyIntentCopy } from "@kairn/shared/journey-intent-copy";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Image, useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DestinationTopBar } from "../../components/destination";
import {
  JourneyRetry,
  JourneyScreen,
  useJourneyReentry,
} from "../../components/journeys/states";
import { Action, AppText, Panel, StatusNotice } from "../../components/ui";
import { journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { useWorkspace } from "../../workspace";
import { dashboardKey } from "../../workspace-keys";

const beachArt = require("../../../assets/onboarding/beach.jpg");

export default function DashboardRoute() {
  const { scope } = useMobileSession();
  return scope ? <Dashboard key={scope.accountId} scope={scope} /> : null;
}

function Dashboard({ scope }: { scope: VerifiedMobileScope }) {
  const { progress } = useWorkspace();
  const { refresh } = useMobileSession();
  useJourneyReentry(scope, dashboardKey);
  const query = useQuery({
    queryKey: dashboardKey,
    refetchOnMount: "always",
    async queryFn({ signal }) {
      return journeyResult(
        await scope.api.GET("/api/v1/dashboard", {
          params: { header: { "x-expected-account": scope.accountId } },
          signal,
        }),
        scope,
        refresh,
      );
    },
  });
  const summary = query.isFetching || query.isError ? undefined : query.data;
  const intent =
    progress.data?.state === "completed" && summary?.journeyCount === 0
      ? progress.data.intent
      : undefined;

  return (
    <JourneyScreen top>
      <DestinationTopBar />
      <View style={styles.group}>
        <AppText text="Dashboard" variant="title" accessibilityRole="header" />
        <AppText text="Your upcoming plans and recent journeys." subdued />
      </View>
      {!summary ? (
        query.isError ? (
          <JourneyRetry
            text="Couldn’t load your Dashboard."
            busy={query.isFetching}
            retry={() => void query.refetch()}
          />
        ) : (
          <StatusNotice
            notice={{ text: "Loading your Dashboard", tone: "info" }}
          />
        )
      ) : (
        <Overview summary={summary} intent={intent} />
      )}
    </JourneyScreen>
  );
}

function CreateJourneyLink({ intent }: { intent?: OnboardingIntent }) {
  return (
    <Link
      href={
        intent
          ? { pathname: "/journeys/new", params: { intent } }
          : "/journeys/new"
      }
      asChild
    >
      <Action
        label={intent ? journeyIntentCopy[intent].action : "Create a journey"}
        variant="primary"
        accessibilityRole="link"
      />
    </Link>
  );
}

function Overview({
  summary,
  intent,
}: {
  summary: DashboardSummary;
  intent?: OnboardingIntent;
}) {
  const { fontScale } = useWindowDimensions();
  const first = intent ? journeyIntentCopy[intent] : undefined;

  return (
    <>
      {summary.journeyCount === 0 ? (
        <Panel>
          <AppText
            text={first?.heading ?? "Your journeys start here"}
            accessibilityRole="header"
            variant="section"
          />
          <AppText
            text={
              first?.description ??
              "Add a journey and its dates to see your upcoming plans and recent journeys here."
            }
            subdued
          />
          <CreateJourneyLink intent={intent} />
          <Image source={beachArt} style={styles.cover} accessible={false} />
        </Panel>
      ) : (
        <>
          <CreateJourneyLink />
          <View style={styles.next}>
            <AppText
              text="Next journey"
              variant="section"
              accessibilityRole="header"
            />
            {summary.nextJourney ? (
              <JourneyRow journey={summary.nextJourney} />
            ) : (
              <AppText text="No upcoming journeys scheduled." subdued />
            )}
          </View>
        </>
      )}
      <Panel>
        <AppText text="Overview" variant="section" accessibilityRole="header" />
        <View style={[styles.metrics, fontScale >= 1.5 && styles.stacked]}>
          <Metric label="Journeys" value={summary.journeyCount} />
          <Metric label="Upcoming plans" value={summary.upcomingCount} />
        </View>
      </Panel>
      {summary.journeyCount > 0 && (
        <Panel>
          <View style={styles.recent}>
            <AppText
              text="Recent journeys"
              variant="section"
              accessibilityRole="header"
            />
            <Link href="/journeys" asChild>
              <Action label="All journeys" accessibilityRole="link" />
            </Link>
          </View>
          {summary.recentJourneys.length ? (
            summary.recentJourneys.map((journey) => (
              <JourneyRow key={journey.id} journey={journey} />
            ))
          ) : (
            <AppText
              text="Journeys appear here once their planned start date arrives."
              subdued
            />
          )}
        </Panel>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <AppText text={label} variant="caption" subdued />
      <AppText text={value.toLocaleString("en-IN")} variant="section" />
    </View>
  );
}

function JourneyRow({ journey }: { journey: DashboardJourney }) {
  const start = journey.schedule?.intendedStart;
  const formatted = start && formatJourneyLocalMinute(start.local);
  return (
    <View style={styles.row}>
      <Link
        href={{
          pathname: "/journeys/[journeyId]",
          params: { journeyId: journey.id },
        }}
        asChild
      >
        <Action label={journey.title} accessibilityRole="link" />
      </Link>
      <AppText
        text={
          formatted
            ? `${formatted.date} · ${formatted.time}`
            : "Dates unavailable"
        }
        subdued
        variant="caption"
      />
      {journey.state === "archived" && (
        <AppText text="Archived" subdued variant="caption" />
      )}
    </View>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    group: { gap: space.step8 },
    next: {
      gap: space.step12,
      padding: space.step16,
      borderRadius: radius.card,
      backgroundColor: color.actionWash,
      borderWidth: border.control,
      borderColor: color.boundary,
    },
    cover: {
      width: "100%",
      height: 112,
      borderRadius: radius.control,
      backgroundColor: color.actionWash,
    },
    metrics: { flexDirection: "row", gap: space.step12 },
    stacked: { flexDirection: "column" },
    metric: {
      flex: 1,
      gap: space.step4,
      paddingVertical: space.step8,
      paddingHorizontal: space.step12,
      borderRadius: radius.control,
      backgroundColor: color.canvas,
    },
    recent: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.step8,
    },
    row: { gap: space.step4, paddingVertical: space.step4 },
  }),
);
