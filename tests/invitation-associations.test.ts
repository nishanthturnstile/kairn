import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../apps/server/src/app";
import {
  androidAssociationPath,
  appleAssociationPath,
  invitationAssociations,
} from "../apps/server/src/http/invitation-associations";

const origin = "https://staging.kairn.invalid";
const fingerprint = Array(32).fill("ab").join(":");
const settings = {
  KAIRN_INVITATION_APP_LINKS_VARIANT: "staging",
  KAIRN_INVITATION_IOS_APP_ID_PREFIX: "ABCDEF1234",
  KAIRN_INVITATION_ANDROID_SHA256: fingerprint,
};

function application(environment: NodeJS.ProcessEnv) {
  return createApp({
    authHandler: async () => new Response(null, { status: 503 }),
    checkReadiness: async () => {},
    nativeAssociations: invitationAssociations(environment, origin),
  });
}

describe("invitation app associations", () => {
  it("serves only the configured app identifiers on the canonical host without a session", async () => {
    const app = application(settings);
    const apple = await app.request(origin + appleAssociationPath);
    expect(apple.status).toBe(200);
    expect(apple.headers.get("Content-Type")).toContain("application/json");
    expect(apple.headers.get("Location")).toBeNull();
    expect(await apple.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["ABCDEF1234.dev.kairn.app.staging"],
            components: [{ "/": "/journey-invitations" }],
          },
        ],
      },
    });
    const android = await app.request(origin + androidAssociationPath);
    expect(android.status).toBe(200);
    expect(await android.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "dev.kairn.app.staging",
          sha256_cert_fingerprints: [fingerprint.toUpperCase()],
        },
      },
    ]);
    const alternate = await app.request(
      `https://other.kairn.invalid${appleAssociationPath}`,
    );
    expect(alternate.status).toBe(404);
    expect(alternate.headers.get("Cache-Control")).toBe("no-store");
  });

  it("defaults to no association and supports releasing each platform independently", async () => {
    const disabled = application({});
    for (const file of [appleAssociationPath, androidAssociationPath])
      expect((await disabled.request(origin + file)).status).toBe(404);
    const appleOnly = application({
      ...settings,
      KAIRN_INVITATION_ANDROID_SHA256: undefined,
    });
    expect(
      (await appleOnly.request(origin + appleAssociationPath)).status,
    ).toBe(200);
    expect(
      (await appleOnly.request(origin + androidAssociationPath)).status,
    ).toBe(404);
  });

  it("rejects inconsistent release settings", () => {
    for (const environment of [
      { KAIRN_INVITATION_APP_LINKS_VARIANT: "staging" },
      { ...settings, KAIRN_INVITATION_APP_LINKS_VARIANT: "development" },
      { ...settings, KAIRN_INVITATION_IOS_APP_ID_PREFIX: "bad-prefix" },
      {
        ...settings,
        KAIRN_INVITATION_ANDROID_SHA256: `${fingerprint},invalid`,
      },
    ])
      expect(() => invitationAssociations(environment, origin)).toThrow();
    expect(() =>
      invitationAssociations(settings, "http://staging.kairn.invalid"),
    ).toThrow();
    expect(() =>
      invitationAssociations(settings, "https://staging.kairn.invalid:3443"),
    ).toThrow();
  });
});
