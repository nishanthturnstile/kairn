import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { origin, serveFixture } from "./site-fixture";

test("unknown workspace links show a usable recovery page without echoing the URL", async ({
  page,
}) => {
  await serveFixture(page, undefined, true);
  for (const width of [1280, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/journeys/details/invalid-private-path`);
    await expect(page).toHaveTitle("Page unavailable · Kairn");
    await expect(
      page.getByRole("heading", { name: "Page unavailable", level: 1 }),
    ).toBeFocused();
    await expect(page.locator("body")).not.toContainText(
      "invalid-private-path",
    );
    await expect(
      page.getByRole("link", { name: "Go to Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    await expect(
      page.getByRole("link", { name: "Open Journeys" }),
    ).toHaveAttribute("href", "/journeys");
  }
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Open Journeys" }).press("Enter");
  await expect(page).toHaveURL(`${origin}/journeys`);
  await expect(
    page.getByRole("heading", { name: "Journeys", level: 1 }),
  ).toBeFocused();
});

test("unavailable stories have a working workspace exit", async ({ page }) => {
  await serveFixture(page, undefined, true);
  const response = await page.goto(`${origin}/read/unavailable`);
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "Go to Journeys" }).press("Enter");
  await expect(page).toHaveURL(`${origin}/journeys`);
});

test("invitation details stay hidden when the setup check fails", async ({
  page,
}) => {
  await serveFixture(page, undefined, true);
  let setupUnavailable = false;
  await page.route("**/api/v1/onboarding", (route) =>
    setupUnavailable
      ? route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } })
      : route.fallback(),
  );
  const continuation = "c".repeat(60);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await page.route("**/api/v1/journey-invitations/continue", (route) =>
    route.fulfill({ json: { continuation, expiresAt } }),
  );
  const title = "Private coastal journey";
  await page.route("**/api/v1/journey-invitations/review", (route) =>
    route.fulfill({
      json: {
        state: "ready",
        title,
        inviter: "Journey organiser",
        expiresAt,
        scope: "participant",
        schedule: null,
        continuation,
      },
    }),
  );
  await page.goto(`${origin}/journey-invitations#${"t".repeat(43)}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  setupUnavailable = true;
  // Recheck setup through the query provider while an invitation is open.
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByText("Couldn’t check your access")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Journey invitation" }),
  ).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Join journey" })).toHaveCount(
    0,
  );

  setupUnavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join journey" }),
  ).toBeVisible();
});
