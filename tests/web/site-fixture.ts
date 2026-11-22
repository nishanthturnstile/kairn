import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";
import { loadReader } from "../../apps/server/src/reader";

const buildDir = resolve("apps/web/dist");
export const origin = "http://kairn.test";
const creek = {
  title: "Along the creek",
  summary: "A short walk through a fictional valley.",
  chapters: [
    {
      id: "crossing",
      title: "First crossing",
      body: "A footbridge crossed the creek.",
      privateCoordinate: "48.123456",
    },
    {
      id: "return",
      title: "Return",
      body: "</script><img src=x onerror=alert(1)>",
    },
  ],
  privateDraft: "private draft fixture",
};
const coast = {
  title: "Coastal path",
  summary: "A fictional coastal walk.",
  chapters: [
    {
      id: "headland",
      title: "The headland",
      body: "The walk ended at the harbor.",
    },
  ],
};

export async function serveFixture(
  page: Page,
  readiness: () => Promise<number> = async () => 200,
  signedIn = false,
) {
  const render = await loadReader(buildDir);
  await page.route(`${origin}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith("/read/")) {
      const story =
        pathname === "/read/creek"
          ? creek
          : pathname === "/read/coast"
            ? coast
            : null;
      await route.fulfill({
        status: story ? 200 : 404,
        contentType: "text/html; charset=utf-8",
        body: render(story),
      });
    } else if (pathname === "/api/auth/get-session") {
      await route.fulfill({
        json: signedIn
          ? {
              user: {
                id: "250dbeb0-da94-4de9-a164-cadaa8d2d6bd",
                email: "reader@example.test",
                emailVerified: true,
              },
            }
          : null,
      });
    } else if (pathname === "/api/v1/onboarding") {
      await route.fulfill({ json: { state: "exempt" } });
    } else if (pathname === "/api/v1/ready") {
      const status = await readiness();
      await route.fulfill({
        status,
        json: { status: status === 200 ? "ready" : "unavailable" },
      });
    } else {
      const asset =
        /^\/(?:assets|brand)\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(js|css|woff2|webp|png|svg)$/.exec(
          pathname,
        );
      const mime: Record<string, string> = {
        js: "text/javascript",
        css: "text/css",
        woff2: "font/woff2",
        svg: "image/svg+xml",
        png: "image/png",
        webp: "image/webp",
      };
      await route.fulfill({
        contentType: asset ? mime[asset[1]] : "text/html",
        body: await readFile(
          resolve(buildDir, `client${asset ? pathname : "/index.html"}`),
        ),
      });
    }
  });
}
