import { themes } from "@kairn/design-tokens";
import { getLoadedFonts } from "expo-font";
import {
  type ComponentRef,
  createContext,
  type ReactNode,
  type Ref,
  useContext,
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

import { FoldGlyph } from "./glyph";
import { useReduceMotionPreference } from "./motion";

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

export const focusOutline = (color: string) => ({
  outlineColor: color,
  outlineOffset: 2,
  outlineWidth: 2,
});

export const HeadingFontReady = createContext(false);

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
  ref?: Ref<ComponentRef<typeof Text>>;
  text: string;
  variant?: TextVariant;
  subdued?: boolean;
}) {
  const headingFont = useContext(HeadingFontReady);
  return (
    <Text
      {...props}
      dynamicTypeRamp={typeRamps[variant]}
      style={[
        styles[variant],
        headingFont &&
          (variant === "section" || variant === "title") && {
            fontFamily: "FoldHeading",
            fontWeight: "normal",
          },
        subdued && styles.subdued,
        style,
      ]}
    >
      {text}
    </Text>
  );
}

export function Panel({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.panel, compact && styles.compactPanel]}>
      {children}
    </View>
  );
}

export function Action({
  label,
  variant = "secondary",
  disabled = false,
  accessibilityState,
  feedback = accessibilityState?.busy ? "pending" : "idle",
  size = "standard",
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  size?: "compact" | "standard" | "capture";
  feedback?: "idle" | "pending" | "success";
  variant?: "primary" | "secondary" | "danger" | "text";
  ref?: Ref<ComponentRef<typeof Pressable>>;
}) {
  const [focused, setFocused] = useState(false);
  const { theme } = useUnistyles();
  const reduced = useReduceMotionPreference();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...props}
      accessibilityState={{
        ...accessibilityState,
        busy: feedback === "pending" || accessibilityState?.busy,
        disabled,
      }}
      disabled={disabled}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={({ pressed }) => [
        styles.action,
        size === "capture" && { minHeight: theme.semantic.target.field },
        size === "compact" && { paddingHorizontal: theme.semantic.space.step8 },
        styles[variant],
        pressed && styles.pressed,
        disabled && variant !== "text" && styles.disabled,
        focused && styles.focused,
      ]}
    >
      {({ pressed }) => (
        <View style={styles.actionContent}>
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
          {variant === "primary" && (
            <View
              accessible={false}
              style={[
                styles.key,
                pressed &&
                  !disabled &&
                  !reduced && { transform: [{ scale: 0.9 }] },
              ]}
            >
              <FoldGlyph
                kind={
                  feedback === "pending"
                    ? "pleats"
                    : feedback === "success"
                      ? "check"
                      : "arrow"
                }
                moving={feedback === "pending"}
                color={theme.semantic.color.keyInk}
              />
            </View>
          )}
        </View>
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
    props.readOnly && styles.readOnlySurface,
    props.editable === false && styles.unavailableSurface,
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
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={[
        styles.input,
        suffix ? styles.inlineInput : inputSurface,
        props.editable === false && styles.subdued,
        props.style,
      ]}
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
    compactPanel: { padding: space.step8, gap: space.step4 },
    panel: {
      gap: space.step8,
      padding: space.step12,
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
    actionContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: space.step8,
    },
    key: {
      width: 24,
      height: 24,
      borderRadius: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: color.key,
    },
    actionLabel: { flexShrink: 1, textAlign: "center" },
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
    focused: { ...focusOutline(color.focus) },
    invalid: { borderColor: color.error },
    field: { gap: space.step4 },
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
    readOnlySurface: { backgroundColor: color.canvas, borderStyle: "dashed" },
    unavailableSurface: {
      backgroundColor: color.canvas,
      borderColor: color.divider,
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
