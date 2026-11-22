import { expect, type Page } from "@playwright/test";

type ScheduleLabel = "Start date" | "Start time" | "End date" | "End time";

export async function fillSchedule(
  page: Page,
  label: ScheduleLabel,
  value: string,
) {
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.press("ControlOrMeta+a");
  if (value) await field.pressSequentially(value.replace(/[-:]/g, ""));
  else await field.press("Backspace");
}

export async function expectSchedule(
  page: Page,
  label: ScheduleLabel,
  display: string,
) {
  await expect(
    page.getByRole("textbox", { name: label, exact: true }),
  ).toHaveValue(display);
}
