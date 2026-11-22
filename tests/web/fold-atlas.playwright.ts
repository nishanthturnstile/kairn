import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { wcagAATags } from "./accessibility";
import { chooseAppearance } from "./appearance-fixture";
import { expectSchedule, fillSchedule } from "./schedule-fixture";
import { origin, serveFixture } from "./site-fixture";

const overlayTriggers = [
  /^Appearance: /,
  "Sort moments",
  "Open dialog",
  "Open sheet",
];

async function checkAccessibility(
  page: Page,
  selector?: string,
  state?: string,
) {
  const builder = new AxeBuilder({ page }).withTags(wcagAATags);
  if (selector) builder.include(selector);
  const audit = await builder.analyze();
  expect(
    audit.violations.flatMap((issue) => {
      // Base UI's empty focus guards redirect Tab and the VoiceOver cursor.
      // Keep checks for real controls, including children of portal surfaces.
      const nodes = issue.nodes.filter(
        (node) =>
          !(
            ["aria-hidden-focus", "aria-command-name"].includes(issue.id) &&
            /^<span\b[^>]* data-base-ui-focus-guard=""[^>]*><\/span>$/.test(
              node.html,
            )
          ),
      );
      return nodes.length ? [[issue.id, nodes.map((node) => node.target)]] : [];
    }),
    state,
  ).toEqual([]);
}

test("public component catalog uses live primitives and preserves state across appearances", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/v1/"))
      reads.push(req.url());
  });
  await serveFixture(page);
  await page.goto(`${origin}/design-system`);
  await page
    .getByRole("region", { name: "Inset key" })
    .getByRole("button", { name: "Save moment" })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Sample moment saved." }),
  ).toBeVisible();
  await page.getByLabel("Preview state").selectOption("Saving");
  await expect(page.getByRole("button", { name: "Saving…" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.getByRole("button", { name: "Reset sample" }).click();
  await expect(page.getByRole("button", { name: "Save moment" })).toBeEnabled();
  await page.getByRole("tab", { name: "Saved" }).click();
  await page.getByRole("switch", { name: "Vertical rail" }).check();
  await chooseAppearance(page, "Dark");
  await expect(page.getByRole("tab", { name: "Saved" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tablist")).toHaveAttribute(
    "aria-orientation",
    "vertical",
  );
  await page.getByRole("button", { name: "Apply name" }).click();
  await expect(page.getByLabel("Journey name")).toBeFocused();
  await page.getByLabel("Journey name").fill("Weekend");
  await page.getByRole("button", { name: "Apply name" }).click();
  await expect(page.getByText("Sample name applied: Weekend")).toBeVisible();
  const password = page.getByLabel("Sample password");
  await password.fill("Sample passphrase");
  await page.getByRole("button", { name: "Show password" }).press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await fillSchedule(page, "Start date", "2026-11-22");
  await fillSchedule(page, "Start time", "08:30");
  await expectSchedule(page, "Start time", "08:30");
  await page.getByLabel("Queue state").selectOption("Interrupted");
  await page.getByRole("button", { name: "Retry sample" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "42");
  for (const [button, title] of [
    ["Open sheet", "Row details"],
    ["Open dialog", "Visibility preview"],
  ]) {
    const trigger = page.getByRole("button", { name: button });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  await page.getByRole("button", { name: "Find a component" }).click();
  await page.getByRole("searchbox").fill("textarea");
  await page
    .getByRole("link", { name: "Text fields", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/#fields$/);
  await expect(
    page.getByRole("heading", { name: "Text fields" }),
  ).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
  expect(reads).toEqual([]);
});

test.describe("narrow catalog", () => {
  test.use({
    viewport: { width: 320, height: 800 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  for (const theme of ["Light", "Dark", "Outdoor"] as const) {
    test(`index, target size and enlarged text in ${theme}`, async ({
      page,
    }) => {
      await serveFixture(page);
      await page.goto(`${origin}/design-system`);
      await expect(page.getByRole("heading", { name: "Fold." })).toBeVisible();
      await chooseAppearance(page, theme);
      const target = page
        .getByRole("region", { name: "Inset key" })
        .getByRole("button", { name: "Save moment" });
      expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(48);
      await page.getByRole("button", { name: "Open navigation" }).click();
      const sheet = page.getByRole("dialog", { name: "Component index" });
      await sheet.getByRole("link", { name: "Feedback" }).click();
      await expect(sheet).toHaveCount(0);
      await expect(page).toHaveURL(/#feedback$/);
      await expect(
        page.getByRole("heading", { name: "Feedback" }),
      ).toBeFocused();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(320);
    });
    test(`axe audit of feedback states and page landmarks in ${theme}`, async ({
      page,
    }) => {
      await serveFixture(page);
      await page.goto(`${origin}/design-system`);
      await expect(page.getByRole("heading", { name: "Fold." })).toBeVisible();
      await chooseAppearance(page, theme);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      for (const state of [
        "Queued",
        "Interrupted",
        "Uploading",
        "Complete",
        "Loading",
        "Empty",
      ]) {
        await page.getByLabel("Queue state").selectOption(state);
        await checkAccessibility(
          page,
          '[data-slot="card"][aria-labelledby="feedback"]',
          state,
        );
      }
      await checkAccessibility(page);
    });
  }
});

test("catalog landmarks, keyboard navigation and naming stay aligned with the visible controls", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/design-system#actions`);
  await expect(page).toHaveTitle("Fold design system · Kairn");
  const index = page.getByRole("navigation", { name: "Catalog sections" });
  await expect(index.locator("[aria-current]")).toHaveCount(1);
  await expect(index.getByRole("link", { name: "Buttons" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await index.getByRole("link", { name: "Navigation" }).press("Enter");
  await expect(index.getByRole("link", { name: "Navigation" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await expect(
    page.getByRole("heading", { name: "Navigation", exact: true }),
  ).toBeFocused();
  await page.goBack();
  await expect(index.getByRole("link", { name: "Buttons" })).toHaveAttribute(
    "aria-current",
    "location",
  );

  const link = page.getByRole("link", { name: "Go to fields" });
  await link.press("Space");
  await expect(page).toHaveURL(/#actions$/);
  await link.press("Enter");
  await expect(page).toHaveURL(/#fields$/);

  const input = page.getByLabel("Journey name");
  await input.focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(input).toBeFocused();

  await page.getByRole("tab", { name: "Journeys" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Discover" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("switch", { name: "Vertical rail" }).check();
  await page.getByRole("tab", { name: "Discover" }).press("ArrowDown");
  await expect(page.getByRole("tabpanel", { name: "Saved" })).toBeVisible();

  await page.getByRole("switch", { name: "Keep a local copy" }).press("Space");
  await expect(
    page.getByRole("switch", { name: "Keep a local copy" }),
  ).not.toBeChecked();
  await page.getByRole("radio", { name: "Only me" }).press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "Journey review" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Include private originals" }),
  ).toBeDisabled();

  const tooltip = page.getByRole("button", { name: "About action sizes" });
  await tooltip.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(tooltip).toBeFocused();

  for (const trigger of overlayTriggers) {
    const button = page.getByRole("button", { name: trigger });
    await button.press("Enter");
    const surface = page.getByRole(
      trigger === "Sort moments" ? "menu" : "dialog",
    );
    await expect(surface).toBeVisible();
    if (trigger === "Sort moments") {
      await expect(
        surface.getByRole("menuitemradio", { name: "Newest first" }),
      ).toBeFocused();
      await page.keyboard.press("End");
      await expect(
        surface.getByRole("menuitemradio", { name: "Oldest first" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("Current order · Oldest first"),
      ).toBeVisible();
    } else {
      if (typeof trigger === "string") {
        await page.keyboard.press("Shift+Tab");
        await expect(
          surface.getByRole("button", { name: "Close" }),
        ).toBeFocused();
      }
      await page.keyboard.press("Escape");
    }
    await expect(button).toBeFocused();
  }
});
test("selected and focused controls remain distinguishable in forced colors and RTL", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await serveFixture(page);
  await page.goto(`${origin}/design-system`);
  const selected = page.getByRole("tab", { name: "Journeys" });
  await expect(selected).toHaveCSS("text-decoration-line", "underline");
  await expect(page.getByRole("tab", { name: "Saved" })).toHaveCSS(
    "text-decoration-line",
    "none",
  );
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.style.fontSize = "200%";
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "Open dialog" }).click();
  const rect = await page
    .getByRole("dialog", { name: "Visibility preview" })
    .boundingBox();
  if (!rect) throw new Error("Visibility dialog has no layout box");
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(320);
});

test("System follows OS changes while an explicit theme retains the user's choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await serveFixture(page);
  await page.goto(`${origin}/design-system`);
  const button = page.getByRole("button", { name: "Save moment" });
  const light = await button.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(button).not.toHaveCSS("background-color", light);
  await chooseAppearance(page, "Light");
  await expect(button).toHaveCSS("background-color", light);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Appearance: Light" }),
  ).toBeVisible();
  await expect(button).toHaveCSS("background-color", light);
});

test("axe audit with each overlay open", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await serveFixture(page);
  await page.goto(`${origin}/design-system`);
  for (const trigger of overlayTriggers) {
    await page.getByRole("button", { name: trigger }).press("Enter");
    await expect(
      page.getByRole(trigger === "Sort moments" ? "menu" : "dialog"),
    ).toBeVisible();
    await checkAccessibility(page, undefined, String(trigger));
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole(trigger === "Sort moments" ? "menu" : "dialog"),
    ).toHaveCount(0);
  }
});

test("a receipt leaves the action focused, and repeated confirmations share one notification", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/design-system#feedback`);
  const trigger = page.getByRole("button", { name: "Show confirmation" });
  const notifications = page.getByRole("region", { name: "Notifications" });
  const receipt = notifications.getByRole("dialog", {
    name: "Sample changes saved.",
  });
  await trigger.press("Enter");
  await expect(receipt).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(notifications.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("F6");
  await receipt
    .getByRole("button", { name: "Dismiss notification" })
    .press("Enter");
  await expect(receipt).toBeHidden();
});

test("loading and empty patterns preserve readable feedback with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await serveFixture(page);
  await page.goto(`${origin}/design-system#expression`);
  const pattern = page.getByRole("combobox", { name: "Preview pattern" });
  await pattern.waitFor();
  await expect(
    page.locator('[aria-labelledby="expression"] .journey-map-print'),
  ).toHaveAttribute("aria-hidden", "true");
  await pattern.selectOption("Loading journeys");
  const loading = page
    .getByRole("status")
    .filter({ hasText: "Loading your journeys" });
  await expect(loading).toBeVisible();
  await expect(loading.locator('[data-slot="skeleton"]')).toHaveCount(2);
  await expect(loading.locator('[data-slot="cairn-mark"]')).toHaveCSS(
    "animation-name",
    "none",
  );
  await pattern.selectOption("Opening the workspace");
  await expect(
    page.getByRole("status").filter({ hasText: "Opening Kairn…" }),
  ).toBeVisible();
});

test("cold launch uses the saved canvas before the app bundle arrives", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() =>
    localStorage.setItem("kairn.appearance", "dark"),
  );
  await serveFixture(page);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/creator-*.js", async (route) => {
    await ready;
    await route.fallback();
  });
  try {
    await page.goto(`${origin}/design-system`, { waitUntil: "commit" });
    const launch = page
      .getByRole("status")
      .filter({ hasText: "Opening Kairn…" });
    await expect(launch).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expect(launch).toHaveCSS("background-color", "rgb(27, 29, 26)");
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { name: "Fold." })).toBeVisible();
  await expect(page.locator(".fold-launch-initial")).toHaveCount(0);
});

test("selected navigation keeps its identity through hover, press and keyboard focus", async ({
  page,
}) => {
  await serveFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${origin}/design-system#navigation`);
  const journeys = page.getByRole("tab", { name: "Journeys" });
  await expect(journeys).toBeVisible();
  const inactive = page.getByRole("tab", { name: "Saved" });
  const index = page.getByRole("navigation", { name: "Catalog sections" });
  const [selectedIcon, inactiveIcon] = await Promise.all(
    ["Navigation", "Overview"].map((label) =>
      index
        .getByRole("link", { name: label, exact: true })
        .locator("svg")
        .boundingBox(),
    ),
  );
  expect(selectedIcon?.x).toBe(inactiveIcon?.x);
  for (const theme of ["Light", "Dark", "Outdoor"]) {
    await chooseAppearance(page, theme);
    for (const selected of [
      journeys,
      index.getByRole("link", { name: "Navigation", exact: true }),
    ]) {
      await inactive.hover();
      await expect(selected).toHaveCSS(
        "background-color",
        "rgb(211, 244, 119)",
      );
      await selected.hover();
      await expect(selected).toHaveCSS("color", "rgb(32, 38, 26)");
      await expect(selected).toHaveCSS(
        "background-color",
        "rgb(227, 255, 160)",
      );
      await page.mouse.down();
      await expect(selected).toHaveCSS(
        "background-color",
        "rgb(197, 229, 108)",
      );
      await page.mouse.up();
    }
    await inactive.hover();
    await expect(inactive).not.toHaveCSS(
      "background-color",
      "rgb(227, 255, 160)",
    );
    const disabled = page.getByRole("tab", { name: "Archived" });
    await expect(disabled).toBeDisabled();
    await disabled.hover();
    await expect(disabled).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await journeys.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(journeys).toBeFocused();
    await expect(journeys).toHaveCSS("outline-style", "solid");
  }
});

test("typed local dates and times round trip through the keyboard pickers", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/design-system#fields`);
  const calendar = page.getByRole("button", { name: "Choose start date" });
  const clock = page.getByRole("button", { name: "Choose start time" });
  const dayPopup = page.getByRole("dialog", {
    name: "Start date",
    exact: true,
  });
  const timePopup = page.getByRole("dialog", {
    name: "Start time",
    exact: true,
  });
  await fillSchedule(page, "Start date", "2028-02-");
  await calendar.press("Enter");
  await expect(dayPopup.locator(".rdp-today button")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeFocused();
  await expect(dayPopup).toBeHidden();
  await expectSchedule(page, "Start date", "2028-02-DD");
  await fillSchedule(page, "Start date", "2028-02-28");
  await calendar.press("Enter");
  await expect(dayPopup.locator(".rdp-selected button")).toBeFocused();
  await checkAccessibility(page, '[data-slot="schedule-popup"]');
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expectSchedule(page, "Start date", "2028-02-29");
  await expect(calendar).toBeFocused();
  await fillSchedule(page, "Start time", "08:07");
  await clock.press("Enter");
  const hour = timePopup.getByRole("group", { name: "Hour", exact: true });
  const minute = timePopup.getByRole("group", { name: "Minute", exact: true });
  await expect(hour.getByRole("radio", { name: "08" })).toBeFocused();
  await checkAccessibility(page, '[data-slot="schedule-popup"]');
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(minute.getByRole("radio", { name: "07" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await timePopup.getByRole("button", { name: "Use 09:08" }).press("Enter");
  await expectSchedule(page, "Start time", "09:08");
  await expect(clock).toBeFocused();
  await clock.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expectSchedule(page, "Start time", "09:08");
});

test("calendar and clock fit narrow large-text layouts", async ({ page }) => {
  await serveFixture(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${origin}/design-system#fields`);
  await page.getByRole("button", { name: "Choose start date" }).waitFor();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  for (const name of ["Start date", "Start time"]) {
    await page
      .getByRole("button", { name: `Choose ${name.toLowerCase()}` })
      .click();
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    if (!box) throw Error("Missing picker bounds");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
    expect(
      await dialog.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
  }
});

test("choice feedback follows pointer and keyboard input and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await serveFixture(page);
  await page.goto(`${origin}/design-system#selection`);
  const choice = page.getByRole("checkbox", { name: "Include author credits" });
  await page.getByText("Include author credits", { exact: true }).hover();
  await page.mouse.down();
  await expect(choice).toHaveCSS("scale", "0.88");
  await page.mouse.up();
  await expect(choice).toBeChecked();
  await expect(choice).toHaveCSS("scale", "1.06");
  const radio = page.getByRole("radio", { name: "Journey review" });
  await page.getByRole("radio", { name: "Only me" }).press("ArrowDown");
  await expect(radio).toBeChecked();
  await expect(radio).toHaveCSS("scale", "1.06");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(radio).toHaveCSS("scale", "none");
  await choice.press("Space");
  await expect(choice).not.toBeChecked();
  await expect(choice).toHaveCSS("transition-duration", "0s");
});

test("month and year jumps browse without committing a day", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/design-system#fields`);
  const trigger = page.getByRole("button", { name: "Choose start date" });
  const popup = page.getByRole("dialog", { name: "Start date", exact: true });
  const month = popup.getByRole("combobox", { name: "Month", exact: true });
  const year = popup.getByRole("combobox", { name: "Year", exact: true });
  const custom = popup.getByRole("textbox", { name: "Enter year" });
  await fillSchedule(page, "Start date", "2028-02-29");
  await trigger.press("Enter");
  await year.selectOption("2032");
  await month.selectOption({ label: "December" });
  await popup.getByRole("button", { name: "Next month" }).click();
  await expect(month).toHaveValue("0");
  await expect(year).toHaveValue("2033");
  await expectSchedule(page, "Start date", "2028-02-29");
  await year.selectOption("type");
  await expect(custom).toBeFocused();
  await custom.fill("0000");
  await expect(
    popup.getByRole("button", { name: "Go", exact: true }),
  ).toBeDisabled();
  await expect(custom).toHaveAccessibleDescription(
    "Enter a year from 1 to 9999.",
  );
  await custom.fill("1904");
  await custom.press("Enter");
  await expect(year).toBeFocused();
  await month.selectOption({ label: "February" });
  const leapDay = popup.getByRole("button", { name: /29 February 1904/ });
  await leapDay.click();
  await expectSchedule(page, "Start date", "1904-02-29");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  for (const [value, label, arrow] of [
    ["0001", "January", "Previous month"],
    ["9999", "December", "Next month"],
  ]) {
    await year.selectOption("type");
    await custom.fill(value);
    await popup.getByRole("button", { name: "Go", exact: true }).click();
    await month.selectOption({ label });
    await expect(popup.getByRole("button", { name: arrow })).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  await expectSchedule(page, "Start date", "1904-02-29");
});

test("receipt, type and spacing resolve from the Fold theme in each appearance", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/design-system#feedback`);
  const trigger = page.getByRole("button", { name: "Show confirmation" });
  await expect(trigger).toBeVisible();
  for (const theme of ["Light", "Dark", "Outdoor"]) {
    await chooseAppearance(page, theme);
    await trigger.press("Enter");
    const receipt = page.getByRole("dialog", { name: "Sample changes saved." });
    const field = page.getByRole("textbox", {
      name: "Start date",
      exact: true,
    });
    await expect(receipt).toBeVisible();
    const label = await field.evaluate((el) => getComputedStyle(el).color);
    const surface = await field.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await expect(receipt).toHaveCSS("background-color", label);
    await expect(receipt).toHaveCSS("color", surface);
    const close = receipt.getByRole("button", { name: "Dismiss notification" });
    await expect(close).toHaveCSS("color", surface);
    const typography = await field.evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    expect(typography).toContain("Source Sans 3");
    await expect(receipt).toHaveCSS("font-family", typography);
    await expect(
      page.getByRole("heading", { name: "Text fields", exact: true }),
    ).toHaveCSS("font-family", /Bricolage Grotesque/);
    await expect(receipt).toHaveCSS("column-gap", "8px");
    await expect(receipt).toHaveCSS("opacity", "1");
    await checkAccessibility(page, '[data-slot="receipt-toast"]');
    await close.click();
  }
});

test("one masked textbox advances through date and time, supports editing and pasting", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/design-system#fields`);
  const date = page.getByRole("textbox", { name: "Start date", exact: true });
  const time = page.getByRole("textbox", { name: "Start time", exact: true });
  await date.focus();
  await expect(date).toHaveValue("YYYY-MM-DD");
  await date.pressSequentially("202");
  await expect(date).toHaveValue("202Y-MM-DD");
  await date.press("Tab");
  await expect(
    page.getByRole("button", { name: "Choose start date" }),
  ).toBeFocused();
  await expect(date).toHaveAccessibleDescription(/four-digit year/);
  await page.keyboard.press("Shift+Tab");
  await expect(date).toBeFocused();
  await fillSchedule(page, "Start date", "1900");
  await expect(date).toHaveValue("1900-MM-DD");
  await date.pressSequentially("13");
  await expect(date).toHaveValue("1900-13-DD");
  await expect(date).toHaveAccessibleDescription(/month from 01 to 12/);
  await date.press("ControlOrMeta+a");
  await date.press("ArrowLeft");
  for (let i = 0; i < 5; i++) await date.press("ArrowRight");
  await date.pressSequentially("0229");
  await expect(date).toHaveValue("1900-02-29");
  await expect(date).toHaveAccessibleDescription(/day from 01 to 28/);
  await date.press("ControlOrMeta+a");
  await date.press("ArrowLeft");
  await date.pressSequentially("2000");
  await expect(date).toHaveValue("2000-02-29");
  await expect(date).not.toHaveAttribute("aria-invalid", "true");
  await time.focus();
  await time.pressSequentially("24");
  await expect(time).toHaveValue("24:MM");
  await expect(time).toHaveAccessibleDescription(/hour from 00 to 23/);
  await fillSchedule(page, "Start time", "0060");
  await expect(time).toHaveAccessibleDescription(/minute from 00 to 59/);
  for (const [field, value] of [
    [date, "2024-02-29"],
    [time, "23:59"],
  ] as const) {
    const source = page.getByLabel("Journey name");
    await source.fill(value);
    await source.press("ControlOrMeta+a");
    await source.press("ControlOrMeta+c");
    await field.press("ControlOrMeta+v");
    await expect(field).toHaveValue(value);
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
  }
  await time.press("ControlOrMeta+a");
  await time.press("ArrowRight");
  await time.press("Backspace");
  await expect(time).toHaveValue("23:5M");
  await time.press("Tab");
  await expect(time).toHaveValue("23:05");
  await fillSchedule(page, "Start time", "");
  await expect(time).toHaveValue("HH:MM");
  await expect(time).not.toHaveAttribute("aria-invalid", "true");
});

test("sample state and focus survive save, discard, retry and add", async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(`${origin}/design-system#actions`);
  const preview = page.getByLabel("Preview state");
  const save = page.getByRole("button", { name: "Save moment" });
  await save.press("Enter");
  const saved = page.getByRole("button", { name: "Saved", exact: true });
  await expect(saved).toBeFocused();
  await expect(saved).toBeDisabled();
  await expect(preview).toHaveValue("Saved");
  await page.getByText("Sizes and destructive action", { exact: true }).click();
  const discard = page.getByRole("button", { name: "Discard saved sample" });
  await discard.press("Enter");
  await expect(discard).toBeFocused();
  await expect(discard).toHaveCSS("opacity", "0.55");
  const disabledFace = await discard.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await discard.hover();
  await expect(discard).toHaveCSS("background-color", disabledFace);
  await expect(discard).toHaveCSS("cursor", "not-allowed");
  await expect(preview).toHaveValue("Ready");
  await preview.selectOption("Saved");
  await expect(discard).toBeEnabled();
  const queue = page.getByLabel("Queue state");
  for (const [before, action, after] of [
    ["Interrupted", "Retry sample", "Uploading"],
    ["Empty", "Add sample", "Ready"],
  ]) {
    await queue.selectOption(before);
    await page.getByRole("button", { name: action }).press("Enter");
    await expect(queue).toBeFocused();
    await expect(queue).toHaveValue(after);
  }
});

test("enlarged overlay content and calendar values fit a narrow viewport", async ({
  page,
}) => {
  await serveFixture(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${origin}/design-system`);
  await page.getByRole("button", { name: "Colour", exact: true }).waitFor();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  for (const [trigger, title] of [
    ["Colour", "Colour"],
    ["Typography", "Typography"],
    ["Spacing", "Spacing"],
    ["Find a component", "Find a component"],
    ["Open dialog", "Visibility preview"],
    ["Open sheet", "Row details"],
  ]) {
    await page.getByRole("button", { name: trigger, exact: true }).click();
    const popup = page.getByRole("dialog", { name: title, exact: true });
    await expect(popup).toBeVisible();
    expect(
      await popup.evaluate((el) => el.scrollWidth - el.clientWidth),
      title,
    ).toBeLessThanOrEqual(1);
    const heading = popup.getByRole("heading", { name: title, exact: true });
    const headingFits = await heading.evaluate((el) => {
      const text = el.firstChild;
      if (!text?.textContent) return false;
      return Array.from(text.textContent.matchAll(/\S+/g)).every((match) => {
        const range = document.createRange();
        range.setStart(text, match.index);
        range.setEnd(text, match.index + match[0].length);
        return range.getClientRects().length === 1;
      });
    });
    expect(headingFits, title).toBe(true);
    await page.keyboard.press("Escape");
  }
  const input = page.getByRole("textbox", { name: "Start date", exact: true });
  await fillSchedule(page, "Start date", "2028-11-22");
  expect(
    await input.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  const trigger = page.getByRole("button", { name: "Choose start date" });
  expect(
    await trigger.evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(1);
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "Start date", exact: true });
  const month = popup.getByLabel("Month", { exact: true });
  const year = popup.getByLabel("Year", { exact: true });
  const day = popup.getByLabel("Day", { exact: true });
  await expect(day).toBeFocused();
  for (const select of [month, year, day]) {
    expect(
      await select.evaluate((el: HTMLSelectElement) => {
        const cs = getComputedStyle(el);
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return false;
        ctx.font = cs.font;
        const label = el.selectedOptions[0]?.textContent ?? "";
        return (
          ctx.measureText(label).width +
            parseFloat(cs.paddingLeft) +
            parseFloat(cs.paddingRight) +
            16 <=
          el.clientWidth
        );
      }),
    ).toBe(true);
  }
  await year.selectOption("type");
  await popup.getByRole("textbox", { name: "Enter year" }).fill("0000");
  await expect(popup.getByRole("button", { name: "Use date" })).toBeDisabled();
  await popup.getByRole("textbox", { name: "Enter year" }).fill("2028");
  await expect(day).toBeDisabled();
  await popup.getByRole("button", { name: "Go", exact: true }).click();
  await month.selectOption({ label: "February" });
  await day.selectOption("29");
  await expectSchedule(page, "Start date", "2028-11-22");
  await popup.getByRole("button", { name: "Use date" }).press("Enter");
  await expectSchedule(page, "Start date", "2028-02-29");
  await expect(trigger).toBeFocused();
});

test("catalog toolbar stays reachable and the index follows reading and explicit destinations", async ({
  page,
}) => {
  await serveFixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/design-system#overview`);
  const index = page.getByRole("navigation", { name: "Catalog sections" });
  const main = page.getByRole("main");
  await expect(page.getByRole("banner")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0);
  for (const name of [
    "Feedback",
    "Icons, illustration & loading",
    "Navigation",
  ]) {
    const link = index.getByRole("link", { name, exact: true });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "location");
  }
  const pos = await main.boundingBox();
  if (!pos) throw Error("Catalog has no scroll region");
  await page.mouse.move(pos.x + 30, pos.y + 60);
  await page.mouse.wheel(0, 10000);
  await expect(
    index.getByRole("link", { name: "Rows & cards" }),
  ).toHaveAttribute("aria-current", "location");
  const find = page.getByRole("button", { name: "Find a component" });
  await expect(find).toBeInViewport();
  for (const [query, name, id, section] of [
    ["tooltip", "About action sizes", "action-tooltip", "Buttons"],
    ["saving", "Button preview state", "button-preview-state", "Buttons"],
    [
      "read only",
      "Read-only and disabled fields",
      "field-availability",
      "Text fields",
    ],
    ["disabled", "Disabled choices", "choice-availability", "Selection"],
  ]) {
    await find.click();
    await page.getByRole("searchbox").fill(query);
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.locator(`#${id}`)).toBeFocused();
    await expect(
      index.getByRole("link", { name: section, exact: true }),
    ).toHaveAttribute("aria-current", "location");
  }
});

test("collapsed selection and expanded menu remain visible with forced colors and reduced motion", async ({
  page,
}) => {
  await serveFixture(page);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto(`${origin}/design-system#overlays`);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const current = page
    .getByRole("navigation", { name: "Catalog sections" })
    .locator("[aria-current]");
  await expect(current).toHaveCSS("border-inline-start-style", "solid");
  await expect(current).toHaveCSS("border-inline-start-width", "3px");
  const sort = page.getByRole("button", { name: "Sort moments" });
  await sort.click();
  await expect(sort.locator("[data-menu-chevron]")).toHaveCSS(
    "rotate",
    "180deg",
  );
  await expect(sort.locator("[data-menu-chevron]")).toHaveCSS(
    "transition-duration",
    "0s",
  );
});
