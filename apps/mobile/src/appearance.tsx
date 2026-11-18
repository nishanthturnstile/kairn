import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { Appearance } from "react-native";
import { UnistylesRuntime } from "react-native-unistyles";
import {
  type AppearancePreference,
  initialAppearance,
  resolveAppearance,
  saveAppearance,
} from "./theme";

const AppearanceContext = createContext<{
  preference: AppearancePreference;
  selectAppearance: (preference: AppearancePreference) => void;
}>({
  preference: initialAppearance,
  selectAppearance: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(initialAppearance);

  useLayoutEffect(() => {
    const applyTheme = (
      scheme: ReturnType<typeof Appearance.getColorScheme>,
    ) => {
      const theme = resolveAppearance(preference, scheme);
      if (UnistylesRuntime.themeName !== theme)
        UnistylesRuntime.setTheme(theme);
    };
    const subscription = Appearance.addChangeListener(({ colorScheme }) =>
      applyTheme(colorScheme),
    );
    // Outdoor uses light native system controls with its own opaque app palette.
    Appearance.setColorScheme(
      preference === "system"
        ? "auto"
        : preference === "dark"
          ? "dark"
          : "light",
    );
    applyTheme(Appearance.getColorScheme());
    return () => subscription.remove();
  }, [preference]);

  return (
    <AppearanceContext.Provider
      value={{
        preference,
        selectAppearance(next) {
          setPreference(next);
          saveAppearance(next);
        },
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearancePreference() {
  return useContext(AppearanceContext);
}
