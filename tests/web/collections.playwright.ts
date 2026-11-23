import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chooseAppearance } from "./appearance-fixture";
import { origin, serveFixture } from "./site-fixture";

test("Discover keeps retry focus and routes to the user's journeys", async ({
  page,
}) => {
  const first = Promise.withResolvers<number>();
  const second = Promise.withResolvers<number>();
  let requests = 0;
  await serveFixture(
    page,
    () => (requests++ === 0 ? first.promise : second.promise),
    true,
  );
  await page.goto(`${origin}/discover`);
  await expect(page.getByText("Checking availability")).toBeVisible();
  first.resolve(503);

  const retry = page.getByRole("button", { name: "Try again" });
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t connect to Kairn",
  );
  await retry.press("Enter");
  const waiting = page.getByRole("button", { name: "Trying again…" });
  await expect(waiting).toBeFocused();
  await expect(waiting).toHaveAttribute("aria-busy", "true");
  second.resolve(200);
  await expect(
    page.getByRole("heading", { name: "No published journeys yet" }),
  ).toBeFocused();
  await page.getByRole("link", { name: "Open Journeys" }).press("Enter");
  await expect(page).toHaveURL(`${origin}/journeys`);
  await expect(
    page.getByRole("heading", { name: "Journeys", level: 1 }),
  ).toBeFocused();
});

test("Saved leads to Discover and both layouts fit large text in every appearance", async ({
  page,
}) => {
  await serveFixture(page, undefined, true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin}/saved`);
  for (const appearance of ["Light", "Dark", "Outdoor"]) {
    await expect(
      page.getByRole("heading", { name: "Nothing saved yet" }),
    ).toBeVisible();
    await chooseAppearance(page, appearance);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await expect(
      page.getByRole("heading", { name: "Nothing saved yet" }),
    ).toBeVisible();
    await expect(page.getByText(/your private collection/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("link", { name: "Browse Discover" }).press("Enter");
    await expect(page).toHaveURL(`${origin}/discover`);
    await expect(
      page.getByRole("heading", { name: "Discover", level: 1 }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "No published journeys yet" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("link", { name: "Saved", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/saved`);
    await page.reload();
  }
});
