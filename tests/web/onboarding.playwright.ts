import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { chooseAppearance } from "./appearance-fixture";
import { mailLink, site } from "./identity-fixture";
import { fillSchedule } from "./schedule-fixture";
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

async function viewer(page: Page) {
  const { user } = await (
    await page.request.get(`${site}/api/auth/get-session`)
  ).json();
  return { Origin: site, "X-Expected-Account": String(user.id) };
}

test("reuses the signup name and resumes setup before creating a first planned journey", async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(75_000);
  const requestedArt: string[] = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "image" &&
      new URL(request.url()).pathname.startsWith("/assets/onboarding")
    )
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
  await expect(page.locator(".onboarding-art")).toBeVisible();
  await expect.poll(() => requestedArt.length).toBeGreaterThan(0);
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
  await page.route(checkpointPath, (route) =>
    route.fulfill({ status: 503, json: { code: "unavailable" } }),
  );
  const backgroundCheck = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/onboarding") &&
      response.request().method() === "GET" &&
      response.status() === 503,
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await backgroundCheck;
  await expect(displayName).toHaveValue("Anu Rao");
  await page.unroute(checkpointPath);
  await page.route(
    "**/api/v1/profile",
    (route) => route.fulfill({ status: 503, json: { code: "unavailable" } }),
    { times: 1 },
  );
  await displayName.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t save your name",
  );
  await expect(displayName).toBeFocused();
  await displayName.press("Enter");
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
  const continueSetup = page.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await continueSetup.focus();
  await continueSetup.press("Enter");
  await expect(
    page.getByText("Couldn’t save your progress. Try again."),
  ).toBeVisible();
  await expect(continueSetup).toBeFocused();
  await expect(continueSetup).toHaveAccessibleDescription(
    "Couldn’t save your progress. Try again.",
  );
  await continueSetup.press("Enter");
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
  await page
    .getByRole("button", { name: "Go to Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(`${site}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Plan your first journey" }),
  ).toBeVisible();
  expect(
    await (
      await page.request.get(`${site}/api/v1/dashboard`, {
        headers: await viewer(page),
      })
    ).json(),
  ).toMatchObject({ journeyCount: 0 });
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
  await fillSchedule(page, "Start date", "2090-12-12");
  await fillSchedule(page, "Start time", "09:00");
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
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Kairn", exact: true }),
  ).toHaveCount(0);
  await openAccount(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(`${site}/onboarding`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Look around" })).toBeChecked();
  await page.route(checkpointPath, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 503, json: { code: "unavailable" } });
  });
  await page
    .getByRole("button", { name: "Go to Dashboard", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t save your progress",
  );
  await page.unroute(checkpointPath);
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

test("honors Dashboard after the final save reply is lost and setup reloads", async ({
  page,
}) => {
  await page.goto(`${site}/journeys/new`);
  const email = await newAccount(page);
  await signIn(page, email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const dashboard = page.getByRole("button", {
    name: "Go to Dashboard",
    exact: true,
  });
  await expect(dashboard).toBeVisible();
  await page.route(checkpointPath, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 503, json: { code: "unavailable" } });
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await dashboard.focus();
  await dashboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t save your progress",
  );
  await expect(dashboard).toBeFocused();
  await page.unroute(checkpointPath);
  await page.reload();
  await expect(page).toHaveURL(`${site}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Your journeys start here" }),
  ).toBeVisible();
});

test("reflows both required steps and the past-journey handoff", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.goto(`${site}/account`);
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
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  const appearances = ["Light", "Dark", "Outdoor"] as const;
  for (const appearance of appearances) {
    await chooseAppearance(page, appearance);
    await assertAccessibleReflow();
  }
  await expect(page.locator(".onboarding-art")).toBeHidden();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  for (const appearance of appearances) {
    await chooseAppearance(page, appearance);
    await assertAccessibleReflow();
  }
  const record = page.getByRole("radio", {
    name: "Record a past journey",
    exact: true,
  });
  await record.focus();
  await record.press("Space");
  await expect(record).toBeChecked();
  await page
    .getByRole("button", { name: "Go to Dashboard", exact: true })
    .click();
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

test("opens Dashboard after two steps and redirects the retired invitation screen", async ({
  page,
}) => {
  await page.goto(`${site}/`);
  const email = await newAccount(page);
  await signIn(page, email);
  const next = page.getByRole("button", { name: "Continue", exact: true });
  await next.click();
  await expect(page.getByRole("radio", { name: "Look around" })).toBeChecked();
  await page
    .getByRole("button", { name: "Go to Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(`${site}/dashboard`);
  await page.goto(`${site}/onboarding/companions`);
  await expect(page).toHaveURL(`${site}/dashboard`);
  await openAccount(page);
  await expect(page.getByText("Resume companion invitations")).toHaveCount(0);
});

async function fillJourney(page: Page, title: string) {
  await page
    .getByRole("link", { name: "Create a journey", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await fillSchedule(page, "Start date", "2090-12-12");
  await fillSchedule(page, "Start time", "09:00");
  await page.getByLabel("Timezone", { exact: true }).fill("Asia/Kolkata");
}

test("can skip inviting after creation and open the saved journey", async ({
  page,
}) => {
  await page.goto(`${site}/`);
  const email = await newAccount(page);
  await signIn(page, email);
  const next = page.getByRole("button", { name: "Continue", exact: true });
  await next.click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await page
    .getByRole("button", { name: "Go to Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(`${site}/dashboard`);
  await fillJourney(page, "Quiet trip");
  const details = page.getByRole("region", { name: "Journey details" });
  const preview = page.getByRole("complementary", { name: "Journey preview" });
  await expect(preview).toContainText("Quiet trip");
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [formBox, previewBox] = await Promise.all([
      details.boundingBox(),
      preview.boundingBox(),
    ]);
    expect(formBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (!formBox || !previewBox) throw new Error("Missing creation layout");
    if (width === 1440) {
      expect(previewBox.x).toBeGreaterThan(formBox.x + formBox.width);
    } else {
      expect(previewBox.y).toBeGreaterThan(formBox.y + formBox.height);
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const heading = page.getByRole("heading", { name: "Invite people" });
  const initialCheck = Promise.withResolvers<void>();
  await page.route(
    /\/api\/v1\/journeys\/[a-f0-9-]+$/,
    async (route) => {
      await initialCheck.promise;
      await route.continue();
    },
    { times: 1 },
  );
  try {
    await page.getByRole("button", { name: "Create & invite people" }).click();
    await expect(heading).toBeFocused();
    await expect(page.getByText("Checking journey access")).toBeInViewport();
  } finally {
    initialCheck.resolve();
  }
  await expect(page.getByText("Quiet trip", { exact: true })).toBeVisible();
  const journey = page.url().replace(/\/invite$/, "");
  expect(page.url()).toBe(`${journey}/invite`);
  const finder = page.getByRole("region", { name: "Add recipients" });
  const recipients = page.getByRole("region", { name: "Recipient list" });
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [finderBox, recipientBox] = await Promise.all([
      finder.boundingBox(),
      recipients.boundingBox(),
    ]);
    if (!finderBox || !recipientBox)
      throw new Error("Missing invitation layout");
    if (width === 1440) {
      expect(recipientBox.x).toBeGreaterThan(finderBox.x + finderBox.width);
    } else {
      expect(recipientBox.y).toBeGreaterThan(finderBox.y + finderBox.height);
    }
    await expect(
      page.getByRole("button", { name: "Send invitations" }),
    ).toBeDisabled();
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "Invite by email" }).click();
  const addressField = page.getByRole("textbox", { name: "Email address" });
  const addEmail = page.getByRole("button", { name: "Add email" });
  for (const email of [
    "draft-first@example.test",
    "draft-second@example.test",
  ]) {
    await addressField.fill(email);
    await addEmail.click();
  }
  await addressField.fill("still-typing@example.test");
  const removeFirst = page.getByRole("button", {
    name: "Remove draft-first@example.test from draft",
  });
  const removeSecond = page.getByRole("button", {
    name: "Remove draft-second@example.test from draft",
  });
  const navigation = await page.evaluate(() => performance.timeOrigin);
  await removeFirst.press("Enter");
  await expect(removeFirst).toHaveCount(0);
  await expect(removeSecond).toBeFocused();
  await expect(recipients.getByRole("status")).toHaveText("1 recipient");
  await expect(addressField).toHaveValue("still-typing@example.test");

  await page.setViewportSize({ width: 320, height: 550 });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const checking = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const journeyId = new URL(journey).pathname.split("/").at(-1);
  await page.route(
    `**/api/v1/journeys/${journeyId}`,
    async (route) => {
      checking.resolve();
      await release.promise;
      await route.continue();
    },
    { times: 1 },
  );
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await checking.promise;
    await expect(heading).toBeVisible();
    await expect(recipients).toBeHidden();
    await expect(page.getByText("Checking journey access")).toBeInViewport();
    await expect(
      page.getByRole("region", { name: "Journey access" }),
    ).toBeFocused();
  } finally {
    release.resolve();
  }
  await expect(recipients).toBeVisible();
  await expect(removeSecond).toBeFocused();
  await expect(addressField).toHaveValue("still-typing@example.test");
  await removeSecond.press("Enter");
  await expect(addressField).toBeFocused();
  await expect(recipients.getByText("No recipients yet")).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(navigation);

  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(journey);
  await page.getByRole("link", { name: "View people", exact: true }).click();
  await expect(page.getByText("No pending invitations.")).toBeVisible();
});

test("retries creation and invitation delivery for the same saved journey", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.goto(`${site}/`);
  const email = await newAccount(page);
  await signIn(page, email);
  const next = page.getByRole("button", { name: "Continue", exact: true });
  await next.click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await page
    .getByRole("button", { name: "Go to Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(`${site}/dashboard`);
  await fillJourney(page, "Konkan with companions");

  let journeyId = "";
  const committed = Promise.withResolvers<void>();
  const releaseCreate = Promise.withResolvers<void>();
  await page.route(
    "**/api/v1/journeys",
    async (route) => {
      const saved = await route.fetch();
      expect(saved.status()).toBe(201);
      journeyId = (await saved.json()).id;
      committed.resolve();
      await releaseCreate.promise;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Create & invite people" }).click();
  try {
    await committed.promise;
    await expect(
      page.getByRole("button", { name: "Saving before invitations…" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save journey", exact: true }),
    ).toBeDisabled();
  } finally {
    releaseCreate.resolve();
  }
  await expect(
    page.getByText("We couldn’t confirm the save.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry save & invite people" })
    .click();
  const destination = `${site}/journeys/${journeyId}`;
  await expect(page).toHaveURL(`${destination}/invite`);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Find on Kairn" }),
  ).toBeEnabled();
  await page
    .getByRole("searchbox", { name: "Name or exact email" })
    .fill(`Guest-${randomUUID()}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No matches", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use email instead" }).click();
  const guest = `companion-${randomUUID()}@example.test`;
  const addressField = page.getByRole("textbox", { name: "Email address" });
  await expect(addressField).toBeFocused();
  await addressField.fill(guest);
  await page.getByRole("button", { name: "Add email" }).click();
  await expect(page.getByRole("list", { name: "Recipients" })).toContainText(
    guest,
  );

  const clicked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let batchKey: string | undefined;
  await page.route(
    "**/api/v1/journeys/*/invitations",
    async (route) => {
      batchKey = route.request().headers()["idempotency-key"];
      expect((await route.fetch()).ok()).toBe(true);
      clicked.resolve();
      await release.promise;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send invitations" }).click();
  try {
    await clicked.promise;
    await expect(
      page.getByRole("button", { name: "Skip for now" }),
    ).toBeDisabled();
  } finally {
    release.resolve();
  }
  const retried = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith(`/${journeyId}/invitations`),
  );
  await page.getByRole("button", { name: "Retry batch" }).click();
  expect((await retried).headers()["idempotency-key"]).toBe(batchKey);
  await expect(
    page.getByText("Invitation queued", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(destination);
  await mailLink(guest, "Join a journey on Kairn", "/journey-invitations#");
  await page.getByRole("link", { name: "View people", exact: true }).click();
  await expect(page.getByText(guest, { exact: true })).toHaveCount(1);
  expect(
    await (
      await page.request.get(`${site}/api/v1/dashboard`, {
        headers: await viewer(page),
      })
    ).json(),
  ).toMatchObject({ journeyCount: 1 });
});
