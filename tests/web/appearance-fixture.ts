import type { Page } from "@playwright/test";

export async function chooseAppearance(page: Page, label: string) {
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Appearance" })
    .getByRole("button", { name: label, exact: true })
    .click();
}
