import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/web",
  testMatch: "*.playwright.ts",
  use: { browserName: "chromium" },
});
