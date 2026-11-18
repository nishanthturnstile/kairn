import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { publicEnvironment } from "../env";

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
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>{publicEnvironment.appName}</Text>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.stateTitle}>
            {stateTitle}
          </Text>
          <Text style={styles.description}>{stateDescription}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(({ colors, spacing, typeScale }) => ({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.large, gap: spacing.large },
  brand: { fontSize: typeScale.body, fontWeight: "700", color: colors.accent },
  heading: {
    gap: spacing.small,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.large,
  },
  title: {
    fontSize: typeScale.title,
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -1,
  },
  description: {
    fontSize: typeScale.body,
    color: colors.subdued,
    lineHeight: typeScale.section,
  },
  panel: {
    gap: spacing.small,
    padding: spacing.medium,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.paper,
  },
  stateTitle: {
    fontSize: typeScale.body,
    fontWeight: "700",
    color: colors.ink,
  },
}));
