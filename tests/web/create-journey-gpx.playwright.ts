import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { wcagAATags } from "./accessibility";

const site = process.env.KAIRN_GPX_CREATION_ORIGIN;
test.skip(!site, "Requires a web app with VITE_GPX_JOURNEY_CREATE=1.");

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "250dbeb0-da94-4de9-a164-cadaa8d2d6bd",
          email: "traveller@example.test",
          emailVerified: true,
        },
      },
    }),
  );
  await page.route("**/api/v1/onboarding", (route) =>
    route.fulfill({
      json: { state: "completed", intent: "plan", version: 1 },
    }),
  );
  await page.route("**/api/v1/profile", (route) =>
    route.fulfill({ json: { displayName: "Journey tester" } }),
  );
  await page.route("**/api/v1/dashboard", (route) =>
    route.fulfill({
      json: {
        journeyCount: 0,
        asOf: "2026-11-23T12:00:00.000Z",
        upcomingCount: 0,
        recentJourneys: [],
        nextJourney: null,
      },
    }),
  );
  await page.route("**/api/v1/journeys?view=timeline", (route) =>
    route.fulfill({
      json: {
        asOf: "2026-11-23T12:00:00.000Z",
        timeline: Object.fromEntries(
          ["active", "upcoming", "past", "incomplete"].map((section) => [
            section,
            { items: [], nextCursor: null },
          ]),
        ),
      },
    }),
  );
  await page.route("**/api/v1/imports", (route) =>
    route.fulfill({ json: { imports: [], nextCursor: null } }),
  );
});

function file(name: string, contents = "<gpx/>", mimeType = "text/plain") {
  return { name, mimeType, buffer: Buffer.from(contents) };
}

test("Dashboard and Journeys both open the GPX-first page with planning available", async ({
  page,
}) => {
  for (const location of ["/dashboard", "/journeys"]) {
    await page.goto(`${site}${location}`);
    const action = page.getByRole("link", {
      name: "Create a journey",
      exact: true,
    });
    await expect(action).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Import GPX", exact: true }),
    ).toHaveCount(0);
    await action.press("Enter");
    await expect(page).toHaveURL(`${site}/journeys/new`);
    await expect(
      page.getByRole("heading", { name: "Create a journey", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Add GPX files" }),
    ).toBeVisible();
  }
  const upload = page.getByRole("button", { name: "Back to GPX upload" });
  const details = page.locator("main header").getByRole("button", {
    name: "Enter details without GPX",
  });
  const detailsPanel = page.getByRole("region", {
    name: "Enter journey details",
  });
  await expect(
    page.getByRole("heading", { name: "Route preview" }),
  ).toBeHidden();
  await details.press("Enter");
  await expect(detailsPanel).toBeFocused();
  await expect(page).toHaveURL(`${site}/journeys/new`);
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("Weekend plans");
  await upload.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Add GPX files" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose files" }),
  ).toBeFocused();
  await page
    .getByLabel("GPX files", { exact: true })
    .setInputFiles(file("weekend.gpx"));
  await details.click();
  await expect(title).toHaveValue("Weekend plans");
  await upload.click();
  await expect(page.getByText("weekend.gpx", { exact: true })).toBeVisible();
  await expect(page.getByText("On this device", { exact: true })).toBeVisible();
});

test("keeps valid picker and drop files locally, handles limits and restores focus on removal", async ({
  page,
}) => {
  const transfers: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith("/api/v1/uploads") ||
      path.startsWith("/api/v1/imports/")
    )
      transfers.push(path);
  });
  await page.goto(`${site}/journeys/new`);
  const choose = page.getByRole("button", { name: "Choose files" });
  const fileChooser = page.waitForEvent("filechooser");
  await choose.press("Enter");
  const picker = await fileChooser;
  expect(picker.isMultiple()).toBe(true);
  await picker.setFiles([
    file("outbound.GPX", "XML validation happens on the worker"),
    file("unrelated.txt"),
    file("empty.gpx", ""),
  ]);
  const rows = page.getByRole("list", { name: "Selected GPX files" });
  await expect(rows.getByText("outbound.GPX")).toBeVisible();
  await expect(page.getByText("Choose a .gpx file.")).toBeVisible();
  await expect(page.getByText("This file is empty.")).toBeVisible();
  const dataTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["<gpx/>"], "return.gpx"));
    data.items.add(new File(["Photo"], "photo.jpg", { type: "image/jpeg" }));
    return data;
  });
  const add = page.getByRole("button", { name: "Add files" });
  await add.dispatchEvent("dragenter", { dataTransfer });
  await expect(page.getByText("Release to add files")).toBeVisible();
  await add.dispatchEvent("dragleave", { dataTransfer });
  await expect(page.getByText("Release to add files")).toBeHidden();
  await add.dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();
  await expect(rows.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("photo.jpg")).toBeVisible();
  const outbound = page.getByRole("button", { name: "Remove outbound.GPX" });
  const returnFile = page.getByRole("button", { name: "Remove return.gpx" });
  await outbound.press("Enter");
  await expect(returnFile).toBeFocused();
  await returnFile.press("Enter");
  await expect(choose).toBeFocused();
  await expect(rows).toHaveCount(0);

  await page
    .getByLabel("GPX files", { exact: true })
    .setInputFiles(
      Array.from({ length: 11 }, (_, index) => file(`recording-${index}.gpx`)),
    );
  await expect(rows.getByRole("listitem")).toHaveCount(10);
  await expect(page.getByText(/You can add up to 10 files/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload for review" }),
  ).toBeEnabled();
  expect(transfers).toEqual([]);
});

test("file selection reflows and keeps its accessible controls at 200 percent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`${site}/journeys/new`);
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await page
    .getByLabel("GPX files", { exact: true })
    .setInputFiles(file(`${"long-filename".repeat(12)}.gpx`));
  await expect(
    page.getByRole("button", { name: /Remove long-filename/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  expect(
    (await new AxeBuilder({ page }).withTags(wcagAATags).analyze()).violations,
  ).toEqual([]);
});
