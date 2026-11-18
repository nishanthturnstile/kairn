import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { loadReader } from "../../apps/server/src/reader";

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
      await route.fulfill({ contentType: "application/json", body: "null" });
    } else if (pathname === "/api/v1/ready") {
      const status = await readiness();
      await route.fulfill({
        status,
        json: { status: status === 200 ? "ready" : "unavailable" },
      });
    } else {
      const asset = /^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(pathname);
      const contentType = asset
        ? pathname.endsWith(".js")
          ? "text/javascript"
          : "text/css"
        : "text/html";
      await route.fulfill({
        contentType,
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

test("creator displays unavailable, loading, error, and empty states through the main destinations", async ({
  page,
}) => {
  const first = Promise.withResolvers<number>();
  let requests = 0;
  await serveFixture(page, () =>
    requests++ === 0 ? first.promise : Promise.resolve(200),
  );
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: "Journeys" })).toBeVisible();
  await expect(page.getByText("Sign in to continue")).toBeVisible();
  await page.getByRole("link", { name: "Discover" }).click();
  await expect(page.getByText("Checking availability")).toBeVisible();
  first.resolve(503);
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t connect to Kairn",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No published journeys yet")).toBeVisible();
  await page.getByRole("link", { name: "Saved" }).click();
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
});
