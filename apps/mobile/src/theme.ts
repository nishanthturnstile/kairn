import { appTheme, type Appearance as ThemeName } from "@kairn/design-tokens";
import { SQLiteStorage } from "expo-sqlite/kv-store";
import { Appearance } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const light = appTheme("light");
const dark = appTheme("dark");
const outdoor = appTheme("outdoor");
const breakpoints = { compact: 0, wide: 600 };
const preferences = new SQLiteStorage("kairn-settings.db");
const appearanceKey = "appearance";

export type AppearancePreference = "system" | ThemeName;

function readAppearance(): AppearancePreference {
  try {
    const stored = preferences.getItemSync(appearanceKey);
    if (stored === "light" || stored === "dark" || stored === "outdoor") {
      return stored;
    }
  } catch {
    // A device storage error should still allow the app to open.
  }
  return "system";
}

export function saveAppearance(preference: AppearancePreference) {
  try {
    preferences.setItemSync(appearanceKey, preference);
  } catch {
    // The selected appearance still applies for the current session.
  }
}

export const initialAppearance = readAppearance();

export function resolveAppearance(
  preference: AppearancePreference,
  scheme: ReturnType<typeof Appearance.getColorScheme>,
): ThemeName {
  return preference === "system"
    ? scheme === "dark"
      ? "dark"
      : "light"
    : preference;
}

declare module "react-native-unistyles" {
  export interface UnistylesThemes {
    light: typeof light;
    dark: typeof dark;
    outdoor: typeof outdoor;
  }

  export interface UnistylesBreakpoints
    extends Record<keyof typeof breakpoints, number> {}
}

StyleSheet.configure({
  themes: { light, dark, outdoor },
  breakpoints,
  settings: {
    initialTheme: () =>
      resolveAppearance(initialAppearance, Appearance.getColorScheme()),
  },
});
