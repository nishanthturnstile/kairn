import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../apps/server/src/app";
import {
  parseServerEnvironment,
  parseWorkerEnvironment,
} from "../packages/backend/src/index";
import { parsePublicEnvironment } from "../packages/shared/src/index";

const serverEnvironment = {
  DATABASE_URL: "postgresql://127.0.0.1/kairn",
  BETTER_AUTH_URL: "http://127.0.0.1:58080",
  BETTER_AUTH_SECRET: "test-only-secret-for-server-environment",
};

describe("bootstrap configuration", () => {
  it("selects only the fields each process uses", () => {
    expect(
      parseServerEnvironment({
        ...serverEnvironment,
        PORT: "8080",
        OMITTED: "example",
      }),
    ).toEqual({
      ...serverEnvironment,
      HOST: "127.0.0.1",
      PORT: 8080,
      NODE_ENV: "development",
    });
    const DATABASE_URL = "postgresql://127.0.0.1/kairn";
    expect(parseWorkerEnvironment({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      NODE_ENV: "development",
    });
    expect(parsePublicEnvironment({ appName: undefined })).toEqual({
      appName: "Kairn",
    });
  });

  it("rejects invalid private and public configuration", () => {
    expect(() =>
      parseServerEnvironment({ ...serverEnvironment, PORT: "70000" }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({ ...serverEnvironment, NODE_ENV: "production" }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({
        ...serverEnvironment,
        BETTER_AUTH_URL: "https://example.test/path",
      }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({
        ...serverEnvironment,
        BETTER_AUTH_SECRET: "short",
      }),
    ).toThrow();
    expect(() =>
      parseWorkerEnvironment({
        DATABASE_URL: "postgresql://127.0.0.1/kairn",
        NODE_ENV: "invalid",
      }),
    ).toThrow();
    expect(() => parsePublicEnvironment({ appName: " " })).toThrow();
  });
});

it("serves the server scaffold response", async () => {
  const app = createApp({
    authHandler: async () => new Response(null, { status: 404 }),
    checkReadiness: async () => {},
  });
  const response = await app.request("/");
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ service: "kairn-server" });
});
