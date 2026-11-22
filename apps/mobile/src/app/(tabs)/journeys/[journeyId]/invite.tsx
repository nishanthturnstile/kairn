import { journeyPath } from "@kairn/contracts/journeys";
import { useQuery } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import {
  Redirect,
  useIsFocused,
  useLocalSearchParams,
  usePreventRemove,
  useRouter,
} from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Action, StatusNotice } from "../../../../components/fold/primitives";
import { JourneyFlowHeading } from "../../../../components/journeys/flow";
import { InviteComposer } from "../../../../components/journeys/invite-composer";
import {
  JourneyGate,
  JourneyRetry,
  JourneyScreen,
  journeyStyles,
} from "../../../../components/journeys/states";
import { journeyInvitationsKey, journeyResult } from "../../../../journey-api";
import { useMobileSession } from "../../../../mobile-session";
import type { VerifiedMobileScope } from "../../../../session";

export default function InviteRoute() {
  const { journeyId } = useLocalSearchParams();
  const parsed = journeyPath.safeParse({ journeyId });
  if (!parsed.success) return <Redirect href="/journeys" />;
  const id = parsed.data.journeyId;
  return (
    <JourneyGate title="Invite people" destination={`/journeys/${id}/invite`}>
      {(scope) => (
        <JourneyInvitations
          key={`${scope.accountId}/${id}`}
          scope={scope}
          journeyId={id}
        />
      )}
    </JourneyGate>
  );
}

function JourneyInvitations({
  scope,
  journeyId,
}: {
  scope: VerifiedMobileScope;
  journeyId: string;
}) {
  const router = useRouter();
  const { state, refresh } = useMobileSession();
  const focused = useIsFocused();
  const online = useNetworkState().isConnected !== false;
  const [sending, setSending] = useState(false);
  const active = focused && online && state === "verified";
  usePreventRemove(sending && state === "verified", () => {});
  const access = useQuery({
    queryKey: ["journeys", "invite-access", journeyId],
    enabled: active,
    refetchOnMount: "always",
    refetchInterval: active ? 30_000 : false,
    async queryFn({ signal }) {
      const response = await scope.api.GET("/api/v1/journeys/{journeyId}", {
        params: { path: { journeyId } },
        signal,
      });
      return response.response.status === 404
        ? null
        : journeyResult(response, scope, refresh);
    },
  });
  const journey = access.isFetchedAfterMount ? access.data : undefined;
  const destination = {
    pathname: "/journeys/[journeyId]",
    params: { journeyId },
  } as const;
  if (journey === null) return <Redirect href="/journeys" />;
  if (
    journey &&
    (journey.state !== "draft" ||
      !journey.capabilities.includes("administrator"))
  )
    return <Redirect href={destination} />;

  const disconnected = !online || access.isPaused;
  const unavailable = disconnected || access.isError;
  const enabled = active && !unavailable && !access.isFetching;
  return (
    <View style={journeyStyles.screen}>
      <JourneyScreen density="compact">
        <JourneyFlowHeading
          title="Invite people"
          description="Choose who can join your journey."
        />
        {disconnected ? (
          <StatusNotice
            notice={{ text: "Reconnect to invite people.", tone: "info" }}
          />
        ) : access.isError ? (
          <JourneyRetry
            text="Couldn’t check journey access."
            busy={access.isFetching}
            retry={() => void access.refetch()}
          />
        ) : (
          <StatusNotice
            notice={
              journey
                ? { text: "Journey saved", tone: "success" }
                : { text: "Checking journey access", tone: "info" }
            }
          />
        )}
        {unavailable && !sending && (
          <Action
            label="Open journey"
            onPress={() => router.replace(destination)}
          />
        )}
        {journey && (
          <View
            style={
              unavailable ? journeyStyles.hidden : !enabled && styles.concealed
            }
            pointerEvents={enabled ? "auto" : "none"}
            accessibilityElementsHidden={!enabled}
            importantForAccessibility={enabled ? "auto" : "no-hide-descendants"}
          >
            <InviteComposer
              scope={scope}
              journeyId={journeyId}
              title={journey.title}
              enabled={enabled}
              open
              afterCreation
              onBusy={setSending}
              onClose={() => router.replace(destination)}
              onSent={() =>
                void scope.queryClient.invalidateQueries({
                  queryKey: journeyInvitationsKey(journeyId),
                })
              }
            />
          </View>
        )}
      </JourneyScreen>
      {journey && active && !unavailable && access.isFetching && (
        <View pointerEvents="none" style={styles.recheckNotice}>
          <StatusNotice
            notice={{ text: "Checking journey access", tone: "info" }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create(({ semantic: { space } }) => ({
  concealed: { opacity: 0 },
  recheckNotice: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: space.step16,
  },
}));
