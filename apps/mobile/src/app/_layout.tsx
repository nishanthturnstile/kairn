import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { AppearanceProvider } from "../appearance";
import { fonts, useReduceMotionPreference } from "../components/ui";
import { MobileSessionProvider, useMobileSession } from "../mobile-session";
import { WorkspaceProvider } from "../workspace";

export default function RootLayout() {
  return (
    <MobileSessionProvider>
      <AppearanceProvider>
        <WorkspaceProvider>
          <Navigation />
        </WorkspaceProvider>
      </AppearanceProvider>
    </MobileSessionProvider>
  );
}

function Navigation() {
  const { scope } = useMobileSession();
  const { theme, rt } = useUnistyles();
  const { color, fontSize } = theme.semantic;
  const dark = rt.themeName === "dark";
  const reduceMotion = useReduceMotionPreference();

  return (
    <ThemeProvider
      value={{
        dark,
        colors: {
          primary: color.action,
          background: color.canvas,
          card: color.surface,
          text: color.ink,
          border: color.boundary,
          notification: color.error,
        },
        fonts: DefaultTheme.fonts,
      }}
    >
      <Stack
        screenOptions={{
          animation: reduceMotion ? "none" : "default",
          contentStyle: { backgroundColor: color.canvas },
          headerStyle: { backgroundColor: color.surface },
          headerTintColor: color.action,
          headerTitleStyle: {
            ...fonts.label,
            color: color.ink,
            fontSize: fontSize.section,
          },
          headerBackButtonDisplayMode: "minimal",
          statusBarStyle: dark ? "light" : "dark",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="account"
          options={{ title: "Account", headerShown: Boolean(scope) }}
        />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack>
    </ThemeProvider>
  );
}
