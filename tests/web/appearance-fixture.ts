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
  await settleAppearance(page);
}

export async function settleAppearance(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((transition) => transition.finished),
    );
  });
}
