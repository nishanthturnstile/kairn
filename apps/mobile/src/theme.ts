import { appTheme } from "@kairn/design-tokens";
import { StyleSheet } from "react-native-unistyles";

const light = appTheme("light");
const dark = appTheme("dark");
const outdoor = appTheme("outdoor");
const breakpoints = { compact: 0, wide: 600 };

declare module "react-native-unistyles" {
  export interface UnistylesThemes {
    field: typeof light;
    light: typeof light;
    dark: typeof dark;
    outdoor: typeof outdoor;
  }

  export interface UnistylesBreakpoints
    extends Record<keyof typeof breakpoints, number> {}
}

StyleSheet.configure({
  themes: { field: light, light, dark, outdoor },
  breakpoints,
  settings: { initialTheme: "field" },
});
