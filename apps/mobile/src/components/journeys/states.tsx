import { useFocusEffect, useRouter } from "expo-router";
import { type ReactNode, useCallback } from "react";
import { View } from "react-native";
import { FoldScreen as JourneyScreen } from "../fold/screen";

export { JourneyScreen };

import { StyleSheet } from "react-native-unistyles";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { DestinationTopBar } from "../destination";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";

export const journeyStyles = StyleSheet.create(
  ({ semantic: { color, space } }) => ({
    screen: { flex: 1, backgroundColor: color.canvas },
    hidden: { display: "none" },
    content: { gap: space.step16, padding: space.step24 },
    contentHeader: { gap: space.step16 },
    group: { gap: space.step8 },
  }),
);

export function JourneyGate({
  title,
  destination = "journeys",
  top,
  children,
}: {
  title: string;
  destination?: string;
  top?: boolean;
  children: (scope: VerifiedMobileScope) => ReactNode;
}) {
  const router = useRouter();
  const { state, scope, refresh, isRevalidating } = useMobileSession();
  return (
    <>
      {scope && (
        <View
          style={isRevalidating ? journeyStyles.hidden : journeyStyles.screen}
        >
          {children(scope)}
        </View>
      )}
      {(!scope || isRevalidating) && (
        <JourneyScreen top={top}>
          {top && <DestinationTopBar />}
          <AppText text={title} variant="title" accessibilityRole="header" />
          {state === "checking" && (
            <StatusNotice
              notice={{ text: "Checking your session", tone: "info" }}
            />
          )}
          {state === "unavailable" && (
            <Panel>
              <StatusNotice
                notice={{ text: "Couldn’t check your session.", tone: "error" }}
              />
              <Action label="Try again" onPress={() => refresh()} />
            </Panel>
          )}
          {state === "signed-out" && (
            <Panel>
              <AppText text="Your journeys are private." subdued />
              <Action
                label="Sign in"
                variant="primary"
                onPress={() =>
                  router.push({
                    pathname: "/account",
                    params: { returnTo: destination },
                  })
                }
              />
            </Panel>
          )}
        </JourneyScreen>
      )}
    </>
  );
}

export function useJourneyReentry(
  scope: VerifiedMobileScope,
  key: readonly string[],
) {
  const { recheck } = useMobileSession();
  useFocusEffect(
    useCallback(() => {
      let focused = true;
      void recheck().then(() => {
        if (focused && !scope.signal.aborted)
          void scope.queryClient.invalidateQueries({
            queryKey: key,
            exact: true,
          });
      });
      return () => {
        focused = false;
      };
    }, [key, recheck, scope]),
  );
}

export function JourneyRetry({
  text,
  retry,
  busy,
}: {
  text: string;
  retry: () => void;
  busy?: boolean;
}) {
  return (
    <Panel>
      <StatusNotice notice={{ text, tone: "error" }} />
      <Action
        label={busy ? "Trying again…" : "Try again"}
        onPress={retry}
        disabled={busy}
      />
    </Panel>
  );
}
