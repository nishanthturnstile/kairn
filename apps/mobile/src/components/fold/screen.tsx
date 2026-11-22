import type { ComponentRef, ReactNode, Ref } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

export function FoldScreen({
  children,
  top = false,
  safeBottom = false,
  scrollRef,
  density = "standard",
}: {
  children: ReactNode;
  density?: "standard" | "compact" | "catalog";
  top?: boolean;
  safeBottom?: boolean;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}) {
  return (
    <SafeAreaView
      edges={[
        "left",
        "right",
        ...(top ? (["top"] as const) : []),
        ...(safeBottom ? (["bottom"] as const) : []),
      ]}
      style={styles.screen}
    >
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior={top ? "never" : "automatic"}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          density !== "standard" && styles.compact,
          density === "catalog" && styles.catalog,
        ]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(({ semantic: { color, space } }) => ({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.step24, gap: space.step16 },
  compact: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    padding: space.step16,
  },
  catalog: { gap: space.step12 },
}));
