import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { AppearanceProvider } from "../appearance";
import { fonts } from "../components/ui";

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AppearanceProvider>
        <Navigation />
      </AppearanceProvider>
    </QueryClientProvider>
  );
}

function Navigation() {
  const { theme, rt } = useUnistyles();
  const { color, fontSize } = theme.semantic;
  const dark = rt.themeName === "dark";
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        receivedChange = true;
        setReduceMotion(enabled);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (active && !receivedChange) setReduceMotion(enabled);
      },
      () => {},
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

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
        <Stack.Screen name="account" options={{ title: "Account" }} />
      </Stack>
    </ThemeProvider>
  );
}
