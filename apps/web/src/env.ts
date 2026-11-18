import { parsePublicEnvironment } from "@kairn/shared";

export const publicEnvironment = parsePublicEnvironment({
  appName: import.meta.env.VITE_APP_NAME,
});
