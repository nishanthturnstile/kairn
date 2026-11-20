import type { JourneySchedule } from "@kairn/contracts";
import { journeyPath } from "@kairn/contracts/journeys";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { ensureActive } from "../../../api";
import {
  JourneyGate,
  JourneyRetry,
  JourneyScreen,
  journeyStyles,
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
  const key = useMemo(() => detailKey(journeyId), [journeyId]);
  useJourneyReentry(scope, key);
  const detail = useQuery({
    queryKey: key,
    refetchOnMount: "always",
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
      return journeyResult(result, scope, refresh);
    },
  });
  if (!detail.isError && detail.isFetchedAfterMount && detail.data === null)
    return <UnavailableJourney />;
  const journey =
    detail.isFetchedAfterMount && !detail.isError ? detail.data : undefined;
  return (
    <JourneyScreen>
      <AppText
        text={journey?.title ?? "Journey"}
        variant="title"
        accessibilityRole="header"
      />
      {detail.isError ? (
        <JourneyRetry
          text="Couldn’t load this journey."
          retry={() => void detail.refetch()}
          busy={detail.isFetching}
        />
      ) : !journey ? (
        <StatusNotice notice={{ text: "Loading journey", tone: "info" }} />
      ) : (
        <>
          <AppText
            text={
              journey.state === "archived" ? "Private · Archived" : "Private"
            }
            variant="label"
            subdued
          />
          <Panel>
            {journey.schedule ? (
              <>
                <View style={journeyStyles.group}>
                  <AppText text="Intended start" variant="label" />
                  <AppText
                    text={displayedMinute(journey.schedule.intendedStart)}
                  />
                </View>
                <View style={journeyStyles.group}>
                  <AppText text="Intended end" variant="label" />
                  <AppText
                    text={
                      journey.schedule.intendedEnd
                        ? displayedMinute(journey.schedule.intendedEnd)
                        : "End date unknown"
                    }
                  />
                </View>
                <View style={journeyStyles.group}>
                  <AppText text="Timezone" variant="label" />
                  <AppText text={journey.schedule.timeZone} />
                </View>
              </>
            ) : (
              <AppText text="Dates unavailable" subdued />
            )}
          </Panel>
          <Action
            label="Back to Journeys"
            onPress={() => router.dismissTo("/journeys")}
          />
        </>
      )}
    </JourneyScreen>
  );
}
