export const appleAssociationPath = "/.well-known/apple-app-site-association";
export const androidAssociationPath = "/.well-known/assetlinks.json";

export function invitationAssociations(
  environment: NodeJS.ProcessEnv,
  origin: string,
) {
  const variant = environment.KAIRN_INVITATION_APP_LINKS_VARIANT?.trim();
  const prefix = environment.KAIRN_INVITATION_IOS_APP_ID_PREFIX?.trim();
  const android = environment.KAIRN_INVITATION_ANDROID_SHA256?.trim();
  if (!variant && !prefix && !android) return undefined;
  const url = new URL(origin);
  if (
    (variant !== "staging" && variant !== "production") ||
    url.protocol !== "https:" ||
    !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z][a-z\d-]*$/i.test(url.host) ||
    (!prefix && !android)
  )
    throw new Error(
      "Invitation associations need a staging or production variant, an HTTPS domain, and signing metadata.",
    );
  if (prefix && !/^[A-Z0-9]{10}$/.test(prefix))
    throw new Error("Invalid KAIRN_INVITATION_IOS_APP_ID_PREFIX.");
  const fingerprints = android
    ?.split(",")
    .map((value) => value.trim().toUpperCase());
  if (
    fingerprints?.some(
      (value) => !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value),
    )
  )
    throw new Error("Invalid KAIRN_INVITATION_ANDROID_SHA256 fingerprint.");

  const identifier = `dev.kairn.app.${variant}`;
  return {
    host: url.host,
    apple: prefix
      ? {
          applinks: {
            details: [
              {
                appIDs: [`${prefix}.${identifier}`],
                components: [{ "/": "/journey-invitations" }],
              },
            ],
          },
        }
      : undefined,
    android: fingerprints
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: identifier,
              sha256_cert_fingerprints: [...new Set(fingerprints)],
            },
          },
        ]
      : undefined,
  };
}
