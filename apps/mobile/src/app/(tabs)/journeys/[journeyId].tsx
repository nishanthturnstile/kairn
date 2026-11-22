import { journeyPath } from "@kairn/contracts/journeys";
import { journeyScheduleAsOf } from "@kairn/shared/journey-time";
import { useQuery } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ensureActive } from "../../../api";
import { Action, StatusNotice } from "../../../components/fold/primitives";
import { JourneyDetailContent } from "../../../components/journeys/detail";
import { JourneyFlowHeading } from "../../../components/journeys/flow";
import {
  JourneyGate,
  JourneyRetry,
  JourneyScreen,
  useJourneyReentry,
} from "../../../components/journeys/states";
import { detailKey, historyKey, journeyResult } from "../../../journey-api";
import { useMobileSession } from "../../../mobile-session";
import type { VerifiedMobileScope } from "../../../session";

export default function JourneyDetailRoute() {
  const params = useLocalSearchParams();
  const path = journeyPath.safeParse({ journeyId: params.journeyId });
  if (!path.success)
    return (
      <JourneyScreen density="compact">
        <JourneyFlowHeading title="Journey" />
        <UnavailableNotice />
        <BackToJourneys />
      </JourneyScreen>
    );
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

function UnavailableNotice() {
  return (
    <StatusNotice
      notice={{ text: "This journey is unavailable.", tone: "info" }}
    />
  );
}

function BackToJourneys() {
  const router = useRouter();
  return (
    <Action
      label="Back to Journeys"
      variant="text"
      onPress={() => router.dismissTo("/journeys")}
    />
  );
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
  const disconnected = offline || detail.isPaused;
  const verified =
    focused &&
    !disconnected &&
    detail.isFetchedAfterMount &&
    !detail.isError &&
    !detail.isFetching;
  const snapshot = verified ? detail.data : undefined;
  return (
    <JourneyScreen density="compact">
      <JourneyFlowHeading title={snapshot?.journey.title ?? "Journey"} />
      {focused &&
        (snapshot ? (
          <JourneyDetailContent
            {...snapshot}
            onViewPeople={() =>
              router.push({
                pathname: "/journeys/[journeyId]/people",
                params: { journeyId },
              })
            }
          />
        ) : snapshot === null ? (
          <UnavailableNotice />
        ) : disconnected ? (
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
          <StatusNotice
            notice={{
              text: detail.isFetchedAfterMount
                ? "Checking journey access"
                : "Loading journey",
              tone: "info",
            }}
          />
        ))}
      <BackToJourneys />
    </JourneyScreen>
  );
}
