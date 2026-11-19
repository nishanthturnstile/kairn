import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { mailLink, site } from "./identity-fixture";

const password = "Synthetic-browser-password";

test("browser account flows verify email, revoke another session, and reset the password", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.KAIRN_WEB_IDENTITY !== "1",
    "Requires the local server, web, worker and Mailpit.",
  );
  test.setTimeout(80_000);
  const email = `browser-${randomUUID()}@example.test`;
  await page.goto(`${site}/account`);
  await page.getByRole("button", { name: "Create account" }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Synthetic browser account");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Check your inbox for a verification link."),
  ).toBeVisible();
  await page.goto(await mailLink(email, "Verify your Kairn email"));
  await expect(
    page.getByText("Your email is verified. You can sign in now."),
  ).toBeVisible();

  const other = await browser.newContext();
  try {
    const login = await other.request.post(`${site}/api/auth/sign-in/email`, {
      headers: { Origin: site },
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Revoke device" }).click();
    await expect(
      page.getByText("Device signed out. Recovery confirmation is pending."),
    ).toBeVisible();
    expect(
      await other.request
        .get(`${site}/api/auth/get-session`)
        .then((response) => response.json()),
    ).toBeNull();
  } finally {
    await other.close();
  }

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await page.goto(await mailLink(email, "Reset your Kairn password"));
  await page.getByLabel("New password").fill("Synthetic-browser-replacement");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByText(
      "Password changed and devices signed out. Recovery confirmation is pending.",
    ),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("token")).toBe(false);
});
