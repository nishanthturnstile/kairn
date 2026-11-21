import type { Page } from "@playwright/test";

export async function openWorkspaceAccountMenu(page: Page) {
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  if (await openNavigation.isVisible()) await openNavigation.click();
  await page.getByRole("button", { name: /account menu$/i }).click();
  return page.getByRole("menu", { name: "Account menu" });
}

export async function openAccount(page: Page) {
  const setupAccount = page.getByRole("link", { name: "Account", exact: true });
  if (await setupAccount.isVisible()) {
    await setupAccount.click();
    return;
  }
  const menu = await openWorkspaceAccountMenu(page);
  await menu.getByRole("menuitem", { name: "Account", exact: true }).click();
}
