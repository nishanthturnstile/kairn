import { Tabs } from "expo-router";
import { useUnistyles } from "react-native-unistyles";

export default function TabLayout() {
  const { theme } = useUnistyles();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.subdued,
        tabBarActiveBackgroundColor: theme.colors.accentWash,
        tabBarStyle: {
          backgroundColor: theme.colors.paper,
          borderTopColor: theme.colors.line,
        },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: {
          fontSize: theme.typeScale.caption,
          fontWeight: "600",
        },
        tabBarIconStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="journeys" options={{ title: "Journeys" }} />
      <Tabs.Screen name="discover" options={{ title: "Discover" }} />
      <Tabs.Screen name="saved" options={{ title: "Saved" }} />
    </Tabs>
  );
}
