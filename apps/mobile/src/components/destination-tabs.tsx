import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useState } from "react";
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AppText, focusOutline, touchTarget } from "./fold/primitives";

export const destinationIcons: Record<string, ImageSourcePropType> = {
  dashboard: require("../../assets/icons/dashboard.png"),
  journeys: require("../../assets/icons/book-open.png"),
  discover: require("../../assets/icons/compass.png"),
  saved: require("../../assets/icons/bookmark.png"),
};

export function DestinationTabs({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.5;
  const rows =
    fontScale >= 2.6
      ? state.routes.map((route) => [route])
      : stacked
        ? [state.routes.slice(0, 2), state.routes.slice(2)]
        : [state.routes];

  return (
    <View
      role="tablist"
      style={styles.bar(insets.left, insets.right, insets.bottom)}
    >
      {rows
        .filter((row) => row.length > 0)
        .map((row) => (
          <View key={row[0].key} style={styles.tabRow}>
            {row.map((route) => {
              const selected = state.routes[state.index]?.key === route.key;
              const { options } = descriptors[route.key];
              return (
                <DestinationTab
                  key={route.key}
                  label={options.title ?? route.name}
                  icon={destinationIcons[route.name]}
                  selected={selected}
                  stacked={stacked}
                  onPress={() => {
                    const event = emitter.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!selected && !event.defaultPrevented)
                      navigateToTab(route.key);
                  }}
                  onLongPress={() => {
                    emitter.emit({ type: "tabLongPress", target: route.key });
                  }}
                />
              );
            })}
          </View>
        ))}
    </View>
  );
}

export function DestinationTab({
  label,
  icon,
  selected,
  stacked,
  disabled = false,
  onPress,
  onLongPress,
}: {
  label: string;
  icon?: ImageSourcePropType;
  disabled?: boolean;
  selected: boolean;
  stacked: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.tab,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      {!stacked && icon && (
        <Image
          accessible={false}
          source={icon}
          style={[styles.icon, selected && styles.selectedIcon]}
        />
      )}
      <AppText
        text={label}
        variant="caption"
        style={[
          styles.label,
          stacked && styles.stackedLabel,
          selected && styles.selectedLabel,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, icon, radius, space } }) => ({
    bar: (left: number, right: number, bottom: number) => ({
      backgroundColor: color.surface,
      borderTopColor: color.boundary,
      borderTopWidth: border.control,
      gap: space.step8,
      paddingTop: space.step8,
      paddingBottom: bottom + space.step8,
      paddingLeft: left + space.step12,
      paddingRight: right + space.step12,
    }),
    tabRow: { flexDirection: "row", gap: space.step8 },
    tab: {
      flex: 1,
      minWidth: touchTarget,
      minHeight: touchTarget,
      justifyContent: "center",
      alignItems: "center",
      gap: space.step4,
      paddingVertical: space.step4,
      paddingHorizontal: space.step4,
      borderWidth: border.control,
      borderRadius: radius.control,
      borderColor: color.surface,
    },
    pressed: {
      backgroundColor: color.actionWash,
      borderColor: color.information,
    },
    disabled: {
      borderStyle: "dashed",
      borderColor: color.divider,
      backgroundColor: color.canvas,
    },
    selected: { backgroundColor: color.actionWash, borderColor: color.action },
    focused: { ...focusOutline(color.focus) },
    label: { color: color.secondaryText, textAlign: "center" },
    stackedLabel: { flexShrink: 1 },
    selectedLabel: { color: color.action },
    icon: {
      width: icon.size,
      height: icon.size,
      tintColor: color.secondaryText,
    },
    selectedIcon: { tintColor: color.action },
  }),
);
