import { describe, expect, it } from "vite-plus/test";
import {
  resolveAuthOrigin,
  sessionStoragePrefix,
} from "../apps/mobile/src/auth-origin";
import { parseWorkerEnvironment } from "../packages/backend/src";

describe("native auth environments", () => {
  it("normalizes equivalent origins and separates credentials by scheme, host and port", () => {
    const production = resolveAuthOrigin("https://KAIRN.example:443/", false);
    expect(production).toBe("https://kairn.example");
    const origins = [
      production,
      resolveAuthOrigin("https://staging.kairn.example", false),
      resolveAuthOrigin("https://kairn.example:8443", false),
      resolveAuthOrigin("http://127.0.0.1:58080", true),
    ];
    const prefixes = origins.map((origin) =>
      sessionStoragePrefix(origin ?? ""),
    );
    expect(new Set(prefixes).size).toBe(4);
    expect(prefixes.every((prefix) => /^[a-z0-9_]+$/.test(prefix))).toBe(true);
    for (const origin of [
      "http://127.0.0.1:58080",
      "https://kairn.example/path",
      "https://name@kairn.example",
      "https://kairn.example:99999",
    ])
      expect(resolveAuthOrigin(origin, false)).toBeUndefined();
  });
});

describe("identity worker configuration", () => {
  const DATABASE_URL = "postgresql://runtime@127.0.0.1/kairn";

  it("requires mail, journal and recovery epoch configuration in production", () => {
    const production = {
      DATABASE_URL,
      NODE_ENV: "production",
      SMTP_URL: "smtps://smtp.kairn.invalid",
      AUTH_FROM_EMAIL: "accounts@kairn.invalid",
      AUTH_MAIL_KEY: "a".repeat(64),
      AUTH_JOURNAL_URL: "https://journal.kairn.invalid/",
      AUTH_JOURNAL_CREDENTIAL: "fixture-journal-credential",
    };
    expect(() =>
      parseWorkerEnvironment({ DATABASE_URL, NODE_ENV: "production" }),
    ).toThrow();
    expect(parseWorkerEnvironment({ DATABASE_URL }).NODE_ENV).toBe(
      "development",
    );
    expect(() => parseWorkerEnvironment(production)).toThrow(
      "AUTH_RECOVERY_EPOCH",
    );
    const epoch = "synthetic-test-recovery-epoch-0001";
    expect(
      parseWorkerEnvironment({ ...production, AUTH_RECOVERY_EPOCH: epoch }),
    ).toMatchObject({ NODE_ENV: "production", AUTH_RECOVERY_EPOCH: epoch });
  });
});
