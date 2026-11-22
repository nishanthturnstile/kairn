import { Stack } from "expo-router";
import { useReduceMotionPreference } from "../../../components/fold/motion";

export const unstable_settings = { anchor: "index" };

export default function JourneysLayout() {
  const reduceMotion = useReduceMotionPreference();
  return (
    <Stack
      screenOptions={{
        animation: reduceMotion ? "none" : "default",
        headerBackButtonDisplayMode: "minimal",
        headerBackTitle: "Journeys",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: "" }} />
      <Stack.Screen name="[journeyId]" options={{ title: "" }} />
      <Stack.Screen name="[journeyId]/people" options={{ title: "" }} />
      <Stack.Screen name="[journeyId]/invite" options={{ title: "" }} />
    </Stack>
  );
}
