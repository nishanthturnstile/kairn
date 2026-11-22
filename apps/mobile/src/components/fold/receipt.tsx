import { useFocusEffect } from "expo-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FoldGlyph } from "./glyph";
import { useReduceMotionPreference } from "./motion";
import { AppText, focusOutline, touchTarget } from "./primitives";

type Receipt = { message: string; returnFocus?: () => void };
const ReceiptContext = createContext<((receipt: Receipt) => void) | null>(null);
export function useReceipt() {
  const show = useContext(ReceiptContext);
  if (!show)
    throw new Error(
      "Render ReceiptProvider around the screen that confirms this action.",
    );
  return show;
}

export function ReceiptProvider({ children }: { children: ReactNode }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [focused, setFocused] = useState(false);
  const active = useRef(false);
  const { bottom, left, right } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const {
    theme: {
      semantic: { color, space, motion },
    },
  } = useUnistyles();
  const reduced = useReduceMotionPreference();
  const opacity = useRef(new Animated.Value(1)).current;
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      return () => {
        active.current = false;
        setFocused(false);
        setReceipt(null);
      };
    }, []),
  );
  const show = useCallback((next: Receipt) => {
    if (active.current) setReceipt({ ...next });
  }, []);
  useEffect(() => {
    if (!receipt) return;
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    const entrance = Animated.timing(opacity, {
      toValue: 1,
      duration: motion.selection,
      useNativeDriver: true,
      isInteraction: false,
    });
    entrance.start();
    return () => entrance.stop();
  }, [receipt, reduced, motion.selection, opacity]);
  useEffect(() => {
    if (receipt && Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibilityWithOptions(receipt.message, {
        queue: true,
      });
  }, [receipt]);
  useEffect(() => {
    if (!receipt || focused) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const duration =
      Platform.OS === "android"
        ? AccessibilityInfo.getRecommendedTimeoutMillis(5000).catch(() => 5000)
        : Promise.resolve(5000);
    void duration.then((ms) => {
      if (live) timer = setTimeout(() => setReceipt(null), ms);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [receipt, focused]);
  return (
    <ReceiptContext.Provider value={show}>
      <View style={styles.fill}>
        {children}
        {receipt && (
          <Animated.View
            style={[
              styles.toast,
              {
                bottom: bottom + space.step12,
                left: left + space.step16,
                right: right + space.step16,
                opacity,
              },
              fontScale >= 1.5 && styles.stack,
            ]}
          >
            <View style={styles.message}>
              <View style={styles.key}>
                <FoldGlyph kind="check" color={color.keyInk} />
              </View>
              <AppText
                accessibilityLiveRegion="polite"
                text={receipt.message}
                style={styles.text}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss confirmation"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onPress={() => {
                setReceipt(null);
                setFocused(false);
                if (receipt.returnFocus)
                  requestAnimationFrame(receipt.returnFocus);
              }}
              style={({ pressed }) => [
                styles.dismiss,
                pressed && styles.pressed,
                focused && styles.focused,
              ]}
            >
              <AppText text="Dismiss" variant="label" style={styles.inverse} />
            </Pressable>
          </Animated.View>
        )}
      </View>
    </ReceiptContext.Provider>
  );
}

const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  fill: { flex: 1 },
  toast: {
    position: "absolute",
    backgroundColor: color.ink,
    borderRadius: radius.control,
    flexDirection: "row",
    alignItems: "center",
    gap: space.step8,
    paddingHorizontal: space.step12,
    paddingVertical: space.step4,
  },
  stack: { flexDirection: "column", alignItems: "stretch" },
  message: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.step8,
  },
  key: {
    backgroundColor: color.key,
    borderRadius: radius.tag,
    padding: space.step4,
  },
  text: { flexShrink: 1, color: color.surface },
  inverse: { color: color.surface },
  dismiss: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    alignSelf: "flex-end",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
  focused: { ...focusOutline(color.surface) },
}));
