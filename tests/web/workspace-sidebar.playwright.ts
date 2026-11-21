import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mailLink, site } from "./identity-fixture";
import { openWorkspaceAccountMenu } from "./workspace-fixture";

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

test("keeps page state across sidebar sizes and supports the mobile account menu", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.KAIRN_WEB_IDENTITY !== "1",
    "Requires the local browser identity stack.",
  );
  test.setTimeout(70_000);
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": "198.58.0.1" });
  const email = `sidebar-${randomUUID()}@example.test`;
  const password = "Synthetic-sidebar-password";
  const registration = await page.request.post(
    `${site}/api/auth/sign-up/email`,
    {
      headers: { Origin: site },
      data: { name: "Devika Rao", email, password },
    },
  );
  expect(registration.status()).toBe(200);
  await page.goto(await mailLink(email, "Verify your Kairn email"));
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const dashboardRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/dashboard")
      dashboardRequests.push(request.url());
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const main = page.getByRole("main");
  const nav = page.getByRole("navigation", { name: "Main" });
  const dashboard = nav.getByRole("link", { name: "Dashboard", exact: true });
  const journeys = nav.getByRole("link", { name: "Journeys", exact: true });
  const collapse = page.getByRole("button", { name: "Collapse sidebar" });
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  const create = page.getByRole("link", {
    name: "Create a journey",
    exact: true,
  });
  const navTrigger = page.getByRole("button", { name: "Open navigation" });
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });

  await expect(dashboard).toHaveAttribute("aria-current", "page");
  await expect(main).toContainText("Your journeys start here");
  await expect(page.getByText("Devika Rao", { exact: true })).toBeVisible();
  await expect(dashboard).toHaveAttribute("data-active", "true");
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("dashboard-desktop.png"),
      fullPage: true,
    });

  const desktopMenu = await openWorkspaceAccountMenu(page);
  const system = desktopMenu.getByRole("menuitemradio", { name: "System" });
  const light = desktopMenu.getByRole("menuitemradio", {
    name: "Light",
    exact: true,
  });
  const dark = desktopMenu.getByRole("menuitemradio", {
    name: "Dark",
    exact: true,
  });
  const outdoor = desktopMenu.getByRole("menuitemradio", { name: "Outdoor" });
  await expect(system).toBeChecked();
  const [systemBox, lightBox, darkBox, outdoorBox] = await Promise.all(
    [system, light, dark, outdoor].map((option) => option.boundingBox()),
  );
  expect(systemBox?.y).toBe(lightBox?.y);
  expect(darkBox?.y).toBe(outdoorBox?.y);
  expect(darkBox?.y ?? 0).toBeGreaterThan(systemBox?.y ?? 0);
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("appearance-desktop.png"),
      animations: "disabled",
    });
  await system.focus();
  await page.keyboard.press("ArrowDown");
  await expect(light).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /account menu$/i }),
  ).toBeFocused();

  const initialDashboardRequests = dashboardRequests.length;
  await collapse.click();
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(dashboard).toHaveAccessibleName("Dashboard");
  await expect(dashboard).toHaveAttribute("data-active", "true");
  await expand.click();
  expect(dashboardRequests).toHaveLength(initialDashboardRequests);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav).toHaveCount(0);
  await expect(navTrigger).toBeVisible();
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("dashboard-mobile.png"),
      fullPage: true,
    });
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(expand).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(collapse).toBeVisible();

  await create.click();
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("Unsubmitted hill trip");
  await title.evaluate((input) => {
    input.dataset.testInstance = "original";
  });
  await collapse.click();
  await expect(title).toHaveValue("Unsubmitted hill trip");
  await expect(title).toHaveAttribute("data-test-instance", "original");
  await expect(journeys).toHaveAttribute("aria-current", "page");
  await expect(journeys).toHaveAttribute("data-active", "true");

  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(collapse).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(expand).toBeVisible();
  await expect(title).toHaveAttribute("data-test-instance", "original");
  await expect(title).toHaveValue("Unsubmitted hill trip");
  await page.reload();
  await expect(expand).toBeVisible();

  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await navTrigger.click();
  await expect(drawer).toBeVisible();
  await expect(journeys).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(navTrigger).toBeFocused();
  const menu = await openWorkspaceAccountMenu(page);
  await expect(menu.getByText(email, { exact: true })).toBeVisible();
  await expect(
    menu.getByRole("menuitemradio", { name: "System" }),
  ).toBeChecked();
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("account-mobile.png"),
      animations: "disabled",
    });
  await menu.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(navTrigger).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await navTrigger.click();
  await nav.getByRole("link", { name: "Saved", exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Saved", exact: true }),
  ).toBeVisible();
  const signOutMenu = await openWorkspaceAccountMenu(page);
  await expect(
    signOutMenu.getByRole("menuitemradio", { name: "Dark" }),
  ).toBeChecked();
  await page.route(
    "**/api/auth/sign-out",
    (route) =>
      route.fulfill({
        status: 503,
        json: { message: "Fixture sign-out failure" },
      }),
    { times: 1 },
  );
  await signOutMenu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t sign out.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "You’re signed out." }),
  ).toBeVisible();
  await expect(nav).toHaveCount(0);
});
