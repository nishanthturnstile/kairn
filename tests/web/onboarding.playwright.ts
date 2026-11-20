import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { chooseAppearance } from "./appearance-fixture";
import { mailLink, site } from "./identity-fixture";
import { openAccount } from "./workspace-fixture";

const password = "Synthetic-onboarding-password";
const checkpointPath = "**/api/v1/onboarding";

function fixtureAddress(browserName: string, client = 18) {
  const engine = ["chromium", "firefox", "webkit"].indexOf(browserName) + 1;
  return `198.${client}.${engine}.${(test.info().line % 253) + 1}`;
}

test.beforeEach(async ({ context, browserName }) => {
  await context.setExtraHTTPHeaders({
    "X-Forwarded-For": fixtureAddress(browserName),
  });
});

test.skip(
  process.env.KAIRN_WEB_ONBOARDING !== "1",
  "Requires the local service-backed onboarding suite.",
);

async function newAccount(page: Page) {
  const email = `onboarding-${randomUUID()}@example.test`;
  await page.getByRole("button", { name: "Create account" }).click();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic first-run account");
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
  return email;
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("reuses the signup name and resumes setup before creating a first planned journey", async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(75_000);
  const requestedArt: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/assets/onboarding"))
      requestedArt.push(request.url());
  });
  await page.goto(`${site}/`);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(requestedArt).toEqual([]);
  const email = await newAccount(page);
  await signIn(page, email);
  await expect(
    page.getByRole("heading", { name: "Welcome to Kairn" }),
  ).toBeFocused();
  await expect(page.locator(".onboarding-photo")).toHaveJSProperty(
    "naturalWidth",
    1152,
  );
  const pendingStory = await page.request.get(`${site}/read/example`, {
    maxRedirects: 0,
  });
  expect(pendingStory.status()).toBe(303);
  expect(pendingStory.headers().location).toBe("/onboarding");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByText("Synthetic first-run account")).toBeVisible();
  await page.getByRole("button", { name: "Edit name", exact: true }).click();
  const displayName = page.getByLabel("Display name", { exact: true });
  await expect(displayName).toBeFocused();
  await expect(displayName).toHaveValue("Synthetic first-run account");
  await displayName.fill("Anu Rao");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByText("Display name saved.")).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Anu Rao", { exact: true }),
  ).toBeVisible();

  await page.route(
    checkpointPath,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Couldn’t save your progress. Try again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const intentHeading = page.getByRole("heading", {
    name: "What would you like to do first?",
  });
  await expect(intentHeading).toBeFocused();

  const other = await browser.newContext();
  try {
    const otherSignIn = await other.request.post(
      `${site}/api/auth/sign-in/email`,
      {
        headers: {
          Origin: site,
          "X-Forwarded-For": fixtureAddress(browserName, 19),
        },
        data: { email, password },
      },
    );
    expect(otherSignIn.status()).toBe(200);
    const otherPage = await other.newPage();
    await otherPage.goto(`${site}/dashboard`);
    await expect(otherPage.getByText("Step 2 of 2")).toBeVisible();
    await otherPage.getByRole("button", { name: "Back", exact: true }).click();
    await expect(otherPage.getByText("Anu Rao", { exact: true })).toBeVisible();
  } finally {
    await other.close();
  }

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await openAccount(page);
  await expect(page.getByRole("link", { name: "Resume setup" })).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Anu Rao", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, email);
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await page
    .getByRole("radio", { name: "Plan a journey", exact: true })
    .check();
  await page.getByRole("button", { name: "Go to Dashboard" }).click();
  await expect(page).toHaveURL(`${site}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Plan your first journey" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Plan a journey", exact: true }).click();
  await expect(
    page.getByText("Enter the planned start in the journey’s local time.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save journey", exact: true }),
  ).toHaveAccessibleDescription(
    "Only you can see this journey when you save it.",
  );

  await page.getByLabel("Title", { exact: true }).fill("Konkan in December");
  await page.getByLabel("Start date", { exact: true }).fill("2090-12-12");
  await page.getByLabel("Start time", { exact: true }).fill("09:00");
  await page.getByLabel("Timezone", { exact: true }).fill("Asia/Kolkata");
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Konkan in December" }),
  ).toBeVisible();
  const created = new URL(page.url()).pathname;
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText([
    "Dashboard",
    "Journeys",
    "Discover",
    "Saved",
  ]);
  await nav.getByRole("link", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("region", { name: "Next journey" }).getByRole("link"),
  ).toHaveAttribute("href", created);
  await expect(
    page.getByRole("region", { name: "Overview" }).locator("dd"),
  ).toHaveText(["1", "1"]);
});

test("keeps an explicit journey return and consumes it after two steps", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.goto(`${site}/journeys/new`);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const email = await newAccount(page);
  await signIn(page, email);
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Look around" })).toBeChecked();
  await page
    .getByRole("button", { name: "Continue to journey creation" })
    .click();
  await expect(page).toHaveURL(`${site}/journeys/new`);
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await openAccount(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, email);
  await expect(page).toHaveURL(`${site}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Your journeys start here" }),
  ).toBeVisible();
});

test("keeps older accounts exempt and reflows both steps and the past-journey handoff", async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(75_000);
  await page.goto(`${site}/account`);
  const email = await newAccount(page);
  const older = await browser.newContext();
  try {
    expect(
      (
        await older.request.post(`${site}/api/auth/sign-in/email`, {
          headers: {
            Origin: site,
            "X-Forwarded-For": fixtureAddress(browserName, 19),
          },
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await older.close();
  }
  await signIn(page, email);
  await expect(page).toHaveURL(`${site}/dashboard`);
  await openAccount(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const eligible = await newAccount(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, eligible);
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  async function assertAccessibleReflow() {
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(320);
    if (browserName !== "firefox") {
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  }
  for (const appearance of ["Light", "Dark", "Outdoor"]) {
    await chooseAppearance(page, appearance);
    await assertAccessibleReflow();
  }
  await expect(page.locator(".onboarding-photo")).toHaveCSS(
    "animation-duration",
    "0s",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await assertAccessibleReflow();
  const record = page.getByRole("radio", {
    name: "Record a past journey",
    exact: true,
  });
  await record.focus();
  await record.press("Space");
  await expect(record).toBeChecked();
  await page.getByRole("button", { name: "Go to Dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Record a journey you’ve taken" }),
  ).toBeVisible();
  await assertAccessibleReflow();
  await page
    .getByRole("link", { name: "Record a past journey", exact: true })
    .click();
  await expect(
    page.getByText("Enter the start in the journey’s local time.", {
      exact: false,
    }),
  ).toBeVisible();
  await assertAccessibleReflow();
});
