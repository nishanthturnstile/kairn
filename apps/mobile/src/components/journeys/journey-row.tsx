import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FoldGlyph } from "../fold/glyph";
import { AppText, focusOutline, touchTarget } from "../fold/primitives";

export function JourneyRow({
  title,
  detail,
  featured,
  first = true,
  last = true,
  onPress,
  children,
}: {
  title: string;
  detail: string;
  featured?: boolean;
  first?: boolean;
  last?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.row,
        first && styles.first,
        last && styles.last,
        featured && styles.featured,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <View style={styles.copy}>
        <AppText text={title} variant={featured ? "section" : "label"} />
        {children}
      </View>
      <FoldGlyph kind="arrow" color={theme.semantic.color.secondaryText} />
    </Pressable>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { color, border, radius, space } }) => ({
    row: {
      minHeight: touchTarget,
      backgroundColor: color.surface,
      borderColor: color.boundary,
      borderTopWidth: border.control,
      borderStartWidth: border.control,
      borderEndWidth: border.control,
      paddingVertical: space.step12,
      paddingHorizontal: space.step16,
      flexDirection: "row",
      alignItems: "center",
      gap: space.step12,
    },
    first: {
      borderTopStartRadius: radius.card,
      borderTopEndRadius: radius.card,
    },
    last: {
      borderBottomStartRadius: radius.card,
      borderBottomEndRadius: radius.card,
      borderBottomWidth: border.control,
    },
    featured: { backgroundColor: color.actionWash },
    copy: { flex: 1, minWidth: 0, gap: space.step4 },
    pressed: { backgroundColor: color.canvas },
    focused: { ...focusOutline(color.focus), zIndex: 1 },
  }),
);
