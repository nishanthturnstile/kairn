import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { wcagAATags } from "./accessibility";
import { origin, serveFixture } from "./site-fixture";

test("verification recovery preserves the email and gives each step a focus destination", async ({
  page,
}) => {
  await serveFixture(page);
  await page.route("**/api/auth/send-verification-email", (route) =>
    route.fulfill({ json: { status: true } }),
  );
  await page.goto(
    `${origin}/account?verification=confirmed&error=TOKEN_EXPIRED`,
  );
  await expect(
    page.getByRole("heading", { name: "Verification link unavailable" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Resend verification" }).click();
  await expect(
    page.getByRole("heading", { name: "Resend verification" }),
  ).toBeFocused();
  const email = "traveller-with-an-extra-long-address@example.test";
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send verification link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeFocused();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toHaveAccessibleDescription(/If that account needs verification/);
  await expect(
    page.getByText(/If that account needs verification/),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 760 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  expect(
    (await new AxeBuilder({ page }).withTags(wcagAATags).analyze()).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Change email address" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(email);
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("Your email is verified. You can sign in now."),
  ).toHaveCount(0);
});

test("an expired reset token moves to a fresh-link action and leaves the URL clean", async ({
  page,
}) => {
  await serveFixture(page);
  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({
      status: 400,
      json: { code: "INVALID_TOKEN", message: "Invalid token" },
    }),
  );
  await page.route("**/api/auth/request-password-reset", (route) =>
    route.fulfill({ json: { status: true } }),
  );
  await page.goto(`${origin}/account/reset?token=fixture`);
  await expect(page).toHaveURL(`${origin}/account/reset`);
  await page
    .getByLabel("New password", { exact: true })
    .fill("synthetic-password-for-test");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset link unavailable" }),
  ).toBeFocused();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Request a new link" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset password" }),
  ).toBeFocused();
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeFocused();
  await expect(
    page.getByText(
      "If that account can receive a reset email, check your inbox.",
    ),
  ).toBeVisible();
});

test("a late sign-in rejection stays with the attempt that started it", async ({
  page,
}) => {
  await serveFixture(page);
  const release = Promise.withResolvers<void>();
  await page.route("**/api/auth/sign-in/email", async (route) => {
    await release.promise;
    await route.fulfill({
      status: 403,
      json: { code: "EMAIL_NOT_VERIFIED", message: "Email is not verified" },
    });
  });
  await page.goto(`${origin}/account?mode=sign-up`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-password-for-test");
  const request = page.waitForRequest("**/api/auth/sign-in/email");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try {
    await request;
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Create account" }),
    ).toBeFocused();
  } finally {
    release.resolve();
  }
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Verify your email before signing in."),
  ).toHaveCount(0);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "fixture@example.test",
  );
});

test("password reset confirms completion when another account stays signed in", async ({
  page,
}) => {
  await serveFixture(page);
  const session = Promise.withResolvers<void>();
  await page.route("**/api/auth/get-session", async (route) => {
    await session.promise;
    await route.fulfill({
      json: {
        user: {
          id: "250dbeb0-da94-4de9-a164-cadaa8d2d6bd",
          email: "other@example.test",
          emailVerified: true,
        },
      },
    });
  });
  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({
      status: 202,
      json: { status: true, confirmation: "pending" },
    }),
  );
  await page.goto(`${origin}/account/reset?token=fixture`);
  try {
    await expect(page.getByText("Checking your session")).toBeVisible();
  } finally {
    session.resolve();
  }
  await expect(page).toHaveURL(`${origin}/account/reset`);
  await page
    .getByLabel("New password", { exact: true })
    .fill("synthetic-password-for-test");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByRole("heading", { name: "Password changed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to Account" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    /Recovery confirmation is pending/,
  );
  await expect(page).toHaveURL(`${origin}/account/reset`);
});

test("sign-out explains a rejected origin and checks that the session ended before confirming", async ({
  page,
}) => {
  await serveFixture(page);
  let signedIn = true;
  let attempts = 0;
  await page.route("**/api/auth/get-session", (route) => {
    if (attempts === 3)
      return route.fulfill({
        status: 503,
        json: { message: "Session check unavailable" },
      });
    return route.fulfill({
      json: signedIn
        ? {
            user: {
              id: "250dbeb0-da94-4de9-a164-cadaa8d2d6bd",
              name: "Fixture",
              email: "fixture@example.test",
              emailVerified: true,
            },
          }
        : null,
    });
  });
  await page.route("**/api/auth/devices", (route) =>
    route.fulfill({
      json: { currentDeviceId: "fixture", devices: [], pendingRestrictions: 0 },
    }),
  );
  await page.route("**/api/v1/profile", (route) =>
    route.fulfill({
      json: { displayName: "Fixture", inviteDiscoverable: false },
    }),
  );
  await page.route("**/api/auth/sign-out", (route) => {
    attempts += 1;
    if (attempts === 1)
      return route.fulfill({
        status: 403,
        json: { code: "INVALID_ORIGIN", message: "Invalid origin" },
      });
    if (attempts === 4) signedIn = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.goto(`${origin}/account`);
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await signOut.click();
  await expect(
    page.getByText(/Couldn’t sign out from this address/),
  ).toBeVisible();
  await signOut.click();
  await expect(
    page.getByText("Couldn’t sign out. Try again.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "You’re signed out." }),
  ).toHaveCount(0);
  await signOut.click();
  await expect(
    page.getByRole("heading", { name: "Sign-out unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "You’re signed out." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("dialog", { name: "You’re signed out." }),
  ).toBeVisible();
  expect(attempts).toBe(4);
});
