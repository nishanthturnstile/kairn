import {
  type ComponentRef,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  type Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { publicEnvironment } from "../env";
import { FoldGlyph } from "./fold/glyph";
import { AppText } from "./fold/primitives";

export function AccountEntry({
  children,
  endAction,
  scrollRef,
}: {
  children: ReactNode;
  endAction?: ReactNode;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}) {
  const {
    theme: {
      semantic: { color },
    },
  } = useUnistyles();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <View style={styles.mark}>
                <FoldGlyph color={color.ink} />
              </View>
              <AppText
                text={publicEnvironment.appName}
                variant="section"
                maxFontSizeMultiplier={1.35}
              />
            </View>
            {endAction}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AccountEntryHeading({
  title,
  detail,
  accessibilityLabel,
}: {
  title: string;
  detail?: string;
  accessibilityLabel?: string;
}) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const { fontScale } = useWindowDimensions();

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new heading needs accessibility focus even when it reuses the same view.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (heading.current)
        AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, [title]);

  return (
    <View style={styles.intro}>
      <AppText
        ref={heading}
        text={title}
        variant={fontScale >= 1.8 ? "section" : "title"}
        accessibilityRole="header"
        accessibilityLabel={accessibilityLabel}
      />
      {detail && <AppText text={detail} subdued />}
    </View>
  );
}

const styles = StyleSheet.create(({ semantic: { border, color, space } }) => ({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: {
    paddingHorizontal: space.step16,
    paddingBottom: space.step24,
    alignItems: "center",
  },
  content: { width: "100%", maxWidth: 480, gap: space.step16 },
  header: {
    minHeight: 52,
    paddingVertical: space.step4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: space.step8,
    borderBottomWidth: border.control,
    borderBottomColor: color.divider,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.step8,
    flexShrink: 1,
  },
  mark: {
    width: 26,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ scale: 1.4 }],
  },
  intro: { gap: space.step4 },
}));
