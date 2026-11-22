import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";

// Open Chrome on the connected phone and serve the web catalog locally first.
const [serial, port = "58082"] = process.argv.slice(2);
if (!serial || !/^\d+$/.test(port)) {
  throw new Error(
    "Usage: node tests/operations/android-overlay-back.mjs <adb-serial> [web-port]",
  );
}
const adb = (...args) =>
  execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" }).trim();
const triggers = [
  ["Choose start date", "fields", "dialog"],
  ["Choose start time", "fields", "dialog"],
  ["Sort moments", "overlays", "menu"],
  ["Open dialog", "overlays", "dialog"],
  ["Open sheet", "overlays", "dialog"],
];
const devicePort = adb("reverse", "tcp:0", `tcp:${port}`);
let debuggerPort;
let browser;
let page;
try {
  debuggerPort = adb(
    "forward",
    "tcp:0",
    "localabstract:chrome_devtools_remote",
  );
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggerPort}`);
  page = await browser.contexts()[0].newPage();
  await page.bringToFront();
  const catalog = `http://127.0.0.1:${devicePort}/design-system`;
  for (const [name, section, role] of triggers) {
    await page.goto(`${catalog}#overview`);
    const url = `${catalog}#${section}`;
    await page.goto(url);
    const trigger = page.getByRole("button", { name, exact: true });
    await trigger.click();
    const popup = page.getByRole(role);
    await expect(popup).toBeVisible();
    adb("shell", "input", "keyevent", "KEYCODE_BACK");
    await expect(popup).toBeHidden();
    await expect(page).toHaveURL(url);
    await expect(trigger).toBeFocused();
    console.log(`Android Back dismissed "${name}" and restored focus.`);
  }
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  await expect(page).toHaveURL(`${catalog}#overview`);
} finally {
  try {
    await page?.close();
    await browser?.close();
  } finally {
    if (debuggerPort) adb("forward", "--remove", `tcp:${debuggerPort}`);
    adb("reverse", "--remove", `tcp:${devicePort}`);
  }
}
