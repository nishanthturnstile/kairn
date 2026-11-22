import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function openSpecimen(page: Page, name: string) {
  await page.goto(
    pathToFileURL(resolve("tests/fixtures/design-evidence", name)).href,
  );
  await page.evaluate(() => document.fonts.ready);
}

test.use({ viewport: { width: 320, height: 800 }, reducedMotion: "reduce" });

for (const name of ["foundations.html", "components.html", "flows.html"]) {
  test(`${name} reflows at a narrow width with enlarged text`, async ({
    page,
  }) => {
    await openSpecimen(page, name);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("route evidence is available as text in each appearance", async ({
  page,
}) => {
  await openSpecimen(page, "foundations.html");
  for (const mode of ["Light", "Dark", "Outdoor"]) {
    await page.getByLabel("Appearance").selectOption(mode);
    await expect(
      page.getByRole("img", {
        name: /two recorded sections with a gap.+estimated/i,
      }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

test("withdrawing the fare removes its amount from the accessible member view", async ({
  page,
}) => {
  await openSpecimen(page, "components.html");
  const member = page.getByRole("article", { name: "Member’s Learn view" });
  const scenario = page.getByRole("combobox", { name: "Source state" });
  await scenario.selectOption("published");
  expect(await member.ariaSnapshot()).toContain("₹2,400");
  await scenario.selectOption("withdrawn");
  expect(await member.ariaSnapshot()).not.toContain("₹2,400");
  await expect(page.locator("[aria-live=polite]")).toContainText("withdrew");
});

test("keyboard review returns focus and retains the proposed caption", async ({
  page,
}) => {
  await openSpecimen(page, "flows.html");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Resolution")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Proposed caption")).toBeFocused();
  await page.keyboard.type("Retained wording");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Save to shared draft" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Resume comparison" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Resolution")).toBeFocused();
  await expect(page.getByLabel("Proposed caption")).toHaveValue(
    /Retained wording/,
  );
});
