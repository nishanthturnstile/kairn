import { Stack } from "expo-router";
import { publicEnvironment } from "../env";

export default function RootLayout() {
  return <Stack screenOptions={{ title: publicEnvironment.appName }} />;
}
