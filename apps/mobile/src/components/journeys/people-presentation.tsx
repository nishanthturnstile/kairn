import { StyleSheet } from "react-native-unistyles";
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
  }),
);
