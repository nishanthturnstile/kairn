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
import { Image, useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { InviteComposer } from "../../../../components/journeys/invite-composer";
import {
  JourneyGate,
  JourneyRetry,
  JourneyScreen,
  journeyStyles,
} from "../../../../components/journeys/states";
import { Action, AppText, StatusNotice } from "../../../../components/ui";
import { journeyInvitationsKey, journeyResult } from "../../../../journey-api";
import { useMobileSession } from "../../../../mobile-session";
import type { VerifiedMobileScope } from "../../../../session";

const ferry = require("../../../../../assets/onboarding/ferry.jpg");

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
  const { width, fontScale } = useWindowDimensions();
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
      <JourneyScreen>
        {journey && (
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText
                text="Journey saved"
                variant="caption"
                style={styles.onHeader}
              />
              <AppText
                text="Invite people"
                variant="title"
                style={styles.onHeader}
                accessibilityRole="header"
              />
              {enabled && (
                <AppText text={journey.title} style={styles.onHeader} />
              )}
            </View>
            {width >= 380 && fontScale <= 1.15 && (
              <View style={styles.artFrame}>
                <Image source={ferry} style={styles.art} accessible={false} />
              </View>
            )}
          </View>
        )}
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
          !journey && (
            <StatusNotice
              notice={{ text: "Checking journey access", tone: "info" }}
            />
          )
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
        <View style={styles.recheckNotice} pointerEvents="none">
          <StatusNotice
            notice={{ text: "Checking journey access", tone: "info" }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  header: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: radius.card,
    backgroundColor: color.action,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: space.step4,
    padding: space.step16,
  },
  onHeader: { color: color.onAction },
  artFrame: { width: "28%", alignSelf: "stretch" },
  art: { width: "100%", height: "100%", position: "absolute", top: 0, left: 0 },
  concealed: { opacity: 0 },
  recheckNotice: {
    position: "absolute",
    top: space.step8,
    left: space.step24,
    right: space.step24,
  },
}));
