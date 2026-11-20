import { Tabs } from "expo-router/js-tabs";
import { View } from "react-native";
import { DestinationTabs } from "../../components/destination-tabs";
import { journeyStyles } from "../../components/journeys/states";
import { useMobileSession } from "../../mobile-session";
import { useWorkspace, WorkspaceWaiting } from "../../workspace";

export default function TabLayout() {
  const { state, scope } = useMobileSession();
  const { progress } = useWorkspace();
  const settled = progress.data && progress.data.state !== "pending";
  const canShow = state === "verified" && settled && !progress.isError;
  return (
    <>
      {scope && settled && (
        <View
          key={scope.accountId}
          accessibilityElementsHidden={!canShow}
          importantForAccessibility={canShow ? "auto" : "no-hide-descendants"}
          style={canShow ? journeyStyles.screen : journeyStyles.hidden}
        >
          <Tabs
            screenOptions={{ headerShown: false }}
            tabBar={(props) => <DestinationTabs {...props} />}
          >
            <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
            <Tabs.Screen name="journeys" options={{ title: "Journeys" }} />
            <Tabs.Screen name="discover" options={{ title: "Discover" }} />
            <Tabs.Screen name="saved" options={{ title: "Saved" }} />
          </Tabs>
        </View>
      )}
      {!canShow && <WorkspaceWaiting />}
    </>
  );
}
