import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import {
  journeyRecordingOverview,
  ownerRecordingPage,
} from "../../packages/contracts/src/recordings";
import { mailLink, site } from "./identity-fixture";
import { fillSchedule } from "./schedule-fixture";

test.skip(
  process.env.KAIRN_WEB_BATCHES !== "1",
  "Requires the GPX-first web build and private recording worker.",
);

async function signInForBatch(page: Page) {
  const network =
    test.info().project.use.browserName === "webkit" ? "203.0.113" : "192.0.2";
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": `${network}.${(test.info().line % 253) + 1}`,
  });
  const email = `gpx-batch-${randomUUID()}@example.test`;
  const password = "Synthetic-batch-browser-password";
  const signup = await page.request.post(`${site}/api/auth/sign-up/email`, {
    headers: { Origin: site },
    data: { email, password, name: "GPX batch test" },
  });
  expect(signup.ok()).toBe(true);
  const verify = await mailLink(email, "Verify your Kairn email");
  expect((await page.request.get(verify)).ok()).toBe(true);
  await page.goto(`${site}/journeys/new`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function chooseBatchFiles(page: Page) {
  const recording = await readFile(
    new URL("../fixtures/gpx/two-runs.gpx", import.meta.url),
  );
  await page.getByLabel("GPX files", { exact: true }).setInputFiles([
    { name: "Outward.gpx", mimeType: "application/gpx+xml", buffer: recording },
    {
      name: "Homeward.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.concat([recording, Buffer.from("\n<!-- Return -->\n")]),
    },
  ]);
  return page.getByRole("list", { name: "Selected GPX files" });
}

function recordingsHeading(page: Page, count: number) {
  return page.getByRole("heading", {
    name: `Recordings · ${count} ${count === 1 ? "file" : "files"}`,
  });
}

test("creates, invites, adds a recording and deletes the same GPX journey", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route("https://*.mapbox.com/**", (route) => route.abort());
  await signInForBatch(page);
  await chooseBatchFiles(page);
  await page.getByRole("button", { name: "Upload for review" }).click();
  await expect(
    page.getByRole("button", { name: "Create journey", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });

  const address = `journey-lifecycle-${randomUUID()}@example.test`;
  await page.getByRole("button", { name: "Invite people" }).click();
  const invite = page.getByRole("dialog", { name: "Invite people" });
  await invite.getByRole("button", { name: "Invite by email" }).click();
  await invite.getByLabel("Email address").fill(address);
  await invite.getByRole("button", { name: "Add email" }).click();
  await invite.getByRole("button", { name: "Send invitations" }).click();
  await expect(invite).toBeHidden();
  await expect(page).toHaveURL(`${site}/journeys/new`);
  await mailLink(address, "Join a journey on Kairn", "/journey-invitations#");
  await page.getByRole("button", { name: "Open journey", exact: true }).click();
  await expect(page).toHaveURL(/\/journeys\/[0-9a-f-]{36}$/);
  const journeyPath = new URL(page.url()).pathname;
  const journeyApi = `${site}/api/v1${journeyPath}`;
  await expect(
    page.getByRole("heading", { name: "Sentier d’été & forêt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View people" }).click();
  const people = page.getByRole("dialog", { name: "People", exact: true });
  await expect(people.getByText(address, { exact: true })).toBeVisible();
  await people.getByRole("button", { name: "Close", exact: true }).click();

  await page
    .locator("summary")
    .filter({ hasText: /^Recordings$/ })
    .click();
  await page
    .getByRole("button", { name: "Add recording", exact: true })
    .click();
  const addition = page.getByRole("dialog", { name: "Add recording" });
  const original = await readFile(
    new URL("../fixtures/gpx/two-runs.gpx", import.meta.url),
  );
  await addition.getByLabel("Choose GPX file").setInputFiles({
    name: "Detour.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.concat([original, Buffer.from("\n<!-- Detour -->\n")]),
  });
  await addition.getByRole("button", { name: "Upload for review" }).click();
  await expect(
    addition.getByRole("heading", { name: "Review recording" }),
  ).toBeVisible({ timeout: 20_000 });
  const refreshed = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApi}/recordings/overview` && response.ok(),
  );
  await addition
    .getByRole("button", { name: "Add recording", exact: true })
    .click();
  await expect(addition).toBeHidden();
  await expect(page.getByText("Detour.gpx", { exact: true })).toBeVisible();
  const overview = journeyRecordingOverview.parse(
    await (await refreshed).json(),
  );
  expect(new Set(overview.paths.map(({ series }) => series)).size).toBe(3);

  await page
    .getByRole("button", { name: "Delete journey", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete journey?" })
    .getByRole("button", { name: "Delete journey", exact: true })
    .click();
  await expect(page).toHaveURL(`${site}/journeys`);
  await expect(
    page.getByRole("heading", { name: "No journeys yet" }),
  ).toBeVisible();
  expect((await page.request.get(journeyApi)).status()).toBe(404);
  const originals = await page.request.get(`${site}/api/v1/account/recordings`);
  expect(originals.ok()).toBe(true);
  expect(
    ownerRecordingPage.parse(await originals.json()).recordings,
  ).toHaveLength(3);
});

test("uploads a private batch, resumes an interrupted transfer and reopens the remaining file", async ({
  page,
}) => {
  test.setTimeout(65_000);
  await signInForBatch(page);
  const uploads = await chooseBatchFiles(page);
  await page.getByLabel("GPX files", { exact: true }).setInputFiles({
    name: "Discard.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from("<gpx/>"),
  });
  await expect(uploads.getByRole("listitem")).toHaveCount(3);
  const allowTransfer = Promise.withResolvers<void>();
  await page.route(
    "**/api/v1/uploads",
    async (route) => {
      await allowTransfer.promise;
      await route.continue().catch(() => {});
    },
    { times: 2 },
  );
  await page.route(
    "**/api/v1/uploads/*/parts/1",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Upload for review" }).click();
  try {
    for (const name of ["Outward.gpx", "Homeward.gpx"]) {
      await expect(
        uploads.getByRole("button", { name: `Remove ${name}`, exact: true }),
      ).toBeDisabled();
    }
    await uploads.getByRole("button", { name: "Remove Discard.gpx" }).click();
    await expect(page.getByRole("button", { name: "Add files" })).toBeFocused();
  } finally {
    allowTransfer.resolve();
  }
  await expect(
    uploads.getByText("Couldn’t upload this file. Try again."),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Resume upload" }).click();
  await expect(recordingsHeading(page, 2)).toBeVisible();
  await expect(uploads.getByText("Ready for review")).toHaveCount(2, {
    timeout: 20_000,
  });
  await uploads.getByRole("button", { name: "Remove Outward.gpx" }).click();
  await expect(uploads.getByText("Outward.gpx")).toHaveCount(0);
  await page.reload();
  await expect(recordingsHeading(page, 1)).toBeVisible();
  await expect(uploads.getByText("Homeward.gpx")).toBeVisible();
  await expect(uploads.getByText("Ready for review")).toHaveCount(1);
  await uploads.getByRole("button", { name: "Remove Homeward.gpx" }).click();
  await expect(uploads).toHaveCount(0);
});

test("reviews two recordings and reopens one journey after a lost save response and reload", async ({
  page,
}) => {
  test.setTimeout(65_000);
  await page.route("https://*.mapbox.com/**", (route) => route.abort());
  await signInForBatch(page);
  const uploads = await chooseBatchFiles(page);
  let incomplete = true;
  let mismatched = true;
  await page.route("**/api/v1/recording-batches/*/review", async (route) => {
    if (!incomplete) return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    await route.fulfill({
      response,
      json: { ...(await response.json()), complete: false },
    });
  });
  await page.route("**/api/v1/recording-batches/*/overlay", async (route) => {
    if (!mismatched) return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const overlay = await response.json();
    overlay.files[0].revision += 1;
    await route.fulfill({ response, json: overlay });
  });
  await page.getByRole("button", { name: "Upload for review" }).click();
  const refresh = page.getByRole("button", { name: "Refresh recordings" });
  await expect(refresh).toBeEnabled({ timeout: 20_000 });
  incomplete = false;
  await refresh.click();
  await expect(recordingsHeading(page, 2)).toBeVisible();
  await expect(uploads).toBeVisible();
  await expect(uploads).not.toHaveAttribute("tabindex", "0");
  const recordings = recordingsHeading(page, 2).getByRole("button");
  await expect(recordings).toHaveAttribute("aria-expanded", "true");
  await recordings.press("Enter");
  await expect(recordings).toHaveAttribute("aria-expanded", "false");
  await expect(uploads).toBeHidden();
  await expect(page.getByRole("button", { name: "Add files" })).toBeVisible();
  await recordings.press("Enter");
  await expect(uploads).toBeVisible();
  const review = page.getByRole("region", { name: "Route preview" });
  const routeOverview = review.getByRole("img", {
    name: "Recorded route overview",
  });
  await expect(
    review.getByText("Couldn’t show the current route preview"),
  ).toBeVisible();
  await expect(routeOverview).toBeHidden();
  const retryMap = review.getByRole("button", { name: "Try again" });
  await expect(retryMap).toBeEnabled();
  mismatched = false;
  await retryMap.click();
  await expect(routeOverview).toBeVisible();
  await expect
    .poll(() =>
      routeOverview.evaluate((node: HTMLCanvasElement) =>
        node
          .getContext("2d")
          ?.getImageData(0, 0, node.width, node.height)
          .data.some((value, index) => index % 4 === 3 && value > 0),
      ),
    )
    .toBe(true);
  const routeStats = review.getByRole("region", { name: "Route stats" });
  await expect(
    routeStats.getByText("Elevation gain", { exact: true }),
  ).toBeVisible();
  await expect(
    routeStats.getByText("Elevation range", { exact: true }),
  ).toBeVisible();
  await review.getByRole("button", { name: "Hide map" }).click();
  await expect(routeOverview).toBeHidden();
  await expect(routeStats).toBeVisible();
  const showMap = review.getByRole("button", { name: "Show map" });
  await expect(showMap).toHaveAttribute("data-variant", "outline");
  await showMap.click();
  await expect(routeOverview).toBeVisible();
  const journeyReview = page.getByRole("region", { name: "Journey review" });
  const recordedTime = journeyReview.getByRole("region", {
    name: "Recorded time",
  });
  const title = journeyReview.getByLabel("Journey title");
  const editTitle = journeyReview.getByRole("button", { name: "Edit title" });
  const doneEditing = journeyReview.getByRole("button", {
    name: "Done",
    exact: true,
  });
  await expect(
    journeyReview.getByRole("button", { name: "Add files" }),
  ).toHaveAttribute("data-variant", "outline");
  await expect(
    journeyReview.getByRole("button", { name: "Invite people" }),
  ).toHaveAttribute("data-variant", "outline");
  await expect(
    journeyReview.getByRole("heading", { name: "Sentier d’été & forêt" }),
  ).toBeVisible();
  await expect(title).toHaveCount(0);
  await expect(recordedTime.getByText("UTC", { exact: true })).toBeVisible();
  await expect(recordedTime.locator("time").first()).toHaveAttribute(
    "datetime",
    /^2026-06-12T08:00:00/,
  );
  await expect(uploads.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Outward.gpx", { exact: true })).toHaveCount(1);
  await uploads
    .getByRole("button", { name: "Show sections for Outward.gpx" })
    .click();
  const outward = uploads.getByRole("region", {
    name: "Sections for Outward.gpx",
  });
  await expect(
    outward.getByRole("heading", { name: "Section 1", exact: true }),
  ).toBeVisible();
  await expect(
    outward.getByText("Elevation range", { exact: true }),
  ).toHaveCount(2);
  const journeyTitle = "Two recordings, one journey";
  await editTitle.scrollIntoViewIfNeeded();
  const editPosition = await editTitle.boundingBox();
  await editTitle.press("Enter");
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Sentier d’été & forêt");
  const donePosition = await doneEditing.boundingBox();
  if (!editPosition || !donePosition)
    throw new Error("Title action is missing");
  expect(Math.abs(editPosition.y - donePosition.y)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      editPosition.x + editPosition.width - donePosition.x - donePosition.width,
    ),
  ).toBeLessThanOrEqual(1);
  await title.fill(journeyTitle);
  const save = journeyReview.getByRole("button", {
    name: "Create journey",
    exact: true,
  });
  const refreshing = Promise.withResolvers<void>();
  const releaseRefresh = Promise.withResolvers<void>();
  await page.route(
    "**/api/v1/recording-batches/*/review",
    async (route) => {
      refreshing.resolve();
      await releaseRefresh.promise;
      await route.continue().catch(() => {});
    },
    { times: 1 },
  );
  await page.getByLabel("GPX files", { exact: true }).setInputFiles({
    name: "Unreadable.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from("<gpx/>"),
  });
  try {
    await refreshing.promise;
    await expect(title).toBeFocused();
    await expect(title).toHaveValue(journeyTitle);
    await expect(save).toBeDisabled();
  } finally {
    releaseRefresh.resolve();
  }
  await doneEditing.click();
  await expect(editTitle).toBeFocused();
  const titleHeading = journeyReview.getByRole("heading", {
    name: journeyTitle,
  });
  await expect(titleHeading).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Upload for review" }).click();
  await expect(
    uploads.getByText("This file doesn’t contain a supported GPX recording"),
  ).toBeVisible({ timeout: 20_000 });
  await expect(routeOverview).toBeVisible();
  await expect(titleHeading).toBeVisible();
  await uploads.getByRole("button", { name: "Remove Unreadable.gpx" }).click();
  await expect(save).toBeEnabled();

  const address = `batch-background-${randomUUID()}@example.test`;
  await journeyReview.getByRole("button", { name: "Invite people" }).click();
  const invitations = page.getByRole("dialog", { name: "Invite people" });
  await invitations.getByRole("button", { name: "Invite by email" }).click();
  await invitations.getByLabel("Email address").fill(address);
  await invitations.getByRole("button", { name: "Add email" }).click();
  await page.keyboard.press("Escape");
  await expect(invitations).toBeHidden();
  const posting = Promise.withResolvers<void>();
  const deliver = Promise.withResolvers<void>();
  await page.route(
    "**/api/v1/journeys/*/invitations",
    async (route) => {
      posting.resolve();
      await deliver.promise;
      await route.continue();
    },
    { times: 1 },
  );

  const submissions: (string | null)[] = [];
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route("**/api/v1/recording-batches/*/commit", async (route) => {
    submissions.push(route.request().postData());
    if (submissions.length > 1) {
      await route.continue();
      return;
    }
    started.resolve();
    await release.promise;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("failed");
  });
  await save.click();
  try {
    await started.promise;
    await expect(
      journeyReview.getByRole("button", { name: "Creating journey…" }),
    ).toBeDisabled();
    await expect(routeOverview).toBeVisible();
    await expect(titleHeading).toBeVisible();
    await expect(editTitle).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Add files" }),
    ).toBeDisabled();
  } finally {
    release.resolve();
  }
  const retry = page.getByRole("button", { name: "Retry save", exact: true });
  await expect(
    journeyReview.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeFocused();
  const details = page.getByRole("button", {
    name: "Enter details without GPX",
  });
  await expect(details).toBeDisabled();
  await page.reload();
  await expect(retry).toBeVisible();
  await expect(details).toBeDisabled();
  await retry.click();
  try {
    await posting.promise;
    await expect(page).toHaveURL(/\/journeys\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Sending invitations…")).toBeVisible();
  } finally {
    deliver.resolve();
  }
  await mailLink(address, "Join a journey on Kairn", "/journey-invitations#");
  await expect(
    page.getByRole("heading", { name: journeyTitle, exact: true }),
  ).toBeVisible();
  const route = page.getByRole("region", {
    name: "Journey route",
    exact: true,
  });
  const map = route
    .getByRole("region", { name: "Interactive map of the recorded journey" })
    .or(route.getByRole("img", { name: "Recorded route overview" }));
  await expect(map).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const overview = await page.request.get(
    `${page.url().replace("/journeys/", "/api/v1/journeys/")}/recordings/overview`,
  );
  expect(overview.ok()).toBe(true);
  const { paths, limited } = await overview.json();
  expect(
    new Set(paths.map(({ series }: { series: number }) => series)).size,
  ).toBe(2);
  expect(limited).toBe(false);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(map).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[1]).toBe(submissions[0]);
  await page.goto(`${site}/journeys/new`);
  await expect(
    page.getByRole("heading", { name: "Add GPX files" }),
  ).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test("pauses an upload, preserves both drafts and opens an unfinished details save", async ({
  page,
}) => {
  test.setTimeout(65_000);
  await signInForBatch(page);
  const gpx = page.getByRole("button", { name: "Back to GPX upload" });
  const details = page.getByRole("button", {
    name: "Enter details without GPX",
  });
  const recording = await readFile(
    new URL("../fixtures/gpx/two-runs.gpx", import.meta.url),
  );
  const padding = Buffer.from(`\n<!--${" ".repeat(64 * 1024)}-->`.repeat(144));
  await page.getByLabel("GPX files", { exact: true }).setInputFiles({
    name: "Pause.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.concat([recording, padding]),
  });
  const part = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route(
    "**/api/v1/uploads/*/parts/2",
    async (route) => {
      part.resolve();
      await release.promise;
      await route.abort().catch(() => {});
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Upload for review" }).click();
  try {
    await part.promise;
    await expect(details).toBeDisabled();
    const progress = page.getByRole("progressbar", {
      name: "Upload progress for Pause.gpx",
    });
    await expect(progress).toHaveAttribute("max", "100");
    await expect(progress).toHaveJSProperty("value", 89);
    await page.getByRole("button", { name: "Pause upload" }).click();
  } finally {
    release.resolve();
  }
  const resume = page.getByRole("button", { name: "Resume upload" });
  await expect(resume).toBeFocused();
  await details.click();
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("A different trip next month");
  await gpx.click();
  await expect(page.getByText("Upload paused")).toBeVisible();
  const reading = Promise.withResolvers<void>();
  await page.route(
    "**/api/v1/imports/*",
    async (route) => {
      await reading.promise;
      await route.continue().catch(() => {});
    },
    { times: 1 },
  );
  await resume.click();
  try {
    await expect(
      page.getByText("Reading recordings and preparing the route preview"),
    ).toBeVisible();
  } finally {
    reading.resolve();
  }
  await expect(recordingsHeading(page, 1)).toBeVisible();
  await expect(page.getByText("Pause.gpx", { exact: true })).toBeVisible();
  await details.click();
  await expect(title).toHaveValue("A different trip next month");
  await fillSchedule(page, "Start date", "2026-12-13");
  await fillSchedule(page, "Start time", "09:30");
  await page.route(
    "**/api/v1/journeys",
    async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  const retry = page.getByRole("button", { name: "Retry save", exact: true });
  await expect(retry).toBeVisible();
  await expect(gpx).toBeDisabled();
  await page.reload();
  await expect(title).toHaveValue("A different trip next month");
  await expect(gpx).toBeDisabled();
  await retry.click();
  await expect(
    page.getByRole("heading", { name: "A different trip next month" }),
  ).toBeVisible();
});

test("keeps recording and invitation lists usable on short and narrow screens", async ({
  page,
}) => {
  test.setTimeout(95_000);
  await page.setViewportSize({ width: 1440, height: 600 });
  await signInForBatch(page);
  const recording = await readFile(
    new URL("../fixtures/gpx/two-runs.gpx", import.meta.url),
  );
  const names = Array.from({ length: 8 }, (_, index) =>
    index === 0
      ? `${"Yercaud_Hills_".repeat(6)}Leg_1.gpx`
      : `Leg_${index + 1}.gpx`,
  );
  const manySections = Buffer.from(
    recording
      .toString()
      .replace(/<g:trkseg>[\s\S]*?<\/g:trkseg>/, (segment) =>
        segment.repeat(27),
      ),
  );
  await page.getByLabel("GPX files", { exact: true }).setInputFiles(
    names.map((name, index) => ({
      name,
      mimeType: "application/gpx+xml",
      buffer:
        index === 0
          ? manySections
          : Buffer.concat([recording, Buffer.from(`\n<!-- Leg ${index} -->`)]),
    })),
  );
  const files = page.getByRole("list", { name: "Selected GPX files" });
  const upload = page.getByRole("button", { name: "Upload for review" });
  await expect(files.getByText("On this device")).toHaveCount(8);
  await expect(files).toHaveAttribute("tabindex", "0");
  await upload.click();
  await expect(files.getByText("Ready for review")).toHaveCount(8, {
    timeout: 45_000,
  });
  await expect(recordingsHeading(page, 8)).toBeVisible();
  const desktopHeight = await files.evaluate((node) => node.clientHeight);
  expect(await files.evaluate((node) => node.scrollHeight)).toBeGreaterThan(
    desktopHeight,
  );
  await files.press("End");
  await expect
    .poll(() => files.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  const sections = files.getByRole("button", {
    name: "Show sections for Leg_8.gpx",
  });
  await sections.click();
  const eighthPanel = files.getByRole("region", {
    name: "Sections for Leg_8.gpx",
  });
  const eighthFirstSection = eighthPanel.getByRole("heading", {
    name: "Section 1",
    exact: true,
  });
  await expect(eighthFirstSection).toBeVisible();
  expect(
    await eighthFirstSection.evaluate((heading) => {
      const list = heading.closest("ul")?.getBoundingClientRect();
      if (!list) return false;
      const bounds = heading.getBoundingClientRect();
      return bounds.top >= list.top && bounds.bottom <= list.bottom;
    }),
  ).toBe(true);
  const seventhSections = files.getByRole("button", {
    name: /sections for Leg_7\.gpx/,
  });
  await seventhSections.click();
  await expect(eighthPanel).toBeHidden();
  await expect(seventhSections).toHaveAttribute("aria-expanded", "true");
  const seventhPanel = files.getByRole("region", {
    name: "Sections for Leg_7.gpx",
  });
  await expect(seventhPanel).toBeVisible();
  const disclosure = recordingsHeading(page, 8).getByRole("button");
  await disclosure.click();
  await expect(files).toBeHidden();
  await disclosure.click();
  await expect(seventhPanel).toBeVisible();
  const firstPanel = files.getByRole("region", {
    name: `Sections for ${names[0]}`,
  });
  await files
    .getByRole("button", { name: `Show sections for ${names[0]}` })
    .click();
  const firstPage = firstPanel.getByRole("heading", {
    name: "Section 1",
    exact: true,
  });
  const secondPage = firstPanel.getByRole("heading", {
    name: "Section 26",
    exact: true,
  });
  await firstPanel
    .getByRole("button", { name: "Next", exact: true })
    .press("Enter");
  await expect(secondPage).toBeFocused();
  await firstPanel
    .getByRole("button", { name: "Previous", exact: true })
    .press("Enter");
  await expect(firstPage).toBeFocused();
  await files
    .getByRole("button", { name: `Hide sections for ${names[0]}` })
    .click();
  await expect(files).toHaveJSProperty("clientHeight", desktopHeight);
  await files.getByRole("button", { name: "Remove Leg_8.gpx" }).click();
  const removeSeventh = files.getByRole("button", { name: "Remove Leg_7.gpx" });
  await expect(removeSeventh).toBeFocused();
  await expect(recordingsHeading(page, 7)).toBeVisible();
  await expect(files).toHaveJSProperty("clientHeight", desktopHeight);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const horizontalOverflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  expect(await horizontalOverflow()).toBeLessThanOrEqual(1);
  const phoneHeight = await files.evaluate((node) => node.clientHeight);
  expect(await files.evaluate((node) => node.scrollHeight)).toBeGreaterThan(
    phoneHeight,
  );

  const invite = page.getByRole("button", {
    name: "Invite people",
    exact: true,
  });
  await invite.click();
  const dialog = page.getByRole("dialog", { name: "Invite people" });
  await dialog.getByRole("button", { name: "Invite by email" }).click();
  const suffix = randomUUID();
  const addresses = Array.from(
    { length: 8 },
    (_, index) =>
      `recipient-${"long".repeat(8)}-${suffix}-${index}@example.test`,
  );
  for (const address of addresses) {
    await dialog.getByLabel("Email address").fill(address);
    await dialog.getByRole("button", { name: "Add email" }).click();
  }
  const recipients = dialog.getByRole("list", { name: "Recipients" });
  await expect(recipients.getByRole("listitem")).toHaveCount(8);
  await expect(recipients).toHaveAttribute("tabindex", "0");
  expect(
    await recipients.evaluate((node) => node.scrollHeight - node.clientHeight),
  ).toBeGreaterThan(0);
  expect(
    await dialog.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  await dialog
    .getByRole("button", { name: `Remove ${addresses[7]} from draft` })
    .click();
  await expect(
    dialog.getByRole("button", { name: `Remove ${addresses[6]} from draft` }),
  ).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "Send invitations" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(invite).toBeFocused();
  await expect(page.getByText("7 people selected")).toBeVisible();
  await expect(files).toHaveJSProperty("clientHeight", phoneHeight);
  expect(await horizontalOverflow()).toBeLessThanOrEqual(1);

  for (const name of names.slice(3, 7).reverse()) {
    await files
      .getByRole("button", { name: `Remove ${name}`, exact: true })
      .click();
  }
  await expect(recordingsHeading(page, 3)).toBeVisible();
  await expect(files.getByRole("listitem")).toHaveCount(3);
  await expect(files).not.toHaveAttribute("tabindex", "0");
  expect(
    await files.evaluate((node) => node.scrollHeight - node.clientHeight),
  ).toBeLessThanOrEqual(1);
  await files
    .getByRole("button", { name: `Show sections for ${names[0]}` })
    .click();
  const sectionList = firstPanel.getByRole("list", {
    name: "Recording sections",
  });
  await expect(sectionList.getByRole("listitem")).toHaveCount(25);
  expect(
    await sectionList.evaluate((node) => node.scrollHeight - node.clientHeight),
  ).toBeGreaterThan(0);
  expect(
    await sectionList
      .locator("dl")
      .first()
      .evaluate((grid) => grid.clientWidth),
  ).toBeGreaterThanOrEqual(144);
  expect(await horizontalOverflow()).toBeLessThanOrEqual(1);
  await firstPanel
    .getByRole("button", { name: "Next", exact: true })
    .press("Enter");
  await expect(secondPage).toBeFocused();
  await invite.click();
  const sent = page.waitForResponse(
    (response) =>
      /\/api\/v1\/journeys\/[^/]+\/invitations$/.test(response.url()) &&
      response.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Send invitations", exact: true })
    .click();
  const response = await sent;
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.items).toHaveLength(7);
  expect(
    result.items.every(({ status }: { status: string }) => status === "queued"),
  ).toBe(true);
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(`${site}/journeys/new`);
  await expect(
    page.locator('[data-slot="receipt-toast"]').getByText("Invitations sent."),
  ).toBeVisible();
  const open = page.getByRole("button", { name: "Open journey", exact: true });
  await expect(invite).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Journey route" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry invitations" }),
  ).toHaveCount(0);
  await invite.click();
  const sentList = dialog.getByRole("list", { name: "Existing invitations" });
  await expect(sentList.getByRole("listitem")).toHaveCount(7);
  await expect(sentList).toHaveAttribute("tabindex", "0");
  expect(
    await sentList.evaluate((list) => list.scrollHeight - list.clientHeight),
  ).toBeGreaterThan(0);
  expect(
    await dialog.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await horizontalOverflow()).toBeLessThanOrEqual(1);
  const journeyId = new URL(response.url()).pathname.split("/").at(-2);
  expect(journeyId).toMatch(/^[a-f0-9-]{36}$/);
  await open.click();
  await expect(page).toHaveURL(`${site}/journeys/${journeyId}`);
});

test("reopens invitations on creation to retry, add new recipients and cancel", async ({
  page,
  browser,
}) => {
  test.setTimeout(100_000);
  const recipient = await browser.newContext();
  const suffix = randomUUID();
  const member = `batch-member-${suffix}@example.test`;
  const displayName = `GPX invite ${suffix}`;
  const external = `batch-external-${suffix}@example.test`;
  const removed = `batch-remove-${suffix}@example.test`;
  const password = "Synthetic-recording-invite-pass";
  try {
    await recipient.setExtraHTTPHeaders({ "X-Forwarded-For": "198.51.100.93" });
    const signup = await recipient.request.post(
      `${site}/api/auth/sign-up/email`,
      {
        headers: { Origin: site },
        data: { email: member, name: displayName, password },
      },
    );
    expect(signup.status()).toBe(200);
    const { user } = await signup.json();
    expect(
      (
        await recipient.request.get(
          await mailLink(member, "Verify your Kairn email"),
        )
      ).ok(),
    ).toBe(true);
    expect(
      (
        await recipient.request.post(`${site}/api/auth/sign-in/email`, {
          headers: { Origin: site },
          data: { email: member, password },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await recipient.request.patch(`${site}/api/v1/profile`, {
          headers: { Origin: site, "X-Expected-Account": user.id },
          data: { inviteDiscoverable: true },
        })
      ).ok(),
    ).toBe(true);

    await signInForBatch(page);
    await chooseBatchFiles(page);
    await page.getByRole("button", { name: "Upload for review" }).click();
    await expect(
      page.getByRole("region", { name: "Journey review" }),
    ).toBeVisible({ timeout: 20_000 });
    const invite = page.getByRole("button", {
      name: "Invite people",
      exact: true,
    });
    await invite.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Invite people" });
    const send = dialog.getByRole("button", {
      name: "Send invitations",
      exact: true,
    });
    await expect(send).toBeDisabled();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(`${site}/journeys/new`);
    const lookup = page.waitForResponse((response) =>
      /\/recording-batches\/[^/]+\/invitees\/search$/.test(response.url()),
    );
    await dialog.getByLabel("Name or exact email").fill(displayName);
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    const searchResponse = await lookup;
    expect(searchResponse.status()).toBe(200);
    const [found] = (await searchResponse.json()).items;
    expect(found).toMatchObject({ displayName, ambiguous: false });
    expect(found).not.toHaveProperty("email");
    const otherJourney = await page.request.post(`${site}/api/v1/journeys`, {
      headers: { Origin: site, "Idempotency-Key": randomUUID() },
      data: {
        title: "Another journey",
        timeZone: "UTC",
        intendedStart: "2030-06-14T09:30",
      },
    });
    expect(otherJourney.status()).toBe(201);
    const wrongTarget = await page.request.post(
      `${site}/api/v1/journeys/${(await otherJourney.json()).id}/invitations`,
      {
        headers: { Origin: site, "Idempotency-Key": randomUUID() },
        data: { recipients: [{ selection: found.selection }] },
      },
    );
    expect(await wrongTarget.json()).toEqual({
      items: [{ status: "invalid_email" }],
    });
    expect(
      (
        await recipient.request.post(searchResponse.url(), {
          headers: { Origin: site, "X-Expected-Account": user.id },
          data: { query: displayName },
        })
      ).status(),
    ).toBe(404);
    await dialog.getByRole("button", { name: `Add ${displayName}` }).click();
    await dialog.getByRole("button", { name: "Invite by email" }).click();
    for (const address of [external, removed]) {
      await dialog.getByLabel("Email address").fill(address);
      await dialog.getByRole("button", { name: "Add email" }).click();
    }
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 320, height: 875 });
    const largeText = await page.addStyleTag({
      content: "html { font-size: 200%; }",
    });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(send).toBeVisible();
    await largeText.evaluate((element) => element.remove());
    if (viewport) await page.setViewportSize(viewport);
    await dialog
      .getByRole("button", { name: `Remove ${removed} from draft` })
      .click();

    await page.route(
      "**/api/v1/recording-batches/*/commit",
      async (route) => {
        expect((await route.fetch()).ok()).toBe(true);
        await route.abort("failed");
      },
      { times: 1 },
    );

    const submitted = Promise.withResolvers<void>();
    const confirm = Promise.withResolvers<void>();
    const submissions: { key?: string; body: string | null }[] = [];
    await page.route("**/api/v1/journeys/*/invitations", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submissions.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      if (submissions.length === 2)
        return route.fulfill({
          status: 409,
          json: { code: "account_changed" },
        });
      if (submissions.length > 2) return route.continue();
      submitted.resolve();
      await confirm.promise;
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort("failed");
    });
    expect(submissions).toHaveLength(0);
    await send.click();
    const retrySend = dialog.getByRole("button", {
      name: "Retry send",
      exact: true,
    });
    await expect(retrySend).toBeFocused();
    expect(submissions).toHaveLength(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(invite).toBeFocused();
    await invite.press("Enter");
    await retrySend.click();
    try {
      await submitted.promise;
      await expect(page).toHaveURL(`${site}/journeys/new`);
      await expect(dialog).toBeHidden();
      await invite.click();
      await expect(dialog.getByText("Sending invitations…")).toBeVisible();
    } finally {
      confirm.resolve();
    }
    await expect(page).toHaveURL(`${site}/journeys/new`);
    const retry = dialog.getByRole("button", {
      name: "Retry invitations",
      exact: true,
    });
    await expect(retry).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].body).not.toContain(removed);
    await page.reload();
    await invite.click();
    const accountCheck = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/auth/get-session",
    );
    await retry.click();
    await expect.poll(() => submissions.length).toBe(2);
    await accountCheck;
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Open journey", exact: true }),
    ).toBeVisible();
    await invite.click();
    await retry.click();
    await expect(
      page
        .locator('[data-slot="receipt-toast"]')
        .getByText("Invitations sent."),
    ).toBeVisible();
    expect(submissions).toHaveLength(3);
    expect(submissions[0].key).toBeTruthy();
    expect(submissions[1]).toEqual(submissions[0]);
    expect(submissions[2]).toEqual(submissions[0]);
    const existing = dialog.getByRole("list", { name: "Existing invitations" });
    await expect(
      existing.getByText(displayName, { exact: true }),
    ).toBeVisible();
    await expect(existing.getByText(external, { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Send invitations", exact: true }),
    ).toBeDisabled();
    await Promise.all(
      [member, external].map((address) =>
        mailLink(address, "Join a journey on Kairn", "/journey-invitations#"),
      ),
    );

    const additional = `batch-added-${suffix}@example.test`;
    const savedLookup = page.waitForResponse((response) =>
      /\/api\/v1\/journeys\/[^/]+\/invitees\/search$/.test(response.url()),
    );
    await dialog.getByLabel("Name or exact email").fill(displayName);
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    expect((await savedLookup).ok()).toBe(true);
    await dialog.getByRole("button", { name: "Invite by email" }).click();
    const email = dialog.getByLabel("Email address");
    const add = dialog.getByRole("button", { name: "Add email" });
    await email.fill(external);
    await add.click();
    await expect(
      dialog.getByText("This person already has an invitation."),
    ).toBeVisible();
    await email.fill(additional);
    await add.click();
    const draft = dialog.getByRole("list", { name: "Recipients", exact: true });
    await expect(dialog.getByText("Not sent yet")).toBeVisible();
    await expect(draft.getByText(additional, { exact: true })).toBeVisible();
    await expect(existing.getByText(additional, { exact: true })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await invite.click();
    await expect(draft.getByText(additional, { exact: true })).toBeVisible();
    await dialog
      .getByRole("button", { name: "Send invitations", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(`${site}/journeys/new`);
    await expect.poll(() => submissions.length).toBe(4);
    expect(JSON.parse(submissions[3].body ?? "")).toEqual({
      recipients: [{ email: additional }],
    });
    expect(submissions[3].key).not.toBe(submissions[0].key);
    await mailLink(
      additional,
      "Join a journey on Kairn",
      "/journey-invitations#",
    );

    await invite.click();
    await expect(existing.getByText(additional, { exact: true })).toBeVisible();
    await dialog
      .getByRole("button", { name: `Cancel invitation to ${external}` })
      .click();
    await dialog.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(
      page.getByText("Invitation cancelled.", { exact: true }),
    ).toBeVisible();
    await expect(existing.getByText(external, { exact: true })).toHaveCount(0);
    await expect(existing.getByText(additional, { exact: true })).toBeVisible();
    await expect(draft).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(`${site}/journeys/new`);
    const checking = Promise.withResolvers<void>();
    const deny = Promise.withResolvers<void>();
    await page.route(
      "**/api/v1/journeys/*/invitations",
      async (route) => {
        checking.resolve();
        await deny.promise;
        await route.fulfill({ status: 404, json: { code: "not_found" } });
      },
      { times: 1 },
    );
    await invite.click();
    try {
      await checking.promise;
      await expect(existing).toHaveCount(0);
    } finally {
      deny.resolve();
    }
    await expect(
      dialog.getByText("Invitations are unavailable."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Send invitations", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name: "Back to Journeys" }).click();
    await page
      .getByRole("link", { name: "Create a journey", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Add GPX files" }),
    ).toBeVisible();
  } finally {
    await recipient.close();
  }
});
