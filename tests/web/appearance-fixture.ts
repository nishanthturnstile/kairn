import type { Page } from "@playwright/test";
import { openWorkspaceAccountMenu } from "./workspace-fixture";

export async function chooseAppearance(page: Page, label: string) {
  const standalone = page.getByRole("button", {
    name: /^Appearance(?:$|: )/,
  });
  if (!(await standalone.isVisible())) {
    const menu = await openWorkspaceAccountMenu(page);
    await menu.getByRole("menuitemradio", { name: label, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
    if (await drawer.isVisible())
      await drawer.getByRole("button", { name: "Close", exact: true }).click();
    return;
  }
  await standalone.click();
  await page
    .getByRole("dialog", { name: "Appearance" })
    .getByRole("button", { name: label, exact: true })
    .click();
}
