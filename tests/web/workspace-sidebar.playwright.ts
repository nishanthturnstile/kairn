import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { wcagAATags } from "./accessibility";
import { mailLink, site } from "./identity-fixture";
import { openWorkspaceAccountMenu } from "./workspace-fixture";

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

async function prepareSignIn(page: Page, name: string, sourceAddress: string) {
  await page
    .context()
    .setExtraHTTPHeaders({ "X-Forwarded-For": sourceAddress });
  const email = `workspace-${randomUUID()}@example.test`;
  const password = "Synthetic-workspace-password";
  const headers = { Origin: site, "X-Forwarded-For": sourceAddress };
  const registration = await page.request.post(
    `${site}/api/auth/sign-up/email`,
    { headers, data: { name, email, password } },
  );
  expect(registration.status()).toBe(200);
  await page.goto(await mailLink(email, "Verify your Kairn email"));
  // Check the workspace independently of enrollment. Onboarding has its own suite.
  const established = await fetch(`${site}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(established.ok).toBe(true);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  return email;
}

test("keeps page state across navigation sizes and opens compact appearance settings", async ({
  browserName,
  page,
}, testInfo) => {
  test.skip(
    process.env.KAIRN_WEB_IDENTITY !== "1",
    "Requires the local browser identity stack.",
  );
  test.setTimeout(70_000);
  const browserNumber = ["chromium", "webkit", "firefox"].indexOf(browserName);
  const email = await prepareSignIn(
    page,
    "Devika Rao",
    `198.58.${browserNumber}.1`,
  );
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
  const bottomNav = page.locator("[data-workspace-bottom-nav]");
  const appearanceDialog = page.getByRole("dialog", { name: "Appearance" });

  await expect(dashboard).toHaveAttribute("aria-current", "page");
  await expect(main).toContainText("Your journeys start here");
  await expect(page.getByText("Devika Rao", { exact: true })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include("[data-workspace-header]")
        .withRules(["label-content-name-mismatch"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await expect(dashboard).toHaveAttribute("data-active", "");
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  const [selectedIcon, otherIcon] = await Promise.all(
    [dashboard, journeys].map((link) => link.locator("svg").boundingBox()),
  );
  expect(selectedIcon?.x).toBe(otherIcon?.x);
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("dashboard-desktop.png"),
      fullPage: true,
    });

  const desktopMenu = await openWorkspaceAccountMenu(page);
  const appearance = desktopMenu.getByRole("menuitem", {
    name: "Appearance System",
  });
  await expect(desktopMenu.getByRole("menuitem")).toHaveCount(3);
  await expect(appearance).toHaveAttribute("aria-haspopup", "dialog");
  await appearance.press("Enter");
  await expect(desktopMenu).toBeHidden();
  const system = appearanceDialog.getByRole("button", { name: "System" });
  const light = appearanceDialog.getByRole("button", {
    name: "Light",
    exact: true,
  });
  await expect(system).toHaveAttribute("aria-pressed", "true");
  await expect(system).toBeFocused();
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("appearance-desktop.png"),
      animations: "disabled",
    });
  await page.keyboard.press("Tab");
  await expect(light).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /account menu$/i }),
  ).toBeFocused();

  const initialDashboardRequests = dashboardRequests.length;
  await collapse.click();
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(dashboard).toHaveAccessibleName("Dashboard");
  await expect(dashboard).toHaveAttribute("data-active", "");
  await expand.click();
  expect(dashboardRequests).toHaveLength(initialDashboardRequests);
  const discover = nav.getByRole("link", { name: "Discover", exact: true });
  await discover.focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(bottomNav).toBeInViewport();
  await expect(bottomNav).toHaveCSS("position", "sticky");
  await expect(dashboard).toHaveAttribute("aria-current", "page");
  await expect(discover).toBeFocused();
  await expect(collapse).toBeHidden();
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("dashboard-mobile.png"),
      fullPage: true,
    });
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(expand).toBeVisible();
  await expect(bottomNav).toBeHidden();
  await expect(discover).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(collapse).toBeVisible();

  await create.click();
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  const parent = breadcrumb.getByRole("link", { name: "Journeys" });
  await expect(parent).not.toHaveAttribute("aria-current", "page");
  await parent.press("Enter");
  await expect(page).toHaveURL(`${site}/journeys`);
  await expect(
    page.getByRole("heading", { name: "Journeys", exact: true }),
  ).toBeFocused();
  await dashboard.click();
  await create.click();
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("Unsubmitted hill trip");
  await title.evaluate((input) => {
    input.dataset.testInstance = "original";
  });
  await collapse.click();
  await expect(title).toHaveValue("Unsubmitted hill trip");
  await expect(title).toHaveAttribute("data-test-instance", "original");
  await expect(journeys).toHaveAttribute("aria-current", "location");
  await expect(journeys).toHaveAttribute("data-active", "");
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Create a journey");
  await expect(
    page
      .getByRole("navigation", { name: "Breadcrumb" })
      .locator('[aria-current="page"]'),
  ).toHaveText("Create a journey");

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
  await expect(bottomNav).toHaveCSS("position", "static");
  await expect(nav.getByRole("link")).toHaveText([
    "Dashboard",
    "Journeys",
    "Discover",
    "Saved",
  ]);
  for (const link of await nav.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expect(journeys).toHaveAttribute("aria-current", "location");
  const menu = await openWorkspaceAccountMenu(page);
  await expect(menu.getByText(email, { exact: true })).toBeVisible();
  if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
    await page.screenshot({
      path: testInfo.outputPath("account-mobile.png"),
      animations: "disabled",
    });
  await menu.getByRole("menuitem", { name: "Appearance System" }).click();
  await appearanceDialog
    .getByRole("button", { name: "Dark", exact: true })
    .click();
  await expect(appearanceDialog).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
  await expect(
    page.getByRole("button", { name: /account menu$/i }),
  ).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  expect(
    (await new AxeBuilder({ page }).withTags(wcagAATags).analyze()).violations,
  ).toEqual([]);

  await page.setViewportSize({ width: 390, height: 640 });
  const appearanceRow = (mode: string) =>
    page.getByRole("menuitem", { name: `Appearance ${mode}` });
  await openWorkspaceAccountMenu(page);
  await appearanceRow("Dark").click();
  await appearanceDialog.getByRole("button", { name: "Outdoor" }).click();
  await expect(appearanceDialog).toBeHidden();
  await openWorkspaceAccountMenu(page);
  await appearanceRow("Outdoor").click();
  const appearanceHeading = appearanceDialog.getByRole("heading", {
    name: "Appearance",
  });
  await expect(appearanceHeading).toBeFocused();
  await expect(appearanceHeading).toBeInViewport();
  await expect(
    appearanceDialog.getByRole("button", { name: "Close" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(appearanceDialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: /account menu$/i }),
  ).toBeFocused();

  const saved = nav.getByRole("link", { name: "Saved", exact: true });
  await saved.scrollIntoViewIfNeeded();
  await saved.press("Enter");
  await expect(saved).toHaveAttribute("aria-current", "page");
  await expect(main).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Saved", exact: true }),
  ).toBeVisible();
  const signOutMenu = await openWorkspaceAccountMenu(page);
  await expect(
    signOutMenu.getByRole("menuitem", { name: "Appearance Outdoor" }),
  ).toBeVisible();
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
    page.getByRole("dialog", { name: "You’re signed out." }),
  ).toBeVisible();
  await expect(nav).toHaveCount(0);
});

test("presents real plans and history, and recovers when the summary is unavailable", async ({
  browserName,
  page,
}) => {
  test.skip(
    process.env.KAIRN_WEB_IDENTITY !== "1",
    "Requires the local browser identity stack.",
  );
  test.setTimeout(70_000);
  const browserNumber = ["chromium", "webkit", "firefox"].indexOf(browserName);
  await prepareSignIn(page, "Dashboard fixture", `198.58.${browserNumber}.31`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const main = page.getByRole("main");
  const next = main.getByRole("region", { name: "Next journey" });
  const totals = main.getByRole("region", { name: "Overview" });
  const recent = main.getByRole("region", { name: "Recent journeys" });
  await expect(main.getByText("Every journey starts private.")).toBeVisible();
  await expect(totals).toHaveCount(0);
  await expect(
    main.getByRole("link", { name: "Create a journey" }),
  ).toHaveCount(1);

  const { user } = await (
    await page.request.get(`${site}/api/auth/get-session`)
  ).json();
  async function createJourney(title: string, intendedStart: string) {
    const response = await page.request.post(`${site}/api/v1/journeys`, {
      headers: {
        Origin: site,
        "X-Expected-Account": String(user.id),
        "Idempotency-Key": randomUUID(),
      },
      data: { title, intendedStart, timeZone: "Asia/Kolkata" },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).id;
  }
  await createJourney("Along the Mandovi", "2020-11-05T09:30");
  await createJourney("A walk through Fort Kochi", "2021-04-02T12:15");
  await page.reload();
  await expect(next).toContainText("No upcoming journeys scheduled.");
  await expect(totals.locator("dd")).toHaveText(["2", "0"]);
  await expect(recent.getByRole("listitem")).toHaveCount(2);
  await expect(recent.getByRole("listitem").first()).toContainText(
    "A walk through Fort Kochi",
  );

  const title = "Konkan coast by train";
  const id = await createJourney(title, "2090-09-14T09:30");
  await page.reload();
  await expect(next.getByRole("link")).toHaveAttribute(
    "href",
    `/journeys/${id}`,
  );
  await expect(next.getByRole("link")).toContainText(title);
  await expect(totals.locator("dd")).toHaveText(["3", "1"]);
  const create = main.getByRole("link", {
    name: "Create a journey",
    exact: true,
  });
  await create.focus();

  const releaseSummary = Promise.withResolvers<void>();
  await page.route(
    "**/api/v1/dashboard",
    async (route) => {
      await releaseSummary.promise;
      await route.fulfill({ status: 503, json: { code: "unavailable" } });
    },
    { times: 1 },
  );
  try {
    await page.evaluate(() =>
      window.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(main.getByText("Loading your Dashboard")).toBeVisible();
    await expect(next.getByText(title)).toHaveCount(0);
    await expect(create).toBeFocused();
  } finally {
    releaseSummary.resolve();
  }
  await expect(main.getByRole("alert")).toContainText(
    "Couldn’t load your Dashboard",
  );
  await expect(create).toBeFocused();
  await main.getByRole("button", { name: "Try again" }).click();
  await expect(next.getByText(title)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 830 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  expect(
    (await new AxeBuilder({ page }).withTags(wcagAATags).analyze()).violations,
  ).toEqual([]);

  await page.setViewportSize({ width: 320, height: 540 });
  const nextLink = next.getByRole("link");
  await nextLink.evaluate((link: HTMLElement) => {
    window.scrollTo(0, window.scrollY + link.getBoundingClientRect().top - 8);
    link.focus({ preventScroll: true });
  });
  await expect(nextLink).toBeFocused();
  await expect
    .poll(() =>
      nextLink.evaluate(
        (link) =>
          link.getBoundingClientRect().top -
          (document
            .querySelector("[data-workspace-header]")
            ?.getBoundingClientRect().bottom ?? 0),
      ),
    )
    .toBeGreaterThanOrEqual(0);
});
