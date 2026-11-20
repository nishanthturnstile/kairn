import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loadReader } from "../../apps/server/src/reader";
import { chooseAppearance } from "./appearance-fixture";

const buildDir = resolve("apps/web/dist");
const origin = "http://kairn.test";
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

async function serveFixture(
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
        /^\/assets\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(js|css|woff2)$/.exec(
          pathname,
        );
      const mime: Record<string, string> = {
        js: "text/javascript",
        css: "text/css",
        woff2: "font/woff2",
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

test("isolates reader HTML and hydrates the same chapters and controls", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const second = await context.newPage();
  await Promise.all([serveFixture(page), serveFixture(second)]);
  const [firstResponse, secondResponse] = await Promise.all([
    page.goto(`${origin}/read/creek`),
    second.goto(`${origin}/read/coast`),
  ]);
  const firstHtml = await firstResponse?.text();
  expect(firstHtml).toContain("A footbridge crossed the creek.");
  expect(firstHtml).not.toContain("private draft fixture");
  expect(firstHtml).not.toContain("48.123456");
  expect(firstHtml).not.toContain("</script><img");
  const secondHtml = await secondResponse?.text();
  expect(secondHtml).toContain("Coastal path");
  expect(secondHtml).not.toContain("Along the creek");
  await expect(
    page.getByRole("heading", { name: "Along the creek" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Return" })).toHaveAttribute(
    "href",
    "#chapter-return",
  );
  const textSize = page.getByRole("button", { name: "Larger text" });
  await textSize.click();
  await expect(textSize).toHaveAttribute("aria-pressed", "true");
  await expect(
    second.getByRole("button", { name: "Larger text" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("unavailable reader metadata contains only the generic projection", async ({
  page,
}) => {
  await serveFixture(page);
  const response = await page.goto(`${origin}/read/private-journey`);
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Story unavailable");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Story unavailable",
  );
  expect(await response?.text()).not.toContain("private-journey");
});

test("signed-out routes render only account access", async ({ page }) => {
  const protectedReads: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/")) protectedReads.push(path);
  });
  await serveFixture(page);
  for (const path of [
    "/",
    "/dashboard",
    "/discover",
    "/saved",
    "/journeys",
    "/journeys/new",
    "/journeys/250dbeb0-da94-4de9-a164-cadaa8d2d6bd",
    "/onboarding",
    "/unknown",
  ]) {
    await page.goto(origin + path);
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/account");
  }
  expect(protectedReads).toEqual([]);
});

test("signed-in discovery displays loading, retry, and empty states", async ({
  page,
}) => {
  const first = Promise.withResolvers<number>();
  let requests = 0;
  await serveFixture(
    page,
    () => (requests++ === 0 ? first.promise : Promise.resolve(200)),
    true,
  );
  await page.goto(`${origin}/discover`);
  await expect(page.getByText("Checking availability")).toBeVisible();
  first.resolve(503);
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t connect to Kairn",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No published journeys yet")).toBeVisible();
  await page.getByRole("link", { name: "Saved" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("appearance carries across workspace, account and story at large text sizes", async ({
  page,
}) => {
  await serveFixture(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(origin);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(17, 28, 27)",
  );
  const appearance = page.getByRole("button", {
    name: "Appearance",
    exact: true,
  });
  await appearance.press("Enter");
  const palette = page.getByRole("dialog", { name: "Appearance" });
  await expect(palette.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(appearance).toBeFocused();
  await chooseAppearance(page, "Light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(246, 243, 235)",
  );
  await chooseAppearance(page, "Outdoor");
  for (const path of [
    "/journeys",
    "/discover",
    "/saved",
    "/account",
    "/account?verification=confirmed",
    "/account?mode=sign-up",
    "/account?mode=recover",
    "/account/reset",
    "/account/reset?token=fixture",
    "/read/creek",
    "/read/missing",
  ]) {
    await page.goto(origin + path);
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "outdoor",
    );
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const control of await page
      .locator("button:visible, input:visible, select:visible")
      .all()) {
      const bounds = await control.boundingBox();
      expect(bounds?.height, path).toBeGreaterThanOrEqual(44);
      expect(bounds?.width, path).toBeGreaterThanOrEqual(44);
    }
    if (path === "/account") {
      await expect(page.getByLabel("Email", { exact: true })).toHaveCSS(
        "border-top-width",
        "2px",
      );
    }
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "200%";
      await document.fonts.ready;
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path,
    ).toBeLessThanOrEqual(320);
    expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual(
      [],
    );
  }
  await chooseAppearance(page, "System");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(17, 28, 27)",
  );
});

test("reader keeps chapter hierarchy when the visitor enlarges the text", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/read/creek`);
  const heading = page.getByRole("heading", { name: "First crossing" });
  await expect(heading).toHaveCSS("font-family", /Georgia/);
  await expect(heading).toHaveCSS("font-size", "36px");
  const prose = page.getByText("A footbridge crossed the creek.");
  await expect(prose).toHaveCSS("font-size", "18px");
  await page.getByRole("button", { name: "Larger text" }).click();
  await expect(prose).toHaveCSS("font-size", "22px");
});

test.describe("server-rendered reader", () => {
  test.use({ javaScriptEnabled: false });
  test("loads chapter typography and reading content without hydration", async ({
    page,
  }) => {
    await serveFixture(page);
    await page.goto(`${origin}/read/creek`);
    await expect(
      page.getByRole("heading", { name: "First crossing" }),
    ).toHaveCSS("font-family", /Georgia/);
    await expect(page.getByText("A footbridge crossed the creek.")).toHaveCSS(
      "font-size",
      "18px",
    );
  });
});
