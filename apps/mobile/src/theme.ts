import { colors, spacing, typeScale } from "@kairn/design-tokens";
import { StyleSheet } from "react-native-unistyles";

const theme = { colors, spacing, typeScale };
const breakpoints = { compact: 0, wide: 600 };

declare module "react-native-unistyles" {
  export interface UnistylesThemes {
    field: typeof theme;
  }

  export interface UnistylesBreakpoints
    extends Record<keyof typeof breakpoints, number> {}
}

StyleSheet.configure({
  themes: { field: theme },
  breakpoints,
  settings: { initialTheme: "field" },
});
