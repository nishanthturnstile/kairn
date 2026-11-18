import { parsePublicEnvironment } from "@kairn/shared";

export const publicEnvironment = parsePublicEnvironment({
  appName: process.env.EXPO_PUBLIC_APP_NAME,
});
