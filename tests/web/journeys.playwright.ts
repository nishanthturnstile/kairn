import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { wcagAATags } from "./accessibility";
import { chooseAppearance } from "./appearance-fixture";
import { mailLink, site } from "./identity-fixture";
import { expectSchedule, fillSchedule } from "./schedule-fixture";
import { openAccount } from "./workspace-fixture";

const password = "Synthetic-journeys-browser-password";
const endpoint = "**/api/v1/journeys";
const timelineEndpoint = `${endpoint}?view=timeline`;

function identityHeaders() {
  const { line, project } = test.info();
  const network = { chromium: 100, webkit: 101, firefox: 102 };
  return {
    "X-Forwarded-For": `198.51.${network[project.use.browserName ?? "chromium"]}.${(line % 253) + 1}`,
  };
}

test.skip(
  process.env.KAIRN_WEB_IDENTITY !== "1",
  "Requires the local API, web app, worker and Mailpit.",
);
test.use({ timezoneId: "Europe/London" });
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(identityHeaders());
});

async function verifiedEmail(page: Page, openVerification = false) {
  const email = `journeys-${randomUUID()}@example.test`;
  const registration = await page.request.post(
    `${site}/api/auth/sign-up/email`,
    {
      headers: { Origin: site, ...identityHeaders() },
      data: { name: "Synthetic journey account", email, password },
    },
  );
  expect(registration.status()).toBe(200);
  const link = await mailLink(email, "Verify your Kairn email");
  if (openVerification) {
    await page.goto(link);
    await expect(
      page.getByText("Your email is verified. You can sign in now."),
    ).toBeVisible();
  } else {
    expect((await page.request.get(link)).ok()).toBeTruthy();
  }
  return email;
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function openSignedInAccount(page: Page, email: string) {
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await openAccount(page);
  await expect(page.getByRole("main").getByText(email)).toBeVisible();
}

async function fillJourney(
  page: Page,
  title: string,
  date = "2027-11-07",
  time = "09:00",
  zone = "Asia/Kolkata",
) {
  await page.getByLabel("Title", { exact: true }).fill(title);
  await fillSchedule(page, "Start date", date);
  await fillSchedule(page, "Start time", time);
  await page.getByLabel("Timezone", { exact: true }).fill(zone);
}

async function signOut(page: Page) {
  await openAccount(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
}

test("creates and reopens one journey after the committed reply is lost", async ({
  page,
}) => {
  test.setTimeout(80_000);
  await page.goto(`${site}/journeys`);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const email = await verifiedEmail(page, true);
  await page.route(timelineEndpoint, (route) => route.abort("failed"), {
    times: 1,
  });
  await signIn(page, email);
  await expect(page.getByText("Couldn’t load your journeys")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create journey" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "No journeys yet" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Create journey" })).toHaveCount(
    1,
  );

  await page.getByRole("link", { name: "Create journey" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Journeys", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await page.getByRole("button", { name: "Save journey" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toBeFocused();
  await expect(page.getByText("Enter a start date.")).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Calendar check");
  await fillSchedule(page, "Start date", "2027-02-29");
  await fillSchedule(page, "Start time", "08:61");
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  const date = page.getByRole("textbox", { name: "Start date", exact: true });
  await expect(date).toBeFocused();
  await expect(date).toHaveAccessibleDescription(/Enter a day from 01 to 28/);
  await date.pressSequentially("28");
  await expect(date).toHaveValue("2027-02-28");
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Start time", exact: true }),
  ).toBeFocused();
  await fillJourney(page, "Coorg trip", "2027-11-06", "08:00");
  await page.getByRole("button", { name: "Choose start date" }).press("Enter");
  await page
    .getByRole("dialog", { name: "Start date", exact: true })
    .getByRole("button", { name: /Sunday, 7 November 2027/ })
    .click();
  await page.getByRole("button", { name: "Choose start time" }).press("Enter");
  await expect(
    page
      .getByRole("dialog", { name: "Start time" })
      .getByRole("group", { name: "Hour" })
      .getByRole("radio", { name: "08" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: "Use 09:00" }).click();
  await expectSchedule(page, "Start date", "2027-11-07");
  await expectSchedule(page, "Start time", "09:00");
  await expect(
    page.getByRole("textbox", { name: "End date", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Add end date" }).press("Enter");
  const removeEnd = page.getByRole("button", { name: "Remove end date" });
  await expect(removeEnd).toHaveAttribute("aria-expanded", "true");
  await fillSchedule(page, "End time", "10:30");
  await page.getByRole("button", { name: "Save journey" }).click();
  await expect(
    page.getByRole("textbox", { name: "End date", exact: true }),
  ).toBeFocused();
  await removeEnd.click();
  await expect(
    page.getByRole("textbox", { name: "End time", exact: true }),
  ).toBeHidden();
  await expect(page.getByText("Enter an end date.")).toBeHidden();
  await page.getByRole("button", { name: "Add end date" }).click();
  await expectSchedule(page, "End time", "HH:MM");
  await removeEnd.click();

  const committed = Promise.withResolvers<{ id: string; key: string }>();
  let createRequests = 0;
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createRequests++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    committed.resolve({
      id,
      key: route.request().headers()["idempotency-key"],
    });
    await route.abort("failed");
  });
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(
    page.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  expect(createRequests).toBe(1);
  const { id, key } = await committed.promise;
  await page.unroute(endpoint);
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Coorg trip",
  );
  await expect(page.getByLabel("Title", { exact: true })).toBeDisabled();
  await page.route(
    endpoint,
    (route) =>
      route.fulfill({
        status: 403,
        json: { code: "forbidden" },
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(
    page.getByText(
      "We couldn’t confirm the save. Retry with the same details.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toBeDisabled();
  await page.route(
    `${site}/api/v1/journeys/${id}`,
    (route) => route.abort("failed"),
    { times: 1 },
  );
  const replay = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/journeys",
  );
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  const saved = await replay;
  expect(saved.status()).toBe(200);
  expect(saved.request().headers()["idempotency-key"]).toBe(key);
  await expect(page).toHaveURL(`${site}/journeys/${id}`);
  await expect(page.getByText("Couldn’t load this journey")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Coorg trip" })).toBeVisible();
  await expect(page.getByText("7 Nov 2027 · 9:00 am")).toBeVisible();
  await expect(page.getByText("End date unknown")).toBeVisible();
  await page.goBack();
  const journey = page.getByRole("link", { name: /Coorg trip/ });
  await expect(journey).toHaveCount(1);
  await journey.click();
  await expect(page).toHaveURL(`${site}/journeys/${id}`);
  await expect(page.getByRole("heading", { name: "Coorg trip" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Journeys" }).click();
  await expect(page.getByRole("link", { name: /Coorg trip/ })).toBeVisible();
  await signOut(page);
  await page.goto(`${site}/journeys/${id}`);
  await signIn(page, email);
  await expect(page).toHaveURL(`${site}/journeys/${id}`);
  await expect(page.getByRole("heading", { name: "Coorg trip" })).toBeVisible();

  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  for (let index = 0; index < 26; index++) {
    const response = await page.request.post(`${site}/api/v1/journeys`, {
      headers: { Origin: site, "Idempotency-Key": randomUUID() },
      data: {
        title: `Future trip ${index}`,
        intendedStart: `${futureDate}T09:00`,
        timeZone: "UTC",
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.getByRole("link", { name: "Back to Journeys" }).click();
  const upcoming = page.getByRole("region", { name: "Upcoming" });
  await expect(upcoming.getByRole("link")).toHaveCount(25);
  const more = upcoming.getByRole("button", {
    name: "Load more upcoming journeys",
  });
  await page.route(
    "**/api/v1/journeys?section=upcoming&cursor=*",
    (route) => route.fulfill({ status: 503, json: { code: "unavailable" } }),
    { times: 1 },
  );
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(upcoming.getByRole("alert")).toContainText(
    "Couldn’t load more journeys",
  );
  const retry = upcoming.getByRole("button", { name: "Try again" });
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(upcoming.getByRole("link", { name: /Future trip/ })).toHaveCount(
    26,
  );
  await expect(upcoming.getByRole("link").nth(25)).toBeFocused();
  const laterRow = upcoming.getByRole("link").nth(12);
  await laterRow.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => window.scrollY);
  expect(position).toBeGreaterThan(0);
  await laterRow.click();
  await expect(
    page.getByRole("heading", { name: /Future trip/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Journeys" }).click();
  await expect(upcoming.getByRole("link")).toHaveCount(25);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("refreshes the journey timeline after a brief tab switch and recovers a failed sign-out", async ({
  page,
}) => {
  const email = await verifiedEmail(page);
  await page.goto(`${site}/account`);
  await signIn(page, email);
  await openSignedInAccount(page, email);

  const created = await page.request.post(`${site}/api/v1/journeys`, {
    headers: { Origin: site, "Idempotency-Key": randomUUID() },
    data: {
      title: "Focus boundary fixture",
      intendedStart: "2035-05-12T09:00",
      intendedEnd: "2035-05-12T10:00",
      timeZone: "UTC",
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const detail = await page.request.get(`${site}/api/v1/journeys/${id}`);
  expect(detail.ok()).toBe(true);
  const journey = await detail.json();
  const times = {
    upcoming: "2035-05-12T08:59:59.999Z",
    active: "2035-05-12T09:00:00.000Z",
    past: "2035-05-12T10:00:00.001Z",
  };
  let section: keyof typeof times = "upcoming";
  await page.route(timelineEndpoint, (route) =>
    route.fulfill({
      json: {
        asOf: times[section],
        timeline: {
          upcoming: {
            items: section === "upcoming" ? [journey] : [],
            nextCursor: null,
          },
          active: {
            items: section === "active" ? [journey] : [],
            nextCursor: null,
          },
          past: {
            items: section === "past" ? [journey] : [],
            nextCursor: null,
          },
          incomplete: { items: [], nextCursor: null },
        },
      },
    }),
  );
  await page.getByRole("link", { name: "Journeys", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Upcoming" })
      .getByRole("link", { name: /Focus boundary fixture/ }),
  ).toHaveAttribute("href", `/journeys/${id}`);
  for (const [group, title] of [
    ["active", "Active now"],
    ["past", "Past journeys"],
  ] as const) {
    section = group;
    await page.evaluate(() => {
      for (const value of ["hidden", "visible"]) {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value,
        });
        document.dispatchEvent(
          new Event("visibilitychange", { bubbles: true }),
        );
      }
    });
    await expect(
      page
        .getByRole("region", { name: title })
        .getByRole("link", { name: /Focus boundary fixture/ }),
    ).toHaveAttribute("href", `/journeys/${id}`);
    await expect(
      page.getByRole("link", { name: /Focus boundary fixture/ }),
    ).toHaveCount(1);
  }

  await page.route(`${site}/api/v1/journeys/${id}`, (route) =>
    route.fulfill({
      json: journey,
      headers: { "X-Kairn-As-Of": times.past },
    }),
  );
  await page.getByRole("link", { name: /Focus boundary fixture/ }).click();
  await expect(
    page.getByRole("heading", { name: "Focus boundary fixture" }),
  ).toBeVisible();
  await expect(page.getByText("Past journey", { exact: true })).toBeVisible();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();

  await openAccount(page);
  await page.route(
    "**/api/auth/sign-out",
    (route) =>
      route.fulfill({
        status: 503,
        json: { message: "Fixture sign-out failure" },
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Couldn’t sign out. Try again.")).toBeVisible();
  await expect(page.getByRole("main").getByText(email)).toBeVisible();
  await signOut(page);
  await page.goto(`${site}/journeys`);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("groups the timeline and keeps section links usable on a phone", async ({
  page,
}) => {
  const email = await verifiedEmail(page);
  await page.goto(`${site}/journeys`);
  await signIn(page, email);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "No journeys yet" }),
  ).toBeVisible();
  await expect(main.getByRole("link", { name: "Create journey" })).toHaveCount(
    1,
  );

  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 16);
  for (const [title, start, end] of [
    ["Nilgiri railway weekend", -2, 2],
    ["Hampi slow trip", 3, 6],
    ["Coorg in the rains", -7, -5],
    ["Along the Mandovi", -11, null],
  ] as const) {
    const response = await page.request.post(`${site}/api/v1/journeys`, {
      headers: { Origin: site, "Idempotency-Key": randomUUID() },
      data: {
        title,
        timeZone: "UTC",
        intendedStart: day(start),
        intendedEnd: end === null ? undefined : day(end),
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload();
  const sections = main.getByRole("navigation", { name: "Journey sections" });
  await expect(sections.getByRole("link")).toHaveText([
    "Active now",
    "Upcoming",
    "Past journeys",
    "Open-ended and undated",
  ]);
  const active = main.getByRole("region", { name: "Active now" });
  const upcoming = main.getByRole("region", { name: "Upcoming" });
  const past = main.getByRole("region", { name: "Past journeys" });
  await expect(active.getByRole("link")).toHaveText(
    /Nilgiri railway weekend.*Starts.*Ends/,
  );
  await expect(upcoming.getByRole("link")).toContainText("Hampi slow trip");
  await expect(past.getByRole("link")).toContainText("Coorg in the rains");
  await expect(
    main
      .getByRole("region", { name: "Open-ended and undated" })
      .getByRole("link"),
  ).toHaveText(/Along the Mandovi.*No end date/);

  await page.setViewportSize({ width: 320, height: 740 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await sections.getByRole("link", { name: "Past journeys" }).press("Enter");
  await expect(page).toHaveURL(`${site}/journeys#journeys-past`);
  await expect(past.getByRole("heading")).toBeFocused();
  await expect(past.getByRole("heading")).toBeInViewport();
  const bottomNav = page.getByRole("navigation", { name: "Main" });
  await expect(bottomNav).toBeVisible();
  await expect(
    bottomNav.getByRole("link", { name: "Journeys" }),
  ).toHaveAttribute("aria-current", "page");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  expect(
    (await new AxeBuilder({ page }).withTags(wcagAATags).analyze()).violations,
  ).toEqual([]);

  await sections.getByRole("link", { name: "Upcoming" }).press("Enter");
  await expect(upcoming.getByRole("heading")).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(`${site}/journeys#journeys-past`);
  await expect(past.getByRole("heading")).toBeFocused();
  await page.reload();
  await expect(past.getByRole("heading")).toBeFocused();
  await expect(past.getByRole("heading")).toBeInViewport();
});

test("renders the form at 320px and keeps a pending save bound to the original account", async ({
  page,
}) => {
  test.setTimeout(100_000);
  const accountA = await verifiedEmail(page);
  const accountB = await verifiedEmail(page);
  await page.goto(`${site}/account`);
  await signIn(page, accountA);
  await openSignedInAccount(page, accountA);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Journeys" })
    .click();
  await page.getByRole("link", { name: "Create journey" }).click();
  await page.setViewportSize({ width: 320, height: 860 });
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add end date" }).click();
  for (const appearance of ["Dark", "Outdoor", "Light"]) {
    await chooseAppearance(page, appearance);
    const width = await page.evaluate(async () => {
      document.documentElement.style.fontSize = "200%";
      await document.fonts.ready;
      return document.documentElement.scrollWidth;
    });
    expect(width).toBeLessThanOrEqual(320);
    for (const control of await page
      .locator("form :is(button, input, select):visible")
      .all()) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(
    (await new AxeBuilder({ page }).withTags(wcagAATags).analyze()).violations,
  ).toEqual([]);
  await fillJourney(
    page,
    "Private Coonoor",
    "2027-11-07",
    "01:30",
    "America/New_York",
  );
  await page.getByRole("button", { name: "Save journey" }).click();
  const choice = page.getByLabel("Start time occurrence");
  await expect(choice).toBeFocused();
  await choice.selectOption("-05:00");
  await fillSchedule(page, "End date", "2027-11-07");
  await fillSchedule(page, "End time", "03:15");

  const waiting = Promise.withResolvers<string>();
  const release = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    waiting.resolve((await response.json()).id);
    await release.promise;
    await route.fulfill({ response }).catch(() => {});
    released.resolve();
  });
  try {
    await page.getByRole("button", { name: "Save journey" }).click();
    await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
    const id = await waiting.promise;
    await signOut(page);
    await signIn(page, accountB);
    await openSignedInAccount(page, accountB);
    const accountDestination = page.url();
    release.resolve();
    await released.promise;
    await page.unroute(endpoint);
    await expect(page).toHaveURL(accountDestination);
    await expect(page.getByRole("main").getByText(accountB)).toBeVisible();
    await expect(page.getByText("Private Coonoor")).toHaveCount(0);
    await page.goto(`${site}/journeys/${id}`);
    await expect(
      page.getByText("This journey is unavailable", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Private Coonoor")).toHaveCount(0);
    await page.getByRole("link", { name: "Back to Journeys" }).click();
    await expect(
      page.getByRole("heading", { name: "No journeys yet" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Create journey" }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");

    await signOut(page);
    await signIn(page, accountA);
    await openSignedInAccount(page, accountA);
    await page.goto(`${site}/journeys/new`);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Private Coonoor",
    );
    await expectSchedule(page, "End date", "2027-11-07");
    await expectSchedule(page, "End time", "03:15");
    await expect(
      page.getByRole("textbox", { name: "End time", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(page).toHaveURL(`${site}/journeys/${id}`);
    await expect(
      page.getByRole("heading", { name: "Private Coonoor" }),
    ).toBeVisible();
    await expect(page.getByText("7 Nov 2027 · 1:30 am")).toBeVisible();
    const width = await page.evaluate(async () => {
      document.documentElement.style.fontSize = "200%";
      await document.fonts.ready;
      return document.documentElement.scrollWidth;
    });
    expect(width).toBeLessThanOrEqual(320);
    expect(
      (await new AxeBuilder({ page }).withTags(wcagAATags).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    release.resolve();
  }
});

test("keyboard journey creation exposes one correction at a time and focuses the saved destination", async ({
  page,
}) => {
  const email = await verifiedEmail(page);
  await page.goto(`${site}/account`);
  await signIn(page, email);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto(`${site}/journeys/new`);
  const save = page.getByRole("button", { name: "Save journey", exact: true });
  await save.press("Enter");
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  const date = page.getByRole("textbox", { name: "Start date", exact: true });
  await expect(date).toHaveAccessibleDescription(/Enter a start date/);
  const competing = await page
    .locator('form [aria-live="polite"], form [role="alert"]')
    .allTextContents();
  expect
    .soft(
      competing.filter((text) => text.trim()),
      "inactive fields do not queue announcements on submit",
    )
    .toEqual([]);
  await fillJourney(page, "Keyboard journey");
  const gate = Promise.withResolvers<void>();
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "POST") await gate.promise;
    await route.continue();
  });
  await save.press("Enter");
  const pending = page.getByRole("button", { name: "Saving…", exact: true });
  try {
    await expect(pending).toBeDisabled();
    await expect.soft(pending).toBeFocused({ timeout: 600 });
  } finally {
    gate.resolve();
  }
  const heading = page.getByRole("heading", {
    name: "Keyboard journey",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
});
