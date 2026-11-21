import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AppText } from "../ui";

export function JourneyPersonMark({ name }: { name?: string }) {
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
      style={peopleStyles.mark}
    >
      <AppText
        text={initials || "@"}
        variant="caption"
        allowFontScaling={false}
        style={peopleStyles.accent}
      />
    </View>
  );
}

export const peopleStyles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    intro: {
      backgroundColor: color.actionWash,
      borderRadius: radius.card,
      padding: space.step16,
      gap: space.step12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.step8,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: space.step4,
    },
    mark: {
      width: space.step32,
      height: space.step32,
      borderRadius: space.step16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: color.actionWash,
    },
    accent: { color: color.action },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: space.step8,
    },
    actionCell: { flexGrow: 1 },
    rowDivider: {
      borderTopColor: color.boundary,
      borderTopWidth: border.control,
      paddingTop: space.step12,
    },
    list: { gap: space.step12 },
    invitation: {
      backgroundColor: color.canvas,
      borderRadius: radius.control,
      padding: space.step12,
      gap: space.step8,
    },
    tag: {
      alignSelf: "flex-start",
      backgroundColor: color.actionWash,
      borderRadius: radius.control,
      paddingHorizontal: space.step8,
      paddingVertical: space.step4,
    },
    error: { color: color.error },
  }),
);
