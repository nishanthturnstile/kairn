import type {
  DashboardJourney,
  DashboardSummary,
  OnboardingIntent,
} from "@kairn/contracts";
import { journeyIntentCopy } from "@kairn/shared/journey-intent-copy";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { Image, useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DestinationTopBar } from "../../components/destination";
import { ContentLoading } from "../../components/fold/expression";
import { Action, AppText, Panel } from "../../components/fold/primitives";
import { JourneyRow } from "../../components/journeys/journey-row";
import {
  JourneyRetry,
  JourneyScreen,
  useJourneyReentry,
} from "../../components/journeys/states";
import { journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { useWorkspace } from "../../workspace";
import { dashboardKey } from "../../workspace-keys";

const notebook = require("../../../../../packages/design-tokens/assets/dashboard-travel-notebook.webp");

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
          <ContentLoading label="Loading your Dashboard" announce />
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
      withAnchor
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

  if (summary.journeyCount === 0) {
    return (
      <View style={styles.welcome}>
        <Image
          source={notebook}
          style={styles.cover}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={styles.welcomeCopy}>
          <AppText
            text={first?.heading ?? "Your journeys start here"}
            accessibilityRole="header"
            variant="section"
          />
          <AppText
            text={
              first?.description ??
              "Plan somewhere you’re going or keep a private record of somewhere you’ve been."
            }
            subdued
          />
          <CreateJourneyLink intent={intent} />
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.section}>
        <AppText
          text="Next journey"
          variant="section"
          accessibilityRole="header"
        />
        {summary.nextJourney ? (
          <DashboardJourneyLink journey={summary.nextJourney} featured />
        ) : (
          <Panel compact>
            <AppText text="No upcoming journeys scheduled." subdued />
          </Panel>
        )}
      </View>
      <CreateJourneyLink />
      <View style={styles.section}>
        <AppText text="Overview" variant="section" accessibilityRole="header" />
        <View style={[styles.metrics, fontScale >= 1.5 && styles.stacked]}>
          <Metric label="Journeys" value={summary.journeyCount} />
          <Metric label="Upcoming plans" value={summary.upcomingCount} />
        </View>
      </View>
      <View style={styles.section}>
        <View style={styles.recent}>
          <AppText
            text="Recent journeys"
            variant="section"
            accessibilityRole="header"
          />
          <Link href="/journeys" asChild>
            <Action
              label="All journeys"
              accessibilityRole="link"
              variant="text"
              size="compact"
            />
          </Link>
        </View>
        {summary.recentJourneys.length ? (
          <View>
            {summary.recentJourneys.map((journey, index) => (
              <DashboardJourneyLink
                key={journey.id}
                journey={journey}
                first={index === 0}
                last={index === summary.recentJourneys.length - 1}
              />
            ))}
          </View>
        ) : (
          <AppText
            text="Journeys appear here once their planned start date arrives."
            subdued
          />
        )}
      </View>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={styles.metric}
    >
      <AppText text={value.toLocaleString("en-IN")} variant="section" />
      <AppText text={label} variant="caption" subdued />
    </View>
  );
}

function DashboardJourneyLink({
  journey,
  featured,
  first,
  last,
}: {
  journey: DashboardJourney;
  featured?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  const router = useRouter();
  const start = journey.schedule?.intendedStart;
  const formatted = start && formatJourneyLocalMinute(start.local);
  const date = formatted
    ? `${formatted.date} · ${formatted.time}`
    : "Dates unavailable";
  const archived = journey.state === "archived";
  return (
    <JourneyRow
      title={journey.title}
      detail={archived ? `${date}, Archived` : date}
      featured={featured}
      first={first}
      last={last}
      onPress={() =>
        router.push(
          {
            pathname: "/journeys/[journeyId]",
            params: { journeyId: journey.id },
          },
          { withAnchor: true },
        )
      }
    >
      <AppText text={date} subdued variant="caption" />
      {archived && <AppText text="Archived" subdued variant="caption" />}
    </JourneyRow>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    group: { gap: space.step4 },
    section: { gap: space.step8 },
    welcome: {
      overflow: "hidden",
      borderRadius: radius.card,
      backgroundColor: color.surface,
      borderWidth: border.control,
      borderColor: color.boundary,
    },
    welcomeCopy: { gap: space.step12, padding: space.step16 },
    cover: {
      width: "100%",
      height: 152,
      backgroundColor: color.actionWash,
    },
    metrics: { flexDirection: "row", gap: space.step8 },
    stacked: { flexDirection: "column" },
    metric: {
      flex: 1,
      gap: space.step4,
      paddingVertical: space.step8,
      paddingHorizontal: space.step12,
      borderRadius: radius.control,
      backgroundColor: color.surface,
      borderWidth: border.control,
      borderColor: color.boundary,
    },
    recent: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
    },
  }),
);
