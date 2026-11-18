import { Redirect } from "expo-router";

export default function IndexRoute() {
  if (__DEV__ && process.env.EXPO_PUBLIC_KAIRN_AUTH_FIXTURE === "1")
    return <Redirect href="/auth-check" />;
  const phase = process.env.EXPO_PUBLIC_KAIRN_DEVICE_FIXTURES;
  if (__DEV__ && (phase === "stage" || phase === "resume")) {
    return <Redirect href={{ pathname: "/device-check", params: { phase } }} />;
  }
  return <Redirect href="/journeys" />;
}
