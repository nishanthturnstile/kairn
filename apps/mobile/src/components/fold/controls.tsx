import { type ComponentRef, type ReactNode, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  type Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FoldGlyph } from "./glyph";
import { useReduceMotionPreference } from "./motion";
import { Action, AppText, focusOutline, touchTarget } from "./primitives";

export function Heading({ text }: { text: string }) {
  return <AppText accessibilityRole="header" variant="section" text={text} />;
}
export function Disclosure({
  label,
  detail,
  value,
  expanded,
  ref,
  onPress,
}: {
  label: string;
  detail?: string;
  value?: string;
  expanded?: boolean;
  ref?: import("react").Ref<ComponentRef<typeof Pressable>>;
  onPress: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      ref={ref}
      accessibilityLabel={value === undefined ? label : `${label}, ${value}`}
      accessibilityState={{ expanded }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <View
        style={[
          styles.copy,
          value !== undefined && fontScale < 1.5 && styles.valueRow,
        ]}
      >
        <AppText text={label} variant="label" style={styles.rowLabel} />
        {detail && <AppText text={detail} variant="caption" subdued />}
        {value !== undefined && (
          <AppText
            text={value}
            subdued
            style={fontScale < 1.5 && styles.value}
          />
        )}
      </View>
      <View style={styles.chevron} />
    </Pressable>
  );
}
export function Choice({
  label,
  kind = "radio",
  checked,
  busy,
  disabled = false,
  onChange,
}: {
  label: string;
  kind?: "radio" | "checkbox" | "switch";
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const {
    theme: {
      semantic: { color },
    },
  } = useUnistyles();
  const [focused, setFocused] = useState(false);
  const reduced = useReduceMotionPreference();
  if (kind === "switch")
    return (
      <View style={[styles.choice, focused && styles.focused]}>
        <Pressable
          accessible={false}
          focusable={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          disabled={disabled}
          onPress={onChange}
          style={({ pressed }) => [
            styles.switchLabel,
            pressed && styles.pressed,
          ]}
        >
          <AppText text={label} subdued={disabled} />
        </Pressable>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityState={{ checked, disabled, busy }}
          disabled={disabled}
          value={checked}
          onValueChange={onChange}
          trackColor={{ true: color.action }}
          thumbColor={
            Platform.OS === "android" && checked ? color.onAction : undefined
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        />
      </View>
    );
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled, busy }}
      disabled={disabled}
      onPress={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.choice,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.indicator,
              pressed && !reduced && styles.compressed,
              kind === "radio" && styles.round,
              checked && styles.checked,
            ]}
          >
            {checked &&
              (kind === "radio" ? (
                <View style={styles.dot} />
              ) : (
                <FoldGlyph kind="check" color={color.onAction} />
              ))}
          </View>
          <AppText style={styles.copy} text={label} subdued={disabled} />
        </>
      )}
    </Pressable>
  );
}

export function FoldSheet({
  title,
  visible,
  onClose,
  children,
  onDismiss,
  closeLabel = "Close",
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  onDismiss?: () => void;
  closeLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotionPreference();
  const heading = useRef<ComponentRef<typeof Text>>(null);
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      onShow={() => {
        if (heading.current)
          AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
      }}
    >
      <View style={[styles.scrim, { paddingTop: insets.top + 16 }]}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              paddingLeft: Math.max(insets.left, 16),
              paddingRight: Math.max(insets.right, 16),
            },
          ]}
        >
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.group}
          >
            <AppText
              ref={heading}
              accessibilityRole="header"
              variant="section"
              text={title}
            />
            {children}
            <Action label={closeLabel} onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Select<T extends string>({
  label,
  values,
  value,
  onChange,
  triggerRef,
}: {
  triggerRef?: import("react").RefObject<ComponentRef<typeof Pressable> | null>;
  label: string;
  values: readonly T[];
  value: T;
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const localTrigger = useRef<ComponentRef<typeof Pressable>>(null);
  const trigger = triggerRef ?? localTrigger;
  function restore() {
    if (trigger.current)
      AccessibilityInfo.sendAccessibilityEvent(trigger.current, "focus");
  }
  function close() {
    setOpen(false);
    if (Platform.OS === "android") requestAnimationFrame(restore);
  }
  return (
    <View>
      <Disclosure
        ref={trigger}
        label={label}
        value={value}
        expanded={open}
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
      />
      <FoldSheet
        title={label}
        visible={open}
        onClose={close}
        onDismiss={restore}
      >
        <View accessibilityRole="radiogroup">
          {values.map((option) => (
            <Choice
              key={option}
              label={option}
              checked={option === value}
              onChange={() => {
                onChange(option);
                close();
              }}
            />
          ))}
        </View>
      </FoldSheet>
    </View>
  );
}

export const styles = StyleSheet.create(
  ({ semantic: { color, space, radius, border } }) => ({
    group: { gap: space.step12 },
    block: { gap: space.step8 },
    inline: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.step8,
      alignItems: "center",
    },
    focused: focusOutline(color.focus),
    valueRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.step8,
    },
    rowLabel: { flexShrink: 1 },
    value: { maxWidth: "55%", flexShrink: 1, textAlign: "right" },
    compressed: { transform: [{ scale: 0.94 }] },
    switchLabel: { flex: 1, minHeight: touchTarget, justifyContent: "center" },
    copy: { flex: 1, minWidth: 0 },
    row: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: space.step12,
      paddingVertical: space.step8,
      borderBottomColor: color.divider,
      borderBottomWidth: border.control,
    },
    chevron: {
      width: 8,
      height: 8,
      marginEnd: 4,
      borderTopWidth: 2,
      borderRightWidth: 2,
      borderColor: color.secondaryText,
      transform: [{ rotate: "45deg" }],
    },
    pressed: { backgroundColor: color.actionWash },
    choice: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: space.step12,
      paddingVertical: space.step4,
    },
    indicator: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: color.boundary,
      alignItems: "center",
      justifyContent: "center",
    },
    round: { borderRadius: 12 },
    checked: { backgroundColor: color.action, borderColor: color.action },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: color.onAction,
    },
    scrim: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.46)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: color.surface,
      borderTopLeftRadius: radius.card,
      borderTopRightRadius: radius.card,
      padding: space.step16,
      maxHeight: "100%",
      width: "100%",
      maxWidth: 620,
      alignSelf: "center",
    },
  }),
);
