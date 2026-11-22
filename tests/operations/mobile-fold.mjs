// Run against an open, device-bound agent-device session with Kairn's Metro running.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const [driver] = process.argv.slice(2);
assert(
  driver,
  "Pass the device-bound agent-device executable as the first argument",
);
function device(...args) {
  return execFileSync(driver, args, { encoding: "utf8", timeout: 60000 });
}
const snapshot = () => device("snapshot", "-i");
async function findVisible(label, kind, timeout) {
  const deadline = Date.now() + timeout;
  do {
    const line = snapshot()
      .split("\n")
      .find(
        (line) =>
          (line.includes(`"${label}"`) || line.includes(`"${label}, busy"`)) &&
          (!kind || line.includes(`[${kind}]`)) &&
          line.startsWith("@e"),
      );
    if (line) return line.split(" ")[0];
    await wait(150);
  } while (Date.now() < deadline);
}
async function visible(label, kind) {
  const ref = await findVisible(label, kind, 4000);
  assert(ref, `Could not find "${label}" on the current screen`);
  return ref;
}
async function tap(label, kind) {
  const ref = await visible(label, kind);
  device("press", ref);
  await wait(450);
}
async function tapAndSee(label, next) {
  const ref = await visible(label);
  device("press", ref, "--settle", "--timeout", "5000");
  // The iOS runner can dispatch a tap before the presenting transition completes.
  // Retry only when the next state is absent and the same control is still visible.
  if (await findVisible(next, undefined, 1400)) return;
  await tap(label);
  await visible(next);
}
async function choose(label, current, next) {
  await tapAndSee(`${label}, ${current}`, next);
  await tapAndSee(next, `${label}, ${next}`);
}
async function open(section = "") {
  device(
    "open",
    "dev.kairn.app",
    `kairn://design-system${section && `/${section}`}`,
  );
  await wait(450);
}
await open();
const searchField = snapshot().match(
  /^(@e\d+) \[text-field\].*\[editable\]/m,
)?.[1];
assert(searchField, "Missing library search input");
device("fill", searchField, "toast", "--delay-ms", "80");
await visible("Feedback", "button");
await open("feedback");
await tap("Show confirmation");
await tap("Show confirmation");
assert.equal(snapshot().split('"Dismiss confirmation"').length - 1, 1);
await tap("Dismiss confirmation");
assert(!snapshot().includes('"Dismiss confirmation"'));
await choose("Queue state", "Ready", "Interrupted");
await tap("Retry upload");
await visible("Queue state, Uploading");
await choose("Queue state", "Uploading", "Empty");
await tap("Add sample");
await visible("Queue state, Ready");

await open("foundations");
const initial = snapshot().match(/\[button\] "Appearance, ([^"]+)"/)?.[1];
assert(initial, "Missing appearance selector");
try {
  let current = initial;
  for (const next of ["Light", "Dark", "Outdoor", "System"]) {
    if (next !== current) await choose("Appearance", current, next);
    current = next;
  }
} finally {
  const current = snapshot().match(/\[button\] "Appearance, ([^"]+)"/)?.[1];
  if (current && current !== initial)
    await choose("Appearance", current, initial);
}
await open("actions");
await choose("Button size", "Standard", "Capture");
await tap("Save moment");
await visible("Saved", "button");
await tap("Discard saved sample");
await choose("Preview state", "Ready", "Saving");
await visible("Saving…", "button");
await tap("Reset sample");
await open("navigation");
await tap("Saved");
await visible("Archived");
await tap("Vertical navigation");
await open("selection");
await tap("Include captions");
await tap("Journey review");
await tap("Keep a local copy", "switch");
assert.match(snapshot(), /\[switch\] "Keep a local copy" \[unchecked\]/);
await tap("Keep a local copy", "switch");
assert.match(snapshot(), /\[switch\] "Keep a local copy" \[checked\]/);
await open("expression");
await choose(
  "Preview pattern",
  "Empty journey illustration",
  "Loading journeys",
);
await visible("Loading your journeys");
await open("surfaces");
await tap("Anu Menon, Coauthor");
assert(snapshot().includes("Can review shared moments and edit chapters."));
await choose("Card density", "Standard", "Compact");
await open("overlays");
await choose("Sort moments", "Newest first", "Oldest first");
await tap("Sample bookmark");
await tap("Add bookmark");
await tap("Sample bookmark");
await tap("Remove bookmark");
await tap("Open sheet");
await tap("Close");
await tap("Open dialog");
const dialog = snapshot();
await tap(dialog.includes('"CLOSE"') ? "CLOSE" : "Close");

await open("fields");
await tap("Show password");
await tap("Hide password");
await tap("Pick start date");
if (snapshot().includes('"OK"')) await tap("OK");
else {
  if (!snapshot().includes('"Use date"'))
    device("scroll", "down", "--until", 'label="Use date"');
  await tap("Use date");
}
await tap("Pick start time");
if (snapshot().includes('"OK"')) await tap("OK");
else {
  if (!snapshot().includes('"Use time"'))
    device("scroll", "down", "--until", 'label="Use time"');
  await tap("Use time");
}
await open();
assert(snapshot().includes("Component library"));
console.log("Verified the mobile Fold catalog on the selected device.");
