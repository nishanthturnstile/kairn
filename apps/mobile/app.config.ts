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
  const enableLinks = process.env.KAIRN_ENABLE_INVITATION_APP_LINKS;
  if (enableLinks !== undefined && enableLinks !== "0" && enableLinks !== "1")
    throw new Error("Expected KAIRN_ENABLE_INVITATION_APP_LINKS to be 0 or 1.");
  let invitationHost: string | undefined;
  if (enableLinks === "1") {
    const configured = process.env.EXPO_PUBLIC_API_ORIGIN;
    const origin = configured && URL.parse(configured);
    if (
      variant === "development" ||
      !origin ||
      origin.protocol !== "https:" ||
      origin.origin !== configured?.replace(/\/$/, "") ||
      !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z][a-z\d-]*$/i.test(origin.host)
    )
      throw new Error(
        "Invitation app links need a staging or production variant and a canonical HTTPS API domain.",
      );
    invitationHost = origin.hostname;
  }
  return {
    ...config,
    name: config.name,
    slug: config.slug,
    ios: {
      ...config.ios,
      bundleIdentifier: identifier,
      ...(invitationHost && {
        associatedDomains: [
          ...(config.ios?.associatedDomains ?? []),
          `applinks:${invitationHost}`,
        ],
      }),
    },
    android: {
      ...config.android,
      package: identifier,
      ...(invitationHost && {
        intentFilters: [
          ...(config.android?.intentFilters ?? []),
          {
            action: "VIEW",
            autoVerify: true,
            category: ["BROWSABLE", "DEFAULT"],
            data: {
              scheme: "https",
              host: invitationHost,
              path: "/journey-invitations",
            },
          },
        ],
      }),
    },
  };
}
