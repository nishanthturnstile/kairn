import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { mailLink, site } from "./identity-fixture";

const password = "Synthetic-browser-invitations-password";
const address = () => `people-${randomUUID()}@example.test`;
const invitationLink = (email: string) =>
  mailLink(email, "Join a journey on Kairn", "/journey-invitations#");
const identity = { Origin: site };
let client = 0;

test.skip(
  process.env.KAIRN_WEB_INVITATIONS !== "1",
  "Requires the service-backed invitation suite.",
);

async function headers(context: BrowserContext) {
  const networks = { chromium: 133, firefox: 134, webkit: 135 };
  const browser = test.info().project.use.browserName ?? "chromium";
  await context.setExtraHTTPHeaders({
    "X-Forwarded-For": `198.51.${networks[browser]}.${++client}`,
  });
}

async function existingAccount(page: Page, name: string) {
  const email = address();
  const signup = await page.request.post(`${site}/api/auth/sign-up/email`, {
    headers: identity,
    data: { name, email, password },
  });
  expect(signup.status()).toBe(200);
  const { user } = await signup.json();
  expect(
    (
      await page.request.get(await mailLink(email, "Verify your Kairn email"))
    ).ok(),
  ).toBeTruthy();
  await apiSignIn(page, email);
  return { email, id: user.id as string };
}

async function apiSignIn(page: Page, email: string) {
  expect(
    (
      await page.request.post(`${site}/api/auth/sign-in/email`, {
        headers: identity,
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function search(page: Page, value: string) {
  await page.getByLabel("Name or exact email").fill(value);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

async function optIn(page: Page) {
  await page.goto(`${site}/account`);
  await page.getByRole("button", { name: "Allow invitation search" }).click();
  await expect(
    page.getByRole("button", { name: "Turn off invitation search" }),
  ).toBeVisible();
}

async function createJourney(page: Page, title: string) {
  const response = await page.request.post(`${site}/api/v1/journeys`, {
    headers: { ...identity, "Idempotency-Key": randomUUID() },
    data: {
      title,
      timeZone: "Asia/Kolkata",
      intendedStart: "2030-06-14T09:30",
    },
  });
  expect(response.status()).toBe(201);
  return String((await response.json()).id);
}

async function expectOneJourney(
  page: Page,
  journeyId: string,
  accountId: string,
) {
  const request = { headers: { "X-Expected-Account": accountId } };
  const summary = await page.request.get(`${site}/api/v1/dashboard`, request);
  expect(await summary.json()).toMatchObject({
    journeyCount: 1,
    nextJourney: { id: journeyId },
  });
  const timeline = await page.request.get(
    `${site}/api/v1/journeys?view=timeline`,
    request,
  );
  expect(
    (await timeline.json()).timeline.upcoming.items.map(
      (row: { id: string }) => row.id,
    ),
  ).toEqual([journeyId]);
}

test("invites four people by member search or email, resumes verification and removes access", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(160_000);
  await headers(context);
  const sessions = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const recipient = await browser.newContext();
      await headers(recipient);
      return recipient;
    }),
  );
  try {
    const [existing, existingByEmail, new1, new2] = await Promise.all(
      sessions.map((recipient) => recipient.newPage()),
    );
    const unique = randomUUID().slice(0, 8);
    const name = `Mira ${unique}`;
    const title = `Coastal ferry ${unique}`;
    const [organiser, first, second] = await Promise.all([
      existingAccount(page, "Journey organiser"),
      existingAccount(existing, name),
      existingAccount(existingByEmail, `Anu ${unique}`),
    ]);
    const journeyId = await createJourney(page, title);
    const people = `${site}/journeys/${journeyId}/people`;
    await page.goto(`${site}/journeys/${journeyId}`);
    await page.getByRole("link", { name: "View people" }).click();
    await expect(page).toHaveURL(people);
    await page.getByRole("button", { name: "Invite people" }).click();
    await search(page, name);
    await expect(
      page.getByText(/Only people who enable invitation search in Account/),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "No matches." }),
    ).toHaveText("No matches. You can invite them by email.");
    await Promise.all([optIn(existing), optIn(existingByEmail)]);
    await search(page, name);
    await expect(
      page.getByRole("status").filter({ hasText: "1 match found." }),
    ).toHaveText("1 match found.");
    await page.getByRole("button", { name: `Add ${name}` }).click();
    await search(page, second.email.toUpperCase());
    await page.getByRole("button", { name: `Add Anu ${unique}` }).click();
    await page.getByRole("button", { name: "Invite by email" }).click();
    const email1 = address();
    const email2 = address();
    for (const email of [email1, email2]) {
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Add email" }).click();
    }

    const endpoint = `${site}/api/v1/journeys/${journeyId}/invitations`;
    let firstKey: string | undefined;
    await page.route(endpoint, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      firstKey = route.request().headers()["idempotency-key"];
      await route.abort("failed");
    });
    await page.getByRole("button", { name: "Send invitations" }).click();
    await expect(
      page.getByRole("button", { name: "Retry batch" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Review pending send" }).click();
    await expect(
      page.getByRole("button", { name: "Retry batch" }),
    ).toBeVisible();
    await page.unroute(endpoint);
    const replay = page.waitForRequest(
      (request) => request.url() === endpoint && request.method() === "POST",
    );
    await page.getByRole("button", { name: "Retry batch" }).click();
    expect((await replay).headers()["idempotency-key"]).toBe(firstKey);
    await expect(page.getByText("4 invitations queued.")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    const pending = page
      .getByRole("heading", { name: "Invitations", exact: true })
      .locator("../..");
    await expect(pending.getByText(name, { exact: true })).toBeVisible();
    await expect(pending.getByText(first.email)).toHaveCount(0);
    await expect(pending.getByText(second.email)).toHaveCount(0);

    const links = await Promise.all(
      [first.email, second.email, email1, email2].map(invitationLink),
    );
    await existing.goto(links[0]);
    await expect(existing.getByRole("heading", { name: title })).toBeVisible();
    await expect(existing).toHaveURL(`${site}/journey-invitations`);
    expect(
      (
        await existing.request.get(`${site}/api/v1/journeys/${journeyId}`)
      ).status(),
    ).toBe(404);
    await existing.route(
      "**/api/v1/journey-invitations/accept",
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await existing.getByRole("button", { name: "Join journey" }).click();
    await expect(
      existing.getByRole("button", { name: "Retry joining" }),
    ).toBeVisible();
    await existing.reload();
    await existing.getByRole("button", { name: "Open journey" }).click();
    await expect(existing).toHaveURL(`${site}/journeys/${journeyId}`);

    await existingByEmail.goto(links[0]);
    await expect(
      existingByEmail.getByRole("button", { name: "Switch account" }),
    ).toBeVisible();
    await expect(
      existingByEmail.getByRole("heading", { name: title }),
    ).toHaveCount(0);
    await existingByEmail
      .getByRole("button", { name: "Switch account" })
      .click();
    await existingByEmail
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await signIn(existingByEmail, second.email);
    await expect(
      existingByEmail.getByRole("button", { name: "Switch account" }),
    ).toBeVisible();
    await existingByEmail.goto(links[1]);
    await existingByEmail
      .getByRole("button", { name: "Open new invitation" })
      .click();
    await existingByEmail.getByRole("button", { name: "Join journey" }).click();
    await expect(existingByEmail).toHaveURL(`${site}/journeys/${journeyId}`);

    const newAccounts = await Promise.all(
      [
        [new1, email1, links[2]],
        [new2, email2, links[3]],
      ].map(async ([recipient, email, link], index) => {
        const target = recipient as Page;
        await target.goto(String(link));
        await expect(target).toHaveURL(`${site}/journey-invitations`);
        await expect(target.getByRole("heading", { name: title })).toHaveCount(
          0,
        );
        await target.getByRole("link", { name: "Create account" }).click();
        await target
          .getByLabel("Display name", { exact: true })
          .fill(`New participant ${index}`);
        await target.getByLabel("Email", { exact: true }).fill(String(email));
        await target.getByLabel("Password", { exact: true }).fill(password);
        await target
          .getByRole("button", { name: "Create account", exact: true })
          .click();
        await expect(
          target.getByText("Check your inbox for a verification link."),
        ).toBeVisible();
        await target.goto(
          await mailLink(String(email), "Verify your Kairn email"),
        );
        await signIn(target, String(email));
        await expect(
          target.getByRole("heading", { name: "Welcome to Kairn" }),
        ).toBeVisible();
        await target
          .getByRole("button", { name: "Continue", exact: true })
          .click();
        await target.getByRole("radio", { name: "Look around" }).check();
        await target
          .getByRole("button", { name: "Continue to invitation" })
          .click();
        await expect(
          target.getByRole("heading", { name: title }),
        ).toBeVisible();
        await target.getByRole("button", { name: "Join journey" }).click();
        await expect(target).toHaveURL(`${site}/journeys/${journeyId}`);
        const session = await (
          await target.request.get(`${site}/api/auth/get-session`)
        ).json();
        return { page: target, id: session.user.id as string };
      }),
    );
    await Promise.all([
      expectOneJourney(page, journeyId, organiser.id),
      expectOneJourney(existing, journeyId, first.id),
      expectOneJourney(existingByEmail, journeyId, second.id),
      ...newAccounts.map((account) =>
        expectOneJourney(account.page, journeyId, account.id),
      ),
    ]);

    await sessions[0].setOffline(true);
    await existing.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(
      existing.getByText("Reconnect to check journey access"),
    ).toBeVisible();
    await expect(existing.getByRole("heading", { name: title })).toHaveCount(0);
    await sessions[0].setOffline(false);
    await existing.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(existing.getByRole("heading", { name: title })).toBeVisible();
    await existing.getByRole("link", { name: "View people" }).click();
    await expect(
      existing.getByRole("heading", { name: "Members" }),
    ).toBeVisible();
    await expect(
      existing.getByRole("heading", { name: "Invitations", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      existing.getByRole("button", { name: /Manage roles/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: `Manage roles for ${name}` })
      .click();
    const roleEditor = page.getByRole("group", { name: `Roles for ${name}` });
    const roleEndpoint = `**/api/v1/journeys/${journeyId}/members/${first.id}/editorial-capability`;
    await page.route(
      roleEndpoint,
      async (route) => {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await roleEditor.getByRole("button", { name: "Assign coauthor" }).click();
    const assignCoauthor = page.getByRole("dialog", {
      name: "Assign coauthor",
    });
    await expect(
      assignCoauthor.getByText(/review contributed sources/),
    ).toBeVisible();
    await assignCoauthor
      .getByRole("button", { name: "Assign coauthor" })
      .click();
    await expect(
      assignCoauthor.getByText("Couldn’t confirm this change. Try again."),
    ).toBeVisible();
    await assignCoauthor.getByRole("button", { name: "Go back" }).click();
    await page.reload();
    const retryCoauthor = page.getByRole("button", {
      name: `Retry coauthor change for ${name}`,
    });
    await retryCoauthor.click();
    await expect(retryCoauthor).toHaveCount(0);
    await page
      .getByRole("button", { name: `Manage roles for ${name}` })
      .click();
    await roleEditor.getByRole("button", { name: "Assign publisher" }).click();
    const assignPublisher = page.getByRole("dialog", {
      name: "Assign publisher",
    });
    await assignPublisher
      .getByRole("button", { name: "Assign publisher" })
      .click();
    await expect(assignPublisher).toBeHidden();
    await roleEditor.getByRole("button", { name: "Revoke coauthor" }).click();
    const roleConfirmation = page.getByRole("dialog", {
      name: "Revoke coauthor",
    });
    await expect(
      roleConfirmation.getByText(/if they also hold the publisher role/),
    ).toBeVisible();
    await roleConfirmation
      .getByRole("button", { name: "Revoke coauthor" })
      .click();
    await expect(
      page.getByRole("status").filter({
        hasText: `Coauthor revoked for ${name}. Confirmation is pending.`,
      }),
    ).toBeVisible();
    await expect(
      roleEditor.getByRole("button", { name: "Assign coauthor" }),
    ).toBeVisible();
    await expect(
      roleEditor.getByRole("button", { name: "Revoke publisher" }),
    ).toBeVisible();
    await roleEditor.getByRole("button", { name: "Revoke publisher" }).click();
    await page
      .getByRole("dialog", { name: "Revoke publisher" })
      .getByRole("button", { name: "Revoke publisher" })
      .click();
    const checks = ["coauthor", "publisher"].map((role) =>
      page.getByRole("button", {
        name: `Check ${role} revocation for ${name}`,
      }),
    );
    for (const check of checks) await expect(check).toBeVisible();
    await page.reload();
    for (const check of checks) await expect(check).toBeVisible();
    await page.getByRole("button", { name: `Remove ${name}` }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove member" })
      .click();
    await expect(
      page.getByText("Access removed. Confirmation is pending."),
    ).toBeVisible();
    await existing.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(
      existing.getByText("This journey is unavailable"),
    ).toBeVisible();
    const dashboard = await existing.request.get(`${site}/api/v1/dashboard`, {
      headers: { "X-Expected-Account": first.id },
    });
    expect((await dashboard.json()).journeyCount).toBe(0);
    await existingByEmail.getByRole("link", { name: "View people" }).click();
    await existingByEmail
      .getByRole("button", { name: "Leave journey", exact: true })
      .click();
    const leaveUrl = `${site}/api/v1/journeys/${journeyId}/leave`;
    let leaveKey: string | undefined;
    await existingByEmail.route(
      leaveUrl,
      async (route) => {
        leaveKey = route.request().headers()["idempotency-key"];
        expect((await route.fetch()).status()).toBe(202);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await existingByEmail
      .getByRole("dialog")
      .getByRole("button", { name: "Leave journey", exact: true })
      .click();
    await expect(
      existingByEmail.getByText("Couldn’t confirm this change. Try again."),
    ).toBeVisible();
    const leaveReplay = existingByEmail.waitForRequest(
      (request) => request.url() === leaveUrl,
    );
    await existingByEmail.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect((await leaveReplay).headers()["idempotency-key"]).toBe(leaveKey);
    await expect(existingByEmail).toHaveURL(`${site}/journeys`);
    await expect(
      existingByEmail.getByText(
        "You left the journey. Confirmation is pending.",
      ),
    ).toBeVisible();
  } finally {
    await Promise.all(sessions.map((recipient) => recipient.close()));
  }
});

test("keeps People and the focused invitation form usable at 320 CSS pixels", async ({
  page,
  context,
}) => {
  test.setTimeout(55_000);
  await headers(context);
  const account = await existingAccount(page, "Narrow layout organiser");
  const id = await createJourney(
    page,
    "A long journey name for a narrow People page",
  );
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const release = Promise.withResolvers<void>();
  for (const endpoint of ["people", "invitations"]) {
    await page.route(
      `**/api/v1/journeys/${id}/${endpoint}*`,
      async (route) => {
        await release.promise;
        await route.continue();
      },
      { times: 1 },
    );
  }
  await page.goto(`${site}/journeys/${id}/people`);
  await page.addStyleTag({ content: "html { font-size: 200% }" });
  try {
    await expect(page.getByText("Loading members")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  } finally {
    release.resolve();
  }
  await expect(page.getByText("Narrow layout organiser (You)")).toBeVisible();
  await page
    .getByRole("button", { name: "Manage roles for Narrow layout organiser" })
    .press("Enter");
  const publisherAction = page.getByRole("button", {
    name: "Revoke publisher",
  });
  await publisherAction.press("Enter");
  const roleDialog = page.getByRole("dialog", { name: "Revoke publisher" });
  expect(
    await roleDialog.evaluate((node) => node.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await roleDialog.getByRole("button", { name: "Go back" }).press("Enter");
  await expect(publisherAction).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Invite people" }).press("Enter");
  const sheet = page.getByRole("dialog", { name: "Invite people" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Invite by email" }).press("Enter");
  await expect(sheet.getByLabel("Email address")).toBeFocused();
  await sheet.getByLabel("Email address").fill("invalid");
  await sheet.getByRole("button", { name: "Add email" }).press("Enter");
  await expect(sheet.getByText("Enter a valid email address.")).toBeVisible();
  expect(await sheet.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
    320,
  );
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Invite people" }),
  ).toBeFocused();
  expect(account.email).toBeTruthy();
});

test("withholds an open invitation while rechecking and recognises cancellation", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(50_000);
  await headers(context);
  const receiverContext = await browser.newContext();
  await headers(receiverContext);
  try {
    const recipient = await receiverContext.newPage();
    const [, member] = await Promise.all([
      existingAccount(page, "Cancellation organiser"),
      existingAccount(recipient, "Cancellation recipient"),
    ]);
    const title = "Private cancellation test journey";
    const journeyId = await createJourney(page, title);
    const issued = await page.request.post(
      `${site}/api/v1/journeys/${journeyId}/invitations`,
      {
        headers: { ...identity, "Idempotency-Key": randomUUID() },
        data: { emails: [member.email] },
      },
    );
    expect(issued.status()).toBe(200);
    await recipient.goto(await invitationLink(member.email));
    await expect(recipient.getByRole("heading", { name: title })).toBeVisible();
    await page.goto(`${site}/journeys/${journeyId}/people`);
    await page
      .getByRole("button", { name: `Resend invitation to ${member.email}` })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Resend invitation" })
      .click();
    await expect(
      page.getByText("You can’t resend this yet. Try again later."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Cancel invitation to ${member.email}` })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel invitation" })
      .click();
    await expect(
      page.getByText("Invitation cancelled.", { exact: true }),
    ).toBeVisible();

    const requested = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await recipient.route(
      "**/api/v1/journey-invitations/review",
      async (route) => {
        requested.resolve();
        await release.promise;
        await route.continue();
      },
      { times: 1 },
    );
    await recipient.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await requested.promise;
    try {
      await expect(recipient.getByRole("heading", { name: title })).toHaveCount(
        0,
      );
      await expect(
        recipient.getByRole("button", { name: "Join journey" }),
      ).toHaveCount(0);
    } finally {
      release.resolve();
    }
    await expect(
      recipient.getByText("The organiser cancelled this invitation.", {
        exact: false,
      }),
    ).toBeVisible();
  } finally {
    await receiverContext.close();
  }
});
