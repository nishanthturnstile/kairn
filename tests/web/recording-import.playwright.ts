import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { wcagAATags } from "./accessibility";
import { chooseAppearance } from "./appearance-fixture";
import { mailLink, site } from "./identity-fixture";
import { fillSchedule } from "./schedule-fixture";
import { openAccount } from "./workspace-fixture";

const password = "Synthetic-GPX-browser-password";
const fixture = fileURLToPath(
  new URL("../fixtures/gpx/two-runs.gpx", import.meta.url),
);

test.skip(
  process.env.KAIRN_WEB_RECORDINGS !== "1",
  "Requires the recording server, worker and private object store.",
);
test.use({ timezoneId: "Europe/London", reducedMotion: "reduce" });

async function signIn(page: Page) {
  const email = `gpx-web-${randomUUID()}@example.test`;
  const octet = (test.info().line % 251) + 1;
  await page
    .context()
    .setExtraHTTPHeaders({ "X-Forwarded-For": `198.51.110.${octet}` });
  const signup = await page.request.post(`${site}/api/auth/sign-up/email`, {
    headers: { Origin: site },
    data: { email, password, name: "GPX browser test" },
  });
  expect(signup.status()).toBe(200);
  const link = await mailLink(email, "Verify your Kairn email");
  expect((await page.request.get(link)).ok()).toBeTruthy();
  await page.goto(`${site}/journeys`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Journeys", exact: true }),
  ).toBeVisible();
}

async function stage(page: Page) {
  await page.getByLabel("Choose GPX file").setInputFiles(fixture);
  await expect(page.getByText("two-runs.gpx", { exact: true })).toBeVisible();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();
}

async function openImport(page: Page) {
  const importGpx = page.getByRole("link", { name: "Import GPX", exact: true });
  if (await importGpx.isVisible()) await importGpx.press("Enter");
  else await page.goto(`${site}/journeys/import?fresh=true`);
}

async function review(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Review recording" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Sentier d’été & forêt, section 1"),
  ).toBeVisible();
}

async function openRecordings(page: Page) {
  const summary = page.locator("summary").filter({ hasText: /^Recordings$/ });
  if (
    (await summary.isVisible()) &&
    !(await summary.evaluate((element) => element.closest("details")?.open))
  )
    await summary.click();
}

async function hasRecordingCommand(page: Page, commandId: string) {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("kairn-recording-imports", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const request = database
          .transaction("commands")
          .objectStore("commands")
          .getAll();
        request.onsuccess = () =>
          resolve(request.result.some((command) => command.commandId === id));
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, commandId);
}

test("offers a saved correction for explicit acceptance in a shared draft", async ({
  page,
}) => {
  test.setTimeout(85_000);
  await signIn(page);
  await openImport(page);
  await stage(page);
  await page.getByRole("button", { name: "Upload for review" }).click();
  await review(page);
  await page
    .getByLabel("Title", { exact: true })
    .fill("Shared correction fixture");
  await fillSchedule(page, "Start date", "2026-06-12");
  await fillSchedule(page, "Start time", "08:00");
  await page
    .getByLabel("Recording audience", { exact: true })
    .selectOption("journey_review");
  await page.getByLabel("Shared draft", { exact: true }).selectOption("yes");
  await page.getByRole("button", { name: "Create private journey" }).click();
  await expect(
    page.getByRole("heading", { name: "Shared correction fixture" }),
  ).toBeVisible();
  const journeyUrl = page.url();
  await openAccount(page);
  await page.getByRole("link", { name: "Your recordings" }).click();
  await page.getByRole("link", { name: "two-runs.gpx" }).click();
  await page.getByRole("link", { name: "Edit recording" }).click();
  await page.getByRole("button", { name: "Adjust recording time" }).click();
  await page.getByLabel("Clock shift in minutes").fill("60");
  await page.getByRole("button", { name: "Apply time adjustment" }).click();
  await expect(page.getByText("Recording review updated.")).toBeVisible();
  await page.goto(journeyUrl);
  await expect(
    page.getByRole("heading", { name: "Shared correction fixture" }),
  ).toBeVisible();
  await openRecordings(page);
  await page.getByRole("button", { name: "Details for two-runs.gpx" }).click();
  const details = page.getByRole("dialog", { name: "two-runs.gpx" });
  const checkUpdates = details.getByRole("button", {
    name: "Check for recording updates",
  });
  await checkUpdates.click();
  await expect(details.getByText(/Clock shift 60 minutes/)).toBeVisible();
  await details
    .getByRole("button", { name: "Accept update for this journey" })
    .click();
  await expect(
    details.getByText("Recording update accepted in this shared draft."),
  ).toBeVisible();
  await checkUpdates.click();
  await expect(details.getByText("No newer recording update.")).toBeVisible();
  await details
    .getByRole("button", { name: "Remove from shared draft" })
    .click();
  await expect(
    details.getByText("Recording removed from the shared draft."),
  ).toBeVisible();
  await details.getByRole("button", { name: "Withdraw from journey" }).click();
  await details
    .getByRole("button", { name: "Withdraw access", exact: true })
    .click();
  await expect(
    details.getByText("Only you can see this recording."),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Remove recording from journey" })
    .click();
  await details.getByRole("button", { name: "Confirm removal" }).click();
  await expect(details).toBeHidden();
  await expect(page.getByText(/^Recording removed\./)).toBeVisible();
  await expect(page.getByText("No recordings available.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add recording", exact: true }),
  ).toBeFocused();
});

test("recovers a lost upload and journey save and opens the private original", async ({
  page,
}) => {
  test.setTimeout(85_000);
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "No journeys yet" }),
  ).toBeVisible();
  await openImport(page);
  await expect(
    page.getByRole("heading", { name: "Import a GPX recording" }),
  ).toBeFocused();
  await stage(page);

  await page.reload();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();
  await page.route(
    "**/api/v1/uploads/*/complete",
    async (route) => {
      const completed = await route.fetch();
      expect(completed.ok()).toBeTruthy();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Upload for review" }).press("Enter");
  await expect(page.getByText(/Couldn’t finish the upload/)).toBeVisible();
  await page.getByRole("button", { name: "Retry upload" }).press("Enter");
  await review(page);
  await page.getByRole("button", { name: "Adjust recording time" }).click();
  await page.getByLabel("Clock shift in minutes").fill("60");
  await page.getByLabel("Display time zone").fill("Europe/London");
  await page.getByLabel("Display time zone").press("Enter");
  await expect(
    page.getByRole("button", { name: "Reset recording time" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Reset recording time" }).click();
  await expect(
    page.getByRole("button", { name: "Apply time adjustment" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Reset recording time" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close time settings" }).click();

  await page
    .getByRole("button", { name: "Review samples" })
    .first()
    .press("Enter");
  await page
    .getByRole("button", { name: "Split before point 2" })
    .press("Enter");
  await expect(
    page.getByText("Part 2 · You marked a break here."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo split before point 2" }).click();
  await expect(page.getByText("Part 2 · You marked a break here.")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Create private journey" }).click();
  await expect(
    page.getByRole("textbox", { name: "Start date", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Use recorded times" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Hike and train");
  await fillSchedule(page, "Start date", "2026-06-11");
  await fillSchedule(page, "End date", "2026-06-14");

  await page.route(
    "**/api/v1/imports/*/commit",
    async (route) => {
      const committed = await route.fetch();
      expect(committed.ok()).toBeTruthy();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Create private journey" }).click();
  await expect(
    page.getByText(
      "We couldn’t confirm the save. Retry with the same details.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(
    page.getByRole("heading", { name: "Hike and train" }),
  ).toBeVisible();
  await expect(
    page.getByText("Journey created. Recording visible only to you."),
  ).toBeVisible();
  await openRecordings(page);
  const detailsButton = page.getByRole("button", {
    name: "Details for two-runs.gpx",
  });
  await detailsButton.press("Enter");
  const details = page.getByRole("dialog", { name: "two-runs.gpx" });
  await expect(
    details.getByRole("heading", { name: "Section 2" }),
  ).toBeVisible();
  await expect(
    details.getByRole("button", { name: /select section .* on map/i }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(detailsButton).toBeFocused();

  await openAccount(page);
  await page.getByRole("link", { name: "Your recordings" }).click();
  await page.getByRole("link", { name: "two-runs.gpx" }).click();
  await expect(
    page.getByRole("button", { name: "Download original" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit recording" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit saved recording", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adjust recording time" }).click();
  await page.getByLabel("Clock shift in minutes").fill("90");
  await page.getByRole("button", { name: "Apply time adjustment" }).click();
  await expect(page.getByText("Recording review updated.")).toBeVisible();
  await page.getByRole("link", { name: "Back to Your recordings" }).click();
  await expect(
    page.getByRole("button", { name: "Download original" }),
  ).toBeVisible();
});

test("resets sharing on destination changes and requires a fresh destination after membership changes", async ({
  page,
}) => {
  test.setTimeout(85_000);
  await page.clock.install();
  await signIn(page);
  const title = "Journey with renewed membership";
  await page.goto(`${site}/journeys/new?intent=plan`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await fillSchedule(page, "Start date", "2026-06-13");
  await fillSchedule(page, "Start time", "09:30");
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const journeyId = page.url().split("/").at(-1);
  expect(journeyId).toBeTruthy();
  await page.goto(`${site}/journeys/import?fresh=true`);
  await stage(page);
  await page.getByRole("button", { name: "Upload for review" }).click();
  await review(page);
  const select = page.getByLabel("Choose journey", { exact: true });
  const audience = page.getByLabel("Recording audience", { exact: true });
  const destination = page.getByLabel("Destination", { exact: true });
  await destination.selectOption("existing");
  if ((await select.inputValue()) !== journeyId)
    await select.selectOption(journeyId ?? "");
  await expect(select).toHaveValue(journeyId ?? "");
  await audience.selectOption("journey_review");
  await destination.selectOption("new");
  await expect(audience).toHaveValue("only_me");
  await destination.selectOption("existing");
  await select.selectOption(journeyId ?? "");
  const selectedJourneySummary = page.locator("p", { hasText: title });
  await expect(selectedJourneySummary).toBeVisible();
  const endpoint = `**/api/v1/recording-attachment-destinations/${journeyId}*`;
  const changed = randomUUID();
  await page.route(endpoint, async (route) => {
    const prior = await route.fetch();
    await route.fulfill({
      response: prior,
      json: { ...(await prior.json()), membershipGeneration: changed },
    });
  });
  const refreshed = page.waitForResponse((response) =>
    response.url().includes(`/recording-attachment-destinations/${journeyId}`),
  );
  await page.clock.fastForward(31_000);
  await refreshed;
  await expect(selectedJourneySummary).toBeVisible();
  await page
    .getByRole("button", { name: "Add recording", exact: true })
    .click();
  await expect(
    page.getByText(
      "The destination changed. Choose an available journey again.",
    ),
  ).toBeVisible();
  await expect(select).toHaveValue("");
  await expect(audience).toHaveValue("only_me");
});

test("adds a recording from journey detail and keeps the recorded path usable at large phone text", async ({
  page,
}) => {
  test.setTimeout(100_000);
  await page.route("https://*.mapbox.com/**", (route) => route.abort());
  await signIn(page);
  await page.goto(`${site}/journeys/new?intent=plan`);
  await page
    .getByLabel("Title", { exact: true })
    .fill("Trip already in history");
  await fillSchedule(page, "Start date", "2026-06-13");
  await fillSchedule(page, "Start time", "09:30");
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Trip already in history" }),
  ).toBeVisible();
  const journeyUrl = page.url();
  const journeyId = new URL(journeyUrl).pathname.split("/").at(-1);
  await openRecordings(page);
  const addRecording = page.getByRole("button", {
    name: "Add recording",
    exact: true,
  });

  await page.setViewportSize({ width: 320, height: 850 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await addRecording.press("Enter");
  const addition = page.getByRole("dialog", { name: "Add recording" });
  await expect(addition).toBeVisible();
  await addition.getByLabel("Choose GPX file").setInputFiles(fixture);
  await addition.getByRole("button", { name: "Upload for review" }).click();
  await expect(
    addition.getByRole("heading", { name: "Review recording" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(addition.getByLabel("Choose journey")).toHaveCount(0);
  await expect(
    addition.getByText(/outside the journey’s schedule/),
  ).toBeVisible();
  const checkedJourney = Promise.withResolvers<void>();
  const releaseJourney = Promise.withResolvers<void>();
  await page.route(
    `**/api/v1/journeys/${journeyId}`,
    async (route) => {
      checkedJourney.resolve();
      await releaseJourney.promise;
      await route.continue();
    },
    { times: 1 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await checkedJourney.promise;
  try {
    await expect(addition.getByText("Checking journey access")).toBeVisible();
    await expect(
      addition.getByRole("heading", { name: "Review recording" }),
    ).toBeHidden();
  } finally {
    releaseJourney.resolve();
  }
  await expect(
    addition.getByRole("heading", { name: "Review recording" }),
  ).toBeVisible();
  const hasRoute = await page
    .getByRole("region", { name: "Journey route", includeHidden: true })
    .count();
  if (hasRoute) {
    await expect(page.getByText("No recorded route available")).toBeVisible();
  }
  let commandId = "";
  await page.route(
    "**/api/v1/imports/*/commit",
    async (route) => {
      commandId = route.request().postDataJSON().commandId;
      const committed = await route.fetch();
      expect(committed.ok()).toBeTruthy();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await addition
    .getByRole("button", { name: "Add recording", exact: true })
    .press("Enter");
  await expect(
    addition.getByRole("button", { name: "Retry save" }),
  ).toBeVisible();
  expect(commandId).toBeTruthy();
  expect(await hasRecordingCommand(page, commandId)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(addRecording).toBeFocused();
  await expect(addRecording).toBeInViewport();
  await addRecording.press("Enter");
  await expect(
    addition.getByText("Recording added to this journey."),
  ).toBeVisible();
  expect(await hasRecordingCommand(page, commandId)).toBe(false);
  const reloadingRoute = Promise.withResolvers<void>();
  const showRoute = Promise.withResolvers<void>();
  if (hasRoute) {
    await page.route(
      "**/recordings/overview",
      async (route) => {
        reloadingRoute.resolve();
        await showRoute.promise;
        await route.continue();
      },
      { times: 1 },
    );
  }
  try {
    await addition
      .getByRole("button", { name: "Done", exact: true })
      .press("Enter");
    if (hasRoute) await reloadingRoute.promise;
    await expect(addition).toBeHidden();
  } finally {
    showRoute.resolve();
  }
  if (hasRoute) {
    await expect(
      page.getByRole("img", { name: "Recorded route overview" }),
    ).toBeVisible();
  }
  await expect(page).toHaveURL(journeyUrl);
  await expect(addRecording).toBeFocused();
  await expect(addRecording).toBeInViewport();
  await expect(
    page.getByText("Recording added. Recording visible only to you."),
  ).toBeVisible();
  const detailsButton = page.getByRole("button", {
    name: "Details for two-runs.gpx",
  });
  const details = page.getByRole("dialog", { name: "two-runs.gpx" });
  for (const mode of ["Light", "Dark", "Outdoor"] as const) {
    await chooseAppearance(page, mode);
    await detailsButton.press("Enter");
    await expect(
      details.getByRole("heading", { name: "Recorded sections" }),
    ).toBeVisible();
    await expect(
      details.getByRole("heading", { name: "Section 2" }),
    ).toBeVisible();
    const widths = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      innerWidth,
    ]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
    const accessibility = await new AxeBuilder({ page })
      .include('[data-slot="dialog-content"]')
      .withTags(wcagAATags)
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(detailsButton).toBeFocused();
    await expect(detailsButton).toBeInViewport();
  }
  await page
    .getByRole("link", { name: "Back to Journeys", exact: true })
    .click();
  const checked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route(
    /\/api\/v1\/journeys\/[^/]+\/recordings(?:\?.*)?$/,
    async (route) => {
      checked.resolve();
      await release.promise;
      await route.fulfill({ json: { recordings: [], nextCursor: null } });
    },
  );
  try {
    await page.getByRole("link", { name: /Trip already in history/ }).click();
    await checked.promise;
    await expect(page.getByText("two-runs.gpx", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    release.resolve();
  }
  await openRecordings(page);
  await expect(page.getByText("No recordings available.")).toBeVisible();
});
