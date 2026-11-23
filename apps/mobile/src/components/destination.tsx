import { Link } from "expo-router";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CairnLogo } from "./cairn-logo";
import { Action } from "./fold/primitives";

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

const styles = StyleSheet.create(({ semantic: { space } }) => ({
  topBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.step12,
    alignItems: "center",
    justifyContent: "space-between",
  },
}));
