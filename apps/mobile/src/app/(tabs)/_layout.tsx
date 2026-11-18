import { Tabs } from "expo-router/js-tabs";
import { DestinationTabs } from "../../components/destination-tabs";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <DestinationTabs {...props} />}
    >
      <Tabs.Screen name="journeys" options={{ title: "Journeys" }} />
      <Tabs.Screen name="discover" options={{ title: "Discover" }} />
      <Tabs.Screen name="saved" options={{ title: "Saved" }} />
    </Tabs>
  );
}
