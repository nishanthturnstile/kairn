import { Link } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { CairnLogo } from "./cairn-logo";
import { Action, AppText, Panel } from "./fold/primitives";

export function Destination({
  title,
  description,
  stateTitle,
  stateDescription,
}: {
  title: string;
  description: string;
  stateTitle: string;
  stateDescription: string;
}) {
  const { theme } = useUnistyles();

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.semantic.color.canvas }}
    >
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <DestinationTopBar />
        <View style={styles.heading}>
          <AppText text={title} accessibilityRole="header" variant="title" />
          <AppText text={description} subdued />
        </View>
        <Panel>
          <AppText
            text={stateTitle}
            accessibilityRole="header"
            variant="section"
          />
          <AppText text={stateDescription} subdued />
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

export function DestinationTopBar() {
  return (
    <View style={styles.topBar}>
      <CairnLogo />
      <Link href="/account" asChild>
        <Action accessibilityRole="link" label="Account" />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create(({ semantic: { color, space } }) => ({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.step24, gap: space.step24 },
  topBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.step12,
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { gap: space.step8 },
}));
