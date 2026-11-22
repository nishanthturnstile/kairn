import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});

for (const appearance of ["Light", "Dark", "Outdoor"] as const) {
  test(`route gaps and estimated connections in ${appearance}`, async ({
    page,
  }) => {
    const file = resolve("tests/fixtures/design-evidence/foundations.html");
    await page.goto(pathToFileURL(file).href);
    await page.getByLabel("Appearance").selectOption(appearance);
    await page.evaluate(() => document.fonts.ready);

    // Compare the evidence drawing. Text and native controls have separate accessibility checks.
    const route = page.getByRole("img", {
      name: /two recorded sections with a gap/i,
    });
    await expect(route).toHaveScreenshot(
      `route-${appearance.toLowerCase()}.png`,
      {
        animations: "disabled",
        scale: "css",
        maxDiffPixels: 8,
      },
    );
  });
}
