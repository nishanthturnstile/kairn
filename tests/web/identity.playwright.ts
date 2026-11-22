import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { wcagAATags } from "./accessibility";
import { mailLink, site } from "./identity-fixture";
import { openAccount } from "./workspace-fixture";

const password = "Synthetic-browser-password";

test("browser account flows verify email, revoke another session, and reset the password", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    process.env.KAIRN_WEB_IDENTITY !== "1",
    "Requires the local server, web, worker and Mailpit.",
  );
  test.setTimeout(80_000);
  const client = testInfo.repeatEachIndex + 1;
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": `198.18.0.${client}`,
  });
  const email = `browser-${randomUUID()}@example.test`;
  const guestStory = await page.request.get(`${site}/read/example`, {
    maxRedirects: 0,
  });
  expect(guestStory.status()).toBe(303);
  expect(guestStory.headers().location).toBe("/account");
  expect(guestStory.headers()["cache-control"]).toBe("private, no-store");
  expect(await guestStory.text()).not.toContain("Story unavailable");
  await page.goto(`${site}/account`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Create account" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Kairn", exact: true }).click();
  await expect(page).toHaveURL(`${site}/account`);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic browser account");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    password,
  );
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Check your inbox for a verification link."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resend verification" }),
  ).toBeVisible();
  await page.goto(await mailLink(email, "Verify your Kairn email"));
  const verificationMessage = "Your email is verified. You can sign in now.";
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    verificationMessage,
  );
  const signInHeading = page.getByRole("heading", { name: "Sign in" });
  await expect(signInHeading).toBeFocused();
  await expect(signInHeading).toHaveAccessibleDescription(verificationMessage);

  const other = await browser.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": `198.18.1.${client}` },
  });
  try {
    const login = await other.request.post(`${site}/api/auth/sign-in/email`, {
      headers: { Origin: site },
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    const verifiedStory = await page.request.get(`${site}/read/example`, {
      maxRedirects: 0,
    });
    expect(verifiedStory.status()).toBe(404);
    expect(await verifiedStory.text()).toContain("Story unavailable");
    await openAccount(page);
    const profile = page.getByRole("region", { name: "Profile" });
    const devices = page.getByRole("region", { name: "Signed-in devices" });
    await expect(profile.getByText(email, { exact: true })).toBeVisible();
    await expect(profile.getByText("Verified", { exact: true })).toBeVisible();
    const current = devices.getByRole("listitem").first();
    await expect(current).toContainText("This device");
    await expect(
      current.getByRole("button", { name: "Revoke device" }),
    ).toHaveCount(0);
    await profile.getByRole("button", { name: "Edit name" }).click();
    const displayName = profile.getByRole("textbox", { name: "Display name" });
    await expect(displayName).toBeFocused();
    await displayName.fill("Rhea Mehta");
    await profile.getByRole("button", { name: "Save name" }).click();
    await expect(
      profile.getByText("Rhea Mehta", { exact: true }),
    ).toBeVisible();
    if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
      await page.screenshot({
        path: testInfo.outputPath("account-desktop.png"),
        animations: "disabled",
      });

    const originalSize = page.viewportSize();
    if (!originalSize) throw new Error("The account test requires a viewport.");
    await page.setViewportSize({ width: 320, height: 840 });
    const largeText = await page.addStyleTag({
      content: "html { font-size: 200% !important; }",
    });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(320);
    expect(
      (await new AxeBuilder({ page }).withTags(wcagAATags).analyze())
        .violations,
    ).toEqual([]);
    if (process.env.KAIRN_CAPTURE_DASHBOARD === "1")
      await page.screenshot({
        path: testInfo.outputPath("account-mobile-large-text.png"),
        fullPage: true,
        animations: "disabled",
      });
    await largeText.evaluate((style) => style.remove());
    await page.setViewportSize(originalSize);
    await page.getByRole("link", { name: "Kairn", exact: true }).click();
    await expect(page).toHaveURL(`${site}/dashboard`);
    await openAccount(page);
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

  const sameSession = await page.context().newPage();
  const sessionEndpoint = `${site}/api/auth/get-session`;
  const releaseSessionChecks = Promise.withResolvers<void>();
  let sessionChecks = 0;
  try {
    await sameSession.goto(`${site}/saved`);
    await expect(
      sameSession.getByRole("heading", { name: "Saved", exact: true }),
    ).toBeVisible();
    // Hold the initiating tab's session checks while the other tab signs out.
    await page.route(sessionEndpoint, async (route) => {
      sessionChecks++;
      await releaseSessionChecks.promise;
      await route.continue();
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect.poll(() => sessionChecks).toBeGreaterThanOrEqual(2);
    await expect(
      sameSession.getByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText("Signing out", { exact: true }),
    ).toBeVisible();
    releaseSessionChecks.resolve();
    const toast = page.getByRole("dialog", { name: "You’re signed out." });
    await expect(toast).toBeVisible();
    await expect(
      page.getByRole("main").getByText("You’re signed out."),
    ).toHaveCount(0);
    await expect(
      sameSession.getByRole("navigation", { name: "Main" }),
    ).toHaveCount(0);
    await expect(toast).toBeHidden({ timeout: 7_000 });
  } finally {
    releaseSessionChecks.resolve();
    await page.unroute(sessionEndpoint);
    await sameSession.close();
  }
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

  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t sign in. Check your email and password.",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-browser-replacement");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${site}/dashboard`);
});
