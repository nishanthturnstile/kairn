import { describe, expect, it } from "vite-plus/test";
import { app } from "../apps/server/src/app";
import {
  parseServerEnvironment,
  parseWorkerEnvironment,
} from "../packages/backend/src/index";
import { parsePublicEnvironment } from "../packages/shared/src/index";

describe("bootstrap configuration", () => {
  it("selects only the fields each process uses", () => {
    expect(
      parseServerEnvironment({ PORT: "8080", OMITTED: "example" }),
    ).toEqual({
      HOST: "127.0.0.1",
      PORT: 8080,
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
    expect(() => parseServerEnvironment({ PORT: "70000" })).toThrow();
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
  const response = await app.request("/");
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ service: "kairn-server" });
});
