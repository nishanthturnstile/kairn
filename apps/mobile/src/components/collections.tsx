import {
  type JourneyCollection,
  journeyCollections,
} from "@kairn/shared/journey-collections";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Image, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useMobileSession } from "../mobile-session";
import { DestinationTopBar } from "./destination";
import { ContentLoading } from "./fold/expression";
import { Action, AppText, Panel } from "./fold/primitives";
import { FoldScreen } from "./fold/screen";
import { JourneyFlowHeading } from "./journeys/flow";
import { JourneyRetry } from "./journeys/states";

const coast = require("../../../../packages/design-tokens/assets/discover-coast.webp");
const bookmark = require("../../assets/icons/bookmark.png");

export function CollectionsScreen({
  destination,
}: {
  destination: JourneyCollection;
}) {
  const { scope } = useMobileSession();
  const { theme } = useUnistyles();
  const { fontScale } = useWindowDimensions();
  const copy = journeyCollections[destination];
  const discover = destination === "discover";
  const readiness = useQuery({
    queryKey: ["readiness"],
    enabled: Boolean(scope),
    async queryFn({ signal }) {
      const { data } =
        (await scope?.api.GET("/api/v1/ready", { signal })) ?? {};
      if (data?.status !== "ready") throw new Error("Service unavailable");
      return data;
    },
  });

  const empty = (
    <>
      <View style={styles.copy}>
        <AppText
          text={copy.emptyTitle}
          variant="section"
          accessibilityRole="header"
        />
        <AppText text={copy.emptyDescription} subdued />
      </View>
      <Link href={copy.action.to} asChild>
        <Action
          accessibilityRole="link"
          label={copy.action.label}
          variant={discover ? "primary" : "secondary"}
        />
      </Link>
    </>
  );
  return (
    <FoldScreen top>
      <View style={styles.screen}>
        <DestinationTopBar />
        <JourneyFlowHeading title={copy.title} description={copy.description} />
        {readiness.isPending ? (
          <ContentLoading label="Checking availability" announce />
        ) : readiness.isError ? (
          <JourneyRetry
            text="Couldn’t connect to Kairn. Check your connection, then try again."
            busy={readiness.isFetching}
            retry={() => void readiness.refetch()}
          />
        ) : discover ? (
          <View style={styles.feature}>
            <Image
              source={coast}
              accessible={false}
              importantForAccessibility="no"
              style={[styles.coast, fontScale >= 1.5 && styles.coastCompact]}
            />
            <View style={styles.featureCopy}>{empty}</View>
          </View>
        ) : (
          <Panel>
            <View
              style={styles.badge}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Image
                source={bookmark}
                accessible={false}
                style={[
                  styles.icon,
                  { tintColor: theme.semantic.color.action },
                ]}
              />
            </View>
            {empty}
          </Panel>
        )}
      </View>
    </FoldScreen>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    screen: {
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
      gap: space.step16,
    },
    feature: {
      overflow: "hidden",
      borderRadius: radius.card,
      borderWidth: border.control,
      borderColor: color.boundary,
      backgroundColor: color.surface,
    },
    coast: {
      width: "100%",
      aspectRatio: 2,
      maxHeight: 220,
      backgroundColor: color.actionWash,
    },
    coastCompact: { height: 96, aspectRatio: undefined },
    featureCopy: { padding: space.step16, gap: space.step12 },
    copy: { gap: space.step4 },
    badge: {
      width: space.step40,
      height: space.step40,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: color.actionWash,
      borderRadius: radius.control,
    },
    icon: { width: space.step24, height: space.step24 },
  }),
);
