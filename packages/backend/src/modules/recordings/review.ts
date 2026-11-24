import type {
  RecordingRunSummary,
  RecordingSection,
  RecordingSelection,
} from "@kairn/contracts/recordings";
import { and, asc, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { DatabaseTransaction } from "../../db/index.js";
import {
  lockRecordingAccount,
  originalActive,
  selectImports,
} from "./access.js";
import { addSample, aggregateRunMeasurements, newRun } from "./measurements.js";
import {
  recordingAttachments,
  recordingCommits,
  recordingImports,
  recordingReviews,
  recordingSamplePages,
  recordingSections,
} from "./schema.js";

export type StoredSelection = RecordingSelection & {
  splitSummaries?: Record<number, RecordingRunSummary[]>;
  ownerCorrection?: true;
};
export const defaultSelection: StoredSelection = {
  excluded: [],
  splits: [],
};

export async function latestRecordingReview(
  tx: DatabaseTransaction,
  originalId: string,
  afterPlacement?: string,
) {
  const [latest] = await tx
    .select({
      importId: recordingImports.id,
      revision: recordingImports.reviewRevision,
      selection: recordingReviews.selection,
    })
    .from(recordingImports)
    .innerJoin(
      recordingCommits,
      eq(recordingCommits.importId, recordingImports.id),
    )
    .leftJoin(
      recordingReviews,
      and(
        eq(recordingReviews.importId, recordingImports.id),
        eq(recordingReviews.revision, recordingImports.reviewRevision),
      ),
    )
    .where(
      and(
        eq(recordingImports.originalId, originalId),
        afterPlacement
          ? and(
              sql`${recordingReviews.selection}->>'ownerCorrection' = 'true'`,
              gt(
                recordingReviews.createdAt,
                sql`(
        select ${recordingAttachments.reviewPinnedAt} from ${recordingAttachments}
        where ${recordingAttachments.id} = ${afterPlacement}::uuid
      )`,
              ),
            )
          : undefined,
      ),
    )
    .orderBy(
      sql`${recordingReviews.createdAt} desc nulls last`,
      desc(recordingImports.id),
    )
    .limit(1);
  return (
    latest && { ...latest, selection: latest.selection ?? defaultSelection }
  );
}

function adjustRun<Run extends RecordingRunSummary>(
  run: Run,
  minutes = 0,
): Run {
  if (!minutes) return run;
  const { firstInstant, lastInstant } = run.measurements;
  function adjust(instant: string | null) {
    if (!instant) return null;
    const shifted = Temporal.Instant.from(instant).add({ minutes }).toString();
    return /^\d{4}-/.test(shifted) ? shifted : null;
  }
  return {
    ...run,
    measurements: {
      ...run.measurements,
      firstInstant: adjust(firstInstant),
      lastInstant: adjust(lastInstant),
    },
  };
}

export async function readRecordingReview(
  tx: DatabaseTransaction,
  id: string,
  revision: number,
) {
  if (revision === 1) return defaultSelection;
  const [review] = await tx
    .select({ selection: recordingReviews.selection })
    .from(recordingReviews)
    .where(
      and(
        eq(recordingReviews.importId, id),
        eq(recordingReviews.revision, revision),
      ),
    );
  if (!review) throw new Error("Missing recording review revision");
  return review.selection;
}

function cutsBySection(selection: RecordingSelection) {
  const grouped = new Map<number, number[]>();
  for (const { section, beforePoint } of selection.splits) {
    const cuts = grouped.get(section);
    if (cuts) cuts.push(beforePoint);
    else grouped.set(section, [beforePoint]);
  }
  return grouped;
}

export async function hasSelectedPath(
  tx: DatabaseTransaction,
  originalId: string,
  selection: RecordingSelection,
) {
  const excluded = new Set(selection.excluded);
  const splits = cutsBySection(selection);
  const altered = [...new Set([...excluded, ...splits.keys()])];
  if (altered.length) {
    const rows = await tx
      .select()
      .from(recordingSections)
      .where(
        and(
          eq(recordingSections.originalId, originalId),
          inArray(recordingSections.ordinal, altered),
        ),
      );
    if (rows.length !== altered.length) return false;
    let hasPath = false;
    for (const { ordinal, summary } of rows) {
      let point = summary.firstPointIndex;
      for (const before of splits.get(ordinal) ?? []) {
        if (before <= point || before > summary.lastPointIndex) return false;
        if (!excluded.has(ordinal) && before - point >= 2) hasPath = true;
        point = before;
      }
      if (!excluded.has(ordinal) && summary.lastPointIndex - point >= 1)
        hasPath = true;
    }
    if (hasPath) return true;
  }
  const rows = await tx
    .select({ ordinal: recordingSections.ordinal })
    .from(recordingSections)
    .where(
      and(
        eq(recordingSections.originalId, originalId),
        altered.length
          ? notInArray(recordingSections.ordinal, altered)
          : undefined,
        sql`(${recordingSections.summary}->'measurements'->>'sampleCount')::integer >= 2`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function summarizeSelection(
  tx: DatabaseTransaction,
  originalId: string,
  selection: StoredSelection,
) {
  return (await readSelectionFacts(tx, originalId, selection)).summary;
}

export async function readSelectionFacts(
  tx: DatabaseTransaction,
  originalId: string,
  selection: StoredSelection,
  readLegacyGain = false,
) {
  const rows = await tx
    .select()
    .from(recordingSections)
    .where(
      and(
        eq(recordingSections.originalId, originalId),
        selection.excluded.length
          ? notInArray(recordingSections.ordinal, selection.excluded)
          : undefined,
      ),
    );
  const paths = rows
    .flatMap(({ ordinal, summary }) =>
      (selection.splitSummaries?.[ordinal] ?? [summary]).map((run) => ({
        ...run,
        ordinal,
      })),
    )
    .filter((item) => item.measurements.sampleCount >= 2)
    .map((run) => adjustRun(run, selection.clock?.shiftMinutes));
  let first: { time: string; instant: bigint } | undefined;
  let last: typeof first;
  const intervals: { start: bigint; end: bigint }[] = [];
  let complete = paths.length > 0;
  let elevationMinMetres: number | null = null;
  let elevationMaxMetres: number | null = null;
  for (const {
    breakBefore,
    measurements: {
      firstInstant,
      lastInstant,
      elapsedSeconds,
      elevationMinMetres: low,
      elevationMaxMetres: high,
    },
  } of paths) {
    if (low !== null)
      elevationMinMetres = Math.min(elevationMinMetres ?? low, low);
    if (high !== null)
      elevationMaxMetres = Math.max(elevationMaxMetres ?? high, high);
    if (
      elapsedSeconds === null ||
      !firstInstant ||
      !lastInstant ||
      breakBefore === "clock_reversal"
    ) {
      complete = false;
      continue;
    }
    const start = Temporal.Instant.from(firstInstant).epochNanoseconds;
    const end = Temporal.Instant.from(lastInstant).epochNanoseconds;
    intervals.push({ start, end });
    if (first === undefined || start < first.instant)
      first = { time: firstInstant, instant: start };
    if (last === undefined || end > last.instant)
      last = { time: lastInstant, instant: end };
  }
  const totals = aggregateRunMeasurements(
    paths.map(({ measurements }) => measurements),
  );
  const elevationGainMetres =
    paths.length === 1 || totals.distanceMetres !== null
      ? await totalElevationGain(tx, originalId, paths, readLegacyGain)
      : null;
  return {
    intervals: complete ? intervals : null,
    summary: {
      sectionCount: paths.length,
      ...totals,
      elevationMinMetres,
      elevationMaxMetres,
      elevationGainMetres,
      recordedWindow:
        complete && first && last
          ? { start: first.time, end: last.time }
          : null,
    },
  };
}

async function totalElevationGain(
  tx: DatabaseTransaction,
  originalId: string,
  paths: (RecordingRunSummary & { ordinal: number })[],
  readLegacyGain: boolean,
) {
  if (
    paths.some(({ measurements }) => measurements.elevationGainMetres === null)
  )
    return null;
  const legacy = paths.filter(
    ({ measurements }) => measurements.elevationGainMetres === undefined,
  );
  let total = paths.reduce(
    (sum, { measurements }) => sum + (measurements.elevationGainMetres ?? 0),
    0,
  );
  if (legacy.length) {
    if (
      !readLegacyGain ||
      legacy.some(
        ({ measurements }) => measurements.elevationMinMetres === null,
      )
    )
      return null;
    // Older imports retain the original samples. Partition by the selected run
    // so neither a GPX gap nor a review cut can add a synthetic elevation edge.
    const ranges = legacy.map(
      ({ ordinal, firstPointIndex, lastPointIndex }) => ({
        section: ordinal,
        first_index: firstPointIndex,
        last_index: lastPointIndex,
      }),
    );
    const expected = legacy.reduce(
      (sum, { measurements }) => sum + measurements.sampleCount,
      0,
    );
    const {
      rows: [result],
    } = await tx.execute<{ measured: string; gain: string }>(sql`
      with heights as (
        select point."elevationMetres" as height,
          lag(point."elevationMetres") over (
            partition by span.section, span.first_index order by point.index
          ) as previous
        from jsonb_to_recordset(${JSON.stringify(ranges)}::jsonb)
          as span(section integer, first_index integer, last_index integer)
        join ${recordingSamplePages} as pages
          on pages.original_id = ${originalId}::uuid and pages.section = span.section
          and (pages.samples->0->>'index')::integer <= span.last_index
          and (pages.samples->-1->>'index')::integer >= span.first_index
        cross join lateral jsonb_to_recordset(pages.samples)
          as point(index integer, "elevationMetres" numeric)
        where point.index between span.first_index and span.last_index
      )
      select count(height) as measured, coalesce(sum(greatest(height - previous, 0)), 0) as gain
      from heights
    `);
    if (Number(result.measured) !== expected) return null;
    total += Number(result.gain);
  }
  return Number.isFinite(total) ? total : null;
}

export async function updateRecordingReview(
  tx: DatabaseTransaction,
  session: { accountId: string },
  id: string,
  review: { revision: number; selection: RecordingSelection },
) {
  await lockRecordingAccount(tx, session.accountId);
  const [locked] = await tx
    .select({ revision: recordingImports.reviewRevision })
    .from(recordingImports)
    .where(eq(recordingImports.id, id))
    .for("update");
  if (!locked) return { status: 404 } as const;
  const [entry] = await selectImports(tx).where(
    and(eq(recordingImports.id, id), originalActive),
  );
  if (entry?.stage !== "ready") return { status: 404 } as const;
  if (locked.revision !== review.revision) return { status: 412 } as const;
  const selection = {
    excluded: [...new Set(review.selection.excluded)].sort((a, b) => a - b),
    splits: review.selection.splits.toSorted(
      (a, b) => a.section - b.section || a.beforePoint - b.beforePoint,
    ),
    clock: review.selection.clock,
  };
  if (!(await hasSelectedPath(tx, entry.originalId, selection)))
    return { status: 400 } as const;
  const splitSummaries: NonNullable<StoredSelection["splitSummaries"]> = {};
  const grouped = cutsBySection(selection);
  if (grouped.size) {
    const rows = await tx
      .select()
      .from(recordingSections)
      .where(
        and(
          eq(recordingSections.originalId, entry.originalId),
          inArray(recordingSections.ordinal, [...grouped.keys()]),
        ),
      );
    for (const { summary, ordinal } of rows) {
      const cuts = grouped.get(ordinal);
      if (cuts)
        splitSummaries[ordinal] = await splitRun(
          tx,
          entry.originalId,
          { ...summary, ordinal, included: true },
          cuts,
        );
    }
  }
  const revision = review.revision + 1;
  await tx.insert(recordingReviews).values({
    ownerId: session.accountId,
    importId: id,
    revision,
    createdAt: sql`clock_timestamp()`,
    selection: {
      ...selection,
      splitSummaries,
      ownerCorrection: entry.consumed ? true : undefined,
    },
  });
  await tx
    .update(recordingImports)
    .set({ reviewRevision: revision })
    .where(eq(recordingImports.id, id));
  const summary = await summarizeSelection(tx, entry.originalId, {
    ...selection,
    splitSummaries,
  });
  return { status: 200, review: { revision, selection, summary } } as const;
}

async function splitRun(
  tx: DatabaseTransaction,
  originalId: string,
  section: RecordingSection,
  cuts: number[],
) {
  const parts: RecordingRunSummary[] = [];
  const firstCut = cuts[0];
  let cut = firstCut;
  let splitIndex = 0;
  let run = newRun(section.breakBefore);
  let prior: bigint | null = null;
  function appendPart() {
    parts.push({
      trackIndex: section.trackIndex,
      segmentIndex: section.segmentIndex,
      firstPointIndex: run.samples[0].index,
      lastPointIndex: run.samples[run.samples.length - 1].index,
      breakBefore: run.breakBefore,
      measurements: run.measurements,
    });
  }
  let page = -1;
  for (;;) {
    const rows = await tx
      .select()
      .from(recordingSamplePages)
      .where(
        and(
          eq(recordingSamplePages.originalId, originalId),
          eq(recordingSamplePages.section, section.ordinal),
          gt(recordingSamplePages.page, page),
        ),
      )
      .orderBy(asc(recordingSamplePages.page))
      .limit(32);
    for (const row of rows) {
      for (const point of row.samples) {
        if (cut === point.index) {
          appendPart();
          run = newRun("user_split");
          prior = null;
          cut = cuts[++splitIndex];
        }
        const instant = point.instant
          ? Temporal.Instant.from(point.instant).epochNanoseconds
          : null;
        const unexpectedBreak = addSample(run, point, instant, prior);
        if (unexpectedBreak)
          throw new Error("Stored recording run contains a discontinuity");
        // The measurement retains its own count. Only the endpoints are
        // needed here, even if the original run contains 500,000 samples.
        if (run.samples.length === 3) run.samples.splice(1, 1);
        prior = instant;
      }
      page = row.page;
    }
    if (rows.length < 32) break;
  }
  if (!run.samples.length)
    throw new Error("Stored recording run has no points");
  appendPart();
  return parts;
}

const sectionPageSize = 25;

export async function countSelectedSections(
  tx: DatabaseTransaction,
  originalId: string,
  selection: StoredSelection,
) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(recordingSections)
    .where(
      and(
        eq(recordingSections.originalId, originalId),
        selection.excluded.length
          ? notInArray(recordingSections.ordinal, selection.excluded)
          : undefined,
      ),
    );
  return row.count;
}

export async function selectRecordingSections(
  tx: DatabaseTransaction,
  originalId: string,
  selection: StoredSelection,
  cursor?: number,
  selectedOnly = false,
) {
  const rows = await tx
    .select()
    .from(recordingSections)
    .where(
      and(
        eq(recordingSections.originalId, originalId),
        cursor === undefined
          ? undefined
          : gt(recordingSections.ordinal, cursor),
        selectedOnly && selection.excluded.length
          ? notInArray(recordingSections.ordinal, selection.excluded)
          : undefined,
      ),
    )
    .orderBy(asc(recordingSections.ordinal))
    .limit(sectionPageSize + 1);
  const excluded = new Set(selection.excluded);
  const sections: RecordingSection[] = rows
    .slice(0, sectionPageSize)
    .map(({ summary, ordinal }) => {
      const item = adjustRun(
        {
          ...summary,
          ordinal,
          displayTimeZone: selection.clock?.displayTimeZone,
          included:
            summary.measurements.sampleCount >= 2 && !excluded.has(ordinal),
        },
        selection.clock?.shiftMinutes,
      );
      const splitRuns = selection.splitSummaries?.[ordinal];
      if (!splitRuns?.length) return item;
      const measurements = aggregateRunMeasurements(
        splitRuns.map((run) => run.measurements),
      );
      return {
        ...item,
        measurements: { ...item.measurements, ...measurements },
        splitRuns: splitRuns.map((run) =>
          adjustRun(run, selection.clock?.shiftMinutes),
        ),
      };
    });
  return {
    sections,
    nextCursor:
      rows.length > sectionPageSize ? (sections.at(-1)?.ordinal ?? null) : null,
  };
}
