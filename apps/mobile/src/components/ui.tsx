import { themes } from "@kairn/design-tokens";
import { getLoadedFonts } from "expo-font";
import {
  type ComponentRef,
  type ReactNode,
  type Ref,
  useEffect,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  type PressableProps,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const { fontWeight, fontSize, lineHeight } = themes.light.semantic;
const loadedFonts = getLoadedFonts();

function font(family: string, weight: NonNullable<TextStyle["fontWeight"]>) {
  return loadedFonts.includes(family)
    ? {
        fontFamily: family,
        // Android's asset lookup adds a suffix for styled faces.
        fontWeight: Platform.OS === "android" ? ("normal" as const) : weight,
      }
    : { fontWeight: weight };
}

export const fonts = {
  body: font("SourceSans3-Regular", `${fontWeight.body}`),
  label: font("SourceSans3-Semibold", `${fontWeight.label}`),
  emphasis: font("SourceSans3-Bold", `${fontWeight.emphasis}`),
};

export const touchTarget = Platform.OS === "android" ? 48 : 44;

export function useReduceMotionPreference() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        changed = true;
        setReduced(enabled);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (active && !changed) setReduced(enabled);
      },
      () => {},
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

export const focusOutline = (color: string) => ({
  outlineColor: color,
  outlineOffset: 2,
  outlineWidth: 2,
});

const typeRamps = {
  title: "largeTitle",
  section: "title2",
  body: "body",
  label: "body",
  caption: "caption1",
} as const;
type TextVariant = keyof typeof typeRamps;

export function AppText({
  text,
  variant = "body",
  subdued,
  style,
  ...props
}: Omit<TextProps, "children"> & {
  text: string;
  variant?: TextVariant;
  subdued?: boolean;
}) {
  return (
    <Text
      {...props}
      dynamicTypeRamp={typeRamps[variant]}
      style={[styles[variant], subdued && styles.subdued, style]}
    >
      {text}
    </Text>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export function Action({
  label,
  variant = "secondary",
  disabled = false,
  accessibilityState,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: "primary" | "secondary" | "danger" | "text";
  ref?: Ref<ComponentRef<typeof Pressable>>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...props}
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.action,
        styles[variant],
        pressed && styles.pressed,
        disabled && variant !== "text" && styles.disabled,
        focused && styles.focused,
      ]}
    >
      {({ pressed }) => (
        <AppText
          text={label}
          variant="label"
          style={[
            styles.actionLabel,
            styles[`${variant}Label`],
            pressed && variant === "primary" && styles.secondaryLabel,
            disabled && styles.subdued,
          ]}
        />
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  labelAction,
  suffix,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  labelAction?: ReactNode;
  suffix?: ReactNode;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const [focused, setFocused] = useState(false);
  const { theme, rt } = useUnistyles();
  const { color } = theme.semantic;

  const inputSurface = [
    styles.inputSurface,
    error && styles.invalid,
    focused && styles.focused,
  ];
  const input = (
    <TextInput
      {...props}
      accessibilityLabel={label}
      accessibilityHint={error ?? props.accessibilityHint}
      keyboardAppearance={rt.themeName === "dark" ? "dark" : "light"}
      placeholderTextColor={props.placeholderTextColor ?? color.secondaryText}
      selectionColor={Platform.OS === "ios" ? color.action : color.actionWash}
      cursorColor={color.action}
      selectionHandleColor={color.action}
      underlineColorAndroid="transparent"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, suffix ? styles.inlineInput : inputSurface]}
    />
  );

  return (
    <View style={styles.field}>
      {labelAction ? (
        <View style={styles.fieldLabelRow}>
          <AppText text={label} variant="label" />
          {labelAction}
        </View>
      ) : (
        <AppText text={label} variant="label" />
      )}
      {suffix ? (
        <View style={[inputSurface, styles.inputRow]}>
          {input}
          {suffix}
        </View>
      ) : (
        input
      )}
      {error && <AppText text={error} style={styles.error} />}
    </View>
  );
}

export type Notice = {
  text: string;
  tone: "info" | "error" | "success" | "warning";
};

export function StatusNotice({ notice }: { notice: Notice | null }) {
  const message = notice?.text;
  useEffect(() => {
    if (Platform.OS === "ios" && message) {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, {
        queue: true,
      });
    }
  }, [message]);

  return (
    <View accessibilityLiveRegion="polite" style={!notice && styles.hidden}>
      {notice && (
        <View style={styles.notice}>
          <AppText text={notice.text} style={styles[notice.tone]} />
        </View>
      )}
    </View>
  );
}

// Keep token destructuring in the parameter so Unistyles tracks live theme changes.
const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    title: {
      ...fonts.emphasis,
      color: color.ink,
      fontSize: fontSize.chapter,
      lineHeight: lineHeight.chapter,
    },
    section: {
      ...fonts.emphasis,
      color: color.ink,
      fontSize: fontSize.section,
      lineHeight: lineHeight.section,
    },
    body: {
      ...fonts.body,
      color: color.ink,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    label: {
      ...fonts.label,
      color: color.ink,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    caption: {
      ...fonts.label,
      color: color.ink,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    subdued: { color: color.secondaryText },
    panel: {
      gap: space.step8,
      padding: space.step16,
      borderWidth: border.control,
      borderColor: color.boundary,
      borderRadius: radius.card,
      backgroundColor: color.surface,
    },
    action: {
      minHeight: touchTarget,
      minWidth: touchTarget,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: border.control,
      borderRadius: radius.control,
      paddingVertical: space.step8,
      paddingHorizontal: space.step16,
    },
    actionLabel: { textAlign: "center" },
    primary: { backgroundColor: color.action, borderColor: color.action },
    primaryLabel: { color: color.onAction },
    secondary: { backgroundColor: color.surface, borderColor: color.boundary },
    secondaryLabel: { color: color.action },
    danger: { backgroundColor: color.surface, borderColor: color.error },
    dangerLabel: { color: color.error },
    text: {
      alignSelf: "flex-start",
      borderColor: "transparent",
      paddingHorizontal: 0,
    },
    textLabel: { color: color.action, textDecorationLine: "underline" },
    pressed: { backgroundColor: color.actionWash },
    disabled: {
      backgroundColor: color.canvas,
      borderColor: color.boundary,
    },
    focused: { ...focusOutline(color.information) },
    invalid: { borderColor: color.error },
    field: { gap: space.step8 },
    fieldLabelRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      columnGap: space.step12,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingRight: space.step4,
    },
    inlineInput: { flex: 1, minWidth: 0 },
    inputSurface: {
      backgroundColor: color.surface,
      borderColor: color.boundary,
      borderWidth: border.control,
      borderRadius: radius.control,
    },
    input: {
      ...fonts.body,
      minHeight: touchTarget,
      fontSize: fontSize.body,
      color: color.ink,
      paddingVertical: space.step8,
      paddingHorizontal: space.step12,
    },
    hidden: { display: "none" },
    notice: {
      backgroundColor: color.surface,
      borderStartWidth: border.control + 2,
      borderStartColor: color.boundary,
      paddingHorizontal: space.step12,
      paddingVertical: space.step8,
    },
    error: { color: color.error },
    info: { color: color.information },
    success: { color: color.success },
    warning: { color: color.warning },
  }),
);
