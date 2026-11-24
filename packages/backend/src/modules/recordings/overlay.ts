import { gpxLimits } from "@kairn/contracts/recording-limits";
import type {
  RecordingOverlay,
  RecordingSection,
} from "@kairn/contracts/recordings";
import { notInArray, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../db/index.js";
import { type StoredSelection, selectRecordingSections } from "./review.js";
import { recordingSamplePages, recordingSections } from "./schema.js";

type Position = [number, number];

export function wrappedBounds(paths: Position[][]): RecordingOverlay["bounds"] {
  const longitudes: number[] = [];
  let south = 90;
  let north = -90;
  for (const path of paths) {
    for (const [longitude, latitude] of path) {
      longitudes.push((longitude + 360) % 360);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
    }
  }
  if (!longitudes.length) return null;
  longitudes.sort((left, right) => left - right);
  let largest = 0;
  let edge = 0;
  for (let index = 0; index < longitudes.length; index++) {
    const next = longitudes[index + 1] ?? longitudes[0] + 360;
    const gap = next - longitudes[index];
    if (gap > largest) {
      largest = gap;
      edge = next % 360;
    }
  }
  const west = edge > 180 ? edge - 360 : edge;
  return [west, south, west + 360 - largest, north];
}

// Select deterministic display samples while always retaining both ends of
// every continuous run. All measurements use the original sample sequence.
function displayIndices(first: number, last: number, budget: number) {
  const count = Math.min(last - first + 1, budget);
  return Array.from(
    { length: count },
    (_, index) => first + Math.round((index * (last - first)) / (count - 1)),
  );
}

export function alignPath(coordinates: Position[], west: number) {
  let previous = west;
  return coordinates.map(([longitude, latitude]): Position => {
    // Place each point in the world copy closest to the prior point.
    const unwrapped =
      longitude + 360 * Math.round((previous - longitude) / 360);
    previous = unwrapped;
    return [unwrapped, latitude];
  });
}

export function previewSectionExclusions(selection: StoredSelection) {
  return [
    ...new Set([
      ...selection.excluded,
      ...Object.entries(selection.splitSummaries ?? {}).flatMap(
        ([section, runs]) =>
          runs.some((run) => run.measurements.sampleCount >= 2)
            ? []
            : [Number(section)],
      ),
    ]),
  ];
}

async function selectOverviewSections(
  tx: DatabaseTransaction,
  originalId: string,
  selection: StoredSelection,
) {
  const excluded = previewSectionExclusions(selection);
  const exclusion = excluded.length
    ? sql`and ${notInArray(recordingSections.ordinal, excluded)}`
    : sql``;
  const { rows } = await tx.execute<{
    ordinal: number;
    limited: boolean;
    summary: Omit<RecordingSection, "ordinal" | "included">;
  }>(sql`
    with eligible as (
      select ordinal, summary, row_number() over (order by ordinal) as rank, count(*) over () as total
      from ${recordingSections}
      where original_id = ${originalId}::uuid
        and (summary->'measurements'->>'sampleCount')::int >= 2 ${exclusion}
    )
    select ordinal, summary, total > 8 as limited from eligible
    where total <= 8 or rank = 1 or
      ((rank - 1) * 7 / nullif(total - 1, 0)) > ((rank - 2) * 7 / nullif(total - 1, 0))
    order by ordinal
  `);
  return {
    sections: rows.map(({ ordinal, summary }) => ({
      ...summary,
      ordinal,
      included: true,
      splitRuns: selection.splitSummaries?.[ordinal],
    })),
    limited: rows[0]?.limited ?? false,
  };
}

export async function readOverlay(
  tx: DatabaseTransaction,
  originalId: string,
  selection: StoredSelection,
  cursor: number | undefined,
  through: number,
  selectedOnly = false,
): Promise<RecordingOverlay> {
  const page = await selectRecordingSections(
    tx,
    originalId,
    selection,
    cursor,
    selectedOnly,
  );
  return renderOverlay(
    tx,
    originalId,
    page.sections.filter((item) => item.included && item.ordinal <= through),
    4096,
  );
}

export async function readOverviewOverlay(
  tx: DatabaseTransaction,
  originalId: string,
  selection: StoredSelection,
  pointBudget: number,
) {
  const { sections, limited } = await selectOverviewSections(
    tx,
    originalId,
    selection,
  );
  return {
    ...(await renderOverlay(tx, originalId, sections, pointBudget)),
    limited,
  };
}

export function combineRecordingOverviews(
  paths: RecordingOverlay["paths"],
): RecordingOverlay {
  const bounds = wrappedBounds(paths.map(({ coordinates }) => coordinates));
  if (!bounds) return { version: 1, bounds, paths };
  const centre = (bounds[0] + bounds[2]) / 2;
  return {
    version: 1,
    bounds,
    paths: paths.map((path) => ({
      ...path,
      coordinates: alignPath(path.coordinates, centre),
    })),
  };
}

async function renderOverlay(
  tx: DatabaseTransaction,
  originalId: string,
  sections: RecordingSection[],
  pointBudget: number,
): Promise<RecordingOverlay> {
  const count = sections.reduce(
    (total, item) =>
      total +
      (item.splitRuns ?? [item]).filter(
        (run) => run.measurements.sampleCount >= 2,
      ).length,
    0,
  );
  const budget = Math.max(
    2,
    Math.min(512, Math.floor(pointBudget / Math.max(1, count))),
  );
  const paths: RecordingOverlay["paths"] = [];
  for (const section of sections) {
    const pathsInSection = (section.splitRuns ?? [section])
      .filter((run) => run.measurements.sampleCount >= 2)
      .map((run) => ({
        firstPointIndex: run.firstPointIndex,
        indices: displayIndices(
          run.firstPointIndex,
          run.lastPointIndex,
          budget,
        ),
      }));
    const requested = [
      ...new Set(pathsInSection.flatMap((run) => run.indices)),
    ];
    if (!requested.length) continue;
    const values = sql.join(
      requested.map((index) => sql`(${index}::integer)`),
      sql`, `,
    );
    const { rows } = await tx.execute<{
      requested: number;
      index: number | null;
      longitude: number;
      latitude: number;
    }>(sql`
      SELECT position.index AS requested, (sample.value->>'index')::integer AS index,
        (sample.value->>'longitude')::double precision AS longitude,
        (sample.value->>'latitude')::double precision AS latitude
      FROM (VALUES ${values}) AS position(index)
      JOIN ${recordingSamplePages} ON
        ${recordingSamplePages.originalId} = ${originalId}::uuid AND
        ${recordingSamplePages.section} = ${section.ordinal}::integer AND
        ${recordingSamplePages.page} = (position.index - ${section.firstPointIndex}::integer) / ${gpxLimits.samplePage}::integer
      CROSS JOIN LATERAL (
        SELECT ${recordingSamplePages.samples} -> ((position.index - ${section.firstPointIndex}::integer) % ${gpxLimits.samplePage}::integer) AS value
      ) AS sample
    `);
    const points = new Map(rows.map((row) => [row.requested, row]));
    for (const { indices, firstPointIndex } of pathsInSection) {
      const coordinates = indices.map((index): Position => {
        const sample = points.get(index);
        if (!sample || sample.index !== index)
          throw new Error("Missing recording overlay sample");
        return [sample.longitude, sample.latitude];
      });
      paths.push({ section: section.ordinal, firstPointIndex, coordinates });
    }
  }
  const bounds = wrappedBounds(paths.map(({ coordinates }) => coordinates));
  if (bounds)
    for (const path of paths)
      path.coordinates = alignPath(
        path.coordinates,
        bounds[0] + (bounds[2] - bounds[0]) / 2,
      );
  return { version: 1, bounds, paths };
}
