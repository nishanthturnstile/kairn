import { gpxLimits } from "@kairn/contracts/recording-limits";
import type {
  RecordingBatchOverlay,
  RecordingBatchReview,
  RecordingOverlay,
} from "@kairn/contracts/recordings";
import { and, asc, eq, ne, notInArray, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { DatabaseTransaction } from "../../db/index.js";
import { originalActive, selectImports } from "./access.js";
import {
  combineRecordingOverviews,
  previewSectionExclusions,
  readOverviewOverlay,
} from "./overlay.js";
import {
  readRecordingReview,
  readSelectionFacts,
  type StoredSelection,
} from "./review.js";
import {
  recordingOriginals,
  recordingSections,
  recordingUploads,
} from "./schema.js";

async function readyFiles(tx: DatabaseTransaction, batchId: string) {
  const entries = await selectImports(tx)
    .where(
      and(
        eq(recordingUploads.batchId, batchId),
        eq(recordingOriginals.stage, "ready"),
        originalActive,
      ),
    )
    .orderBy(asc(recordingUploads.batchPosition));
  return Promise.all(
    entries.map(async (entry) => ({
      entry,
      position: entry.batchPosition ?? 0,
      selection: await readRecordingReview(tx, entry.id, entry.revision),
    })),
  );
}

type SelectionFacts = Awaited<ReturnType<typeof readSelectionFacts>>;

function selectionFingerprint(selection: StoredSelection) {
  return JSON.stringify([
    [...selection.excluded].sort((left, right) => left - right),
    [...selection.splits]
      .sort(
        (left, right) =>
          left.section - right.section || left.beforePoint - right.beforePoint,
      )
      .map(({ section, beforePoint }) => [section, beforePoint]),
    selection.clock?.shiftMinutes ?? null,
    selection.clock?.displayTimeZone ?? null,
  ]);
}

export async function summarizeBatch(
  tx: DatabaseTransaction,
  batchId: string,
  readLegacyGain = false,
) {
  const ready = await readyFiles(tx, batchId);
  const [{ total, firstPosition }] = await tx
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      firstPosition: sql<number | null>`min(${recordingUploads.batchPosition})`,
    })
    .from(recordingUploads)
    .where(
      and(
        eq(recordingUploads.batchId, batchId),
        ne(recordingUploads.state, "aborted"),
      ),
    );
  // A legacy lookup may read all sample pages for a source. Bound that work
  // to one source, including when several uploads refer to the same bytes.
  const allowLegacyGain =
    readLegacyGain &&
    ready.length === total &&
    new Set(ready.map(({ entry }) => entry.originalId)).size === 1;
  const sources = new Map<
    string,
    { fingerprint: string; facts: SelectionFacts }
  >();
  let duplicateReviewConflict = false;
  const files = [];
  for (const file of ready) {
    const { originalId } = file.entry;
    const fingerprint = selectionFingerprint(file.selection);
    const prior = sources.get(originalId);
    const facts =
      prior?.fingerprint === fingerprint
        ? prior.facts
        : await readSelectionFacts(
            tx,
            originalId,
            file.selection,
            allowLegacyGain && !prior,
          );
    if (!prior) sources.set(originalId, { fingerprint, facts });
    if (prior && prior.fingerprint !== fingerprint)
      duplicateReviewConflict = true;
    files.push({ ...file, summary: facts.summary });
  }
  const first = files.find((file) => file.position === firstPosition);
  let trackName: string | undefined;
  if (first && !first.entry.documentName) {
    const excluded = previewSectionExclusions(first.selection);
    const [named] = await tx
      .select({ name: sql<string>`${recordingSections.summary}->>'trackName'` })
      .from(recordingSections)
      .where(
        and(
          eq(recordingSections.originalId, first.entry.originalId),
          sql`${recordingSections.summary}->>'trackName' is not null`,
          sql`(${recordingSections.summary}->'measurements'->>'sampleCount')::int >= 2`,
          excluded.length
            ? notInArray(recordingSections.ordinal, excluded)
            : undefined,
        ),
      )
      .orderBy(asc(recordingSections.ordinal))
      .limit(1);
    trackName = named?.name;
  }
  const suggested =
    first?.entry.documentName ||
    trackName ||
    first?.entry.fileName.replace(/\.gpx$/i, "");
  let start: Temporal.Instant | undefined;
  let end: Temporal.Instant | undefined;
  for (const { summary } of files) {
    const window = summary.recordedWindow;
    if (!window) {
      start = end = undefined;
      break;
    }
    const firstPoint = Temporal.Instant.from(window.start);
    const lastPoint = Temporal.Instant.from(window.end);
    if (!start || Temporal.Instant.compare(firstPoint, start) < 0)
      start = firstPoint;
    if (!end || Temporal.Instant.compare(lastPoint, end) > 0) end = lastPoint;
  }
  const review: RecordingBatchReview = {
    title:
      suggested
        ?.trim()
        .slice(0, 120)
        .replace(/[\uD800-\uDBFF]$/u, "")
        .trim() || "Recorded journey",
    recordedWindow:
      start && end ? { start: start.toString(), end: end.toString() } : null,
    timeZone: "UTC",
    files: files.map(({ entry, position, summary }) => ({
      id: entry.id,
      fileName: entry.fileName,
      position,
      revision: entry.revision,
      sectionCount: summary.sectionCount,
    })),
    complete:
      !duplicateReviewConflict &&
      files.length > 0 &&
      files.length === total &&
      files.every(({ summary }) => summary.sectionCount > 0),
  };
  if (duplicateReviewConflict) review.duplicateReviewConflict = true;
  if (review.complete)
    review.measurements = batchMeasurements(
      [...sources.values()].map(({ facts }) => facts),
    );
  return { review, files };
}

function batchMeasurements(sources: SelectionFacts[]) {
  const windows = sources.flatMap(({ intervals }) => intervals ?? []);
  windows.sort((left, right) =>
    left.start < right.start ? -1 : left.start > right.start ? 1 : 0,
  );
  const canSum =
    sources.length === 1 ||
    (sources.every(({ intervals }) => intervals !== null) &&
      windows.every(
        ({ start }, index) => index === 0 || start > windows[index - 1].end,
      ));
  const files = sources.map(({ summary }) => summary);
  function sum(
    key: "distanceMetres" | "elapsedSeconds" | "elevationGainMetres",
  ) {
    if (!canSum || files.some((file) => file[key] === null)) return null;
    const total = files.reduce((value, file) => value + (file[key] ?? 0), 0);
    return Number.isFinite(total) ? total : null;
  }
  const lows = files.flatMap(({ elevationMinMetres }) =>
    elevationMinMetres === null ? [] : [elevationMinMetres],
  );
  const highs = files.flatMap(({ elevationMaxMetres }) =>
    elevationMaxMetres === null ? [] : [elevationMaxMetres],
  );
  return {
    distanceMetres: sum("distanceMetres"),
    elapsedSeconds: sum("elapsedSeconds"),
    elevationGainMetres: sum("elevationGainMetres"),
    elevationMinMetres: lows.length ? Math.min(...lows) : null,
    elevationMaxMetres: highs.length ? Math.max(...highs) : null,
  };
}

export async function overlayBatch(
  tx: DatabaseTransaction,
  batchId: string,
): Promise<RecordingBatchOverlay> {
  const ready = await readyFiles(tx, batchId);
  const paths: RecordingOverlay["paths"] = [];
  const budget = Math.max(128, Math.floor(4096 / Math.max(1, ready.length)));
  for (const { entry, position, selection } of ready) {
    const overlay = await readOverviewOverlay(
      tx,
      entry.originalId,
      selection,
      budget,
    );
    for (const path of overlay.paths) {
      paths.push({
        ...path,
        section: position * gpxLimits.sections + path.section,
        series: position,
      });
    }
  }
  return {
    ...combineRecordingOverviews(paths),
    files: ready.map(({ entry }) => ({
      id: entry.id,
      revision: entry.revision,
    })),
  };
}
