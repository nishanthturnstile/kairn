import type { ConfigContext, ExpoConfig } from "expo/config";

export default function configureApp({ config }: ConfigContext): ExpoConfig {
  if (!config.name || !config.slug)
    throw new Error("Set the application name and slug in app.json.");
  const variant = process.env.KAIRN_APP_VARIANT ?? "development";
  if (
    variant !== "development" &&
    variant !== "staging" &&
    variant !== "production"
  )
    throw new Error("Invalid KAIRN_APP_VARIANT.");
  const identifier =
    variant === "development" ? "dev.kairn.app" : `dev.kairn.app.${variant}`;
  return {
    ...config,
    name: config.name,
    slug: config.slug,
    ios: { ...config.ios, bundleIdentifier: identifier },
    android: { ...config.android, package: identifier },
  };
}
