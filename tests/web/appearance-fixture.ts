import { expect, type Page } from "@playwright/test";
import { openWorkspaceAccountMenu } from "./workspace-fixture";

export async function chooseAppearance(page: Page, label: string) {
  const standalone = page.getByRole("button", {
    name: /^Appearance(?:$|: )/,
  });
  if (!(await standalone.isVisible())) {
    const menu = await openWorkspaceAccountMenu(page);
    await menu.getByRole("menuitem", { name: /^Appearance / }).click();
  } else {
    await standalone.click();
  }
  const choices = page.getByRole("dialog", { name: "Appearance" });
  await choices.getByRole("button", { name: label, exact: true }).click();
  await expect(choices).toBeHidden();
}
