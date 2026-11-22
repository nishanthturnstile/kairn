import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { styles as controls } from "./controls";
import { AppText, touchTarget } from "./primitives";

export function Avatar({
  name,
  large = false,
}: {
  name?: string;
  large?: boolean;
}) {
  const initials = name
    ?.trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase())
    .join("");
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, large && styles.largeMark]}
    >
      <AppText
        text={initials || "@"}
        variant={large ? "label" : "caption"}
        allowFontScaling={false}
        style={styles.accent}
      />
    </View>
  );
}

export function Badge({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <AppText
      variant="caption"
      text={text}
      style={[styles.tag, error && styles.error]}
    />
  );
}
export function MemberDisclosure({
  name,
  memberRole,
  detail,
  large,
}: {
  name: string;
  memberRole: string;
  detail: string;
  large?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${memberRole}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.member,
          pressed && controls.pressed,
          focused && controls.focused,
        ]}
      >
        <Avatar name={name} large={large} />
        <View style={styles.identity}>
          <AppText text={name} variant="label" />
          <Badge text={memberRole} />
        </View>
        <View
          style={[
            controls.chevron,
            expanded && { transform: [{ rotate: "135deg" }] },
          ]}
        />
      </Pressable>
      {expanded && <AppText text={detail} subdued />}
    </View>
  );
}
const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  member: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.step12,
    paddingVertical: space.step8,
  },
  identity: { flex: 1, alignItems: "flex-start", gap: space.step4 },
  mark: {
    width: space.step32,
    height: space.step32,
    borderRadius: space.step16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.actionWash,
  },
  accent: { color: color.action },
  largeMark: {
    width: space.step40,
    height: space.step40,
    borderRadius: space.step24,
  },
  tag: {
    alignSelf: "flex-start",
    backgroundColor: color.actionWash,
    borderRadius: radius.tag,
    paddingHorizontal: space.step8,
    paddingVertical: space.step4,
  },
  error: { color: color.error },
}));
