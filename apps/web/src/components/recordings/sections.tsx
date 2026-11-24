import type {
  RecordingRunSummary,
  RecordingSection,
  RecordingSelection,
} from "@kairn/contracts/recordings";
import { formatRecordedInstant } from "@kairn/shared/recording-time";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { journeyResult } from "@/lib/journey-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { JourneyLoading, JourneyRetry } from "../journeys/states";

const lengthFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const reasons: Record<RecordingRunSummary["breakBefore"], string> = {
  segment_boundary: "The file starts a new section here.",
  invalid_coordinates: "Path unknown across a point with invalid coordinates.",
  clock_reversal: "Path unknown where the device clock moved backward.",
  long_pause: "Path unknown across a long pause.",
  implausible_jump: "Path unknown across an unusually large jump.",
  user_split: "You marked a break here.",
};

export function formatRecordingDuration(seconds: number) {
  if (seconds > 0 && seconds < 60) return "<1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function SectionFacts({
  run,
  zone,
  compact,
}: {
  run: RecordingRunSummary;
  zone?: string;
  compact: boolean;
}) {
  const { measurements: m } = run;
  const label = compact ? "text-muted-foreground" : "font-semibold";
  const time = (
    <div className={cn(compact && "col-span-full")}>
      <dt className={label}>Recorded time</dt>
      <dd className="wrap-anywhere">
        {m.firstInstant ? (
          <time dateTime={m.firstInstant}>
            {formatRecordedInstant(m.firstInstant, zone)}
          </time>
        ) : (
          "Time unavailable"
        )}
        {m.lastInstant && m.lastInstant !== m.firstInstant && (
          <>
            {" to "}
            <time dateTime={m.lastInstant}>
              {formatRecordedInstant(m.lastInstant, zone)}
            </time>
          </>
        )}
        {!compact && m.elapsedSeconds !== null && m.sampleCount > 1 && (
          <> · {whole.format(m.elapsedSeconds / 60)} min elapsed</>
        )}
        {m.timedSampleCount > 0 && m.timedSampleCount < m.sampleCount && (
          <>
            {" "}
            · {whole.format(m.timedSampleCount)} of{" "}
            {whole.format(m.sampleCount)} timed
          </>
        )}
      </dd>
    </div>
  );
  return (
    <dl
      className={cn(
        "grid min-w-0 gap-y-2 text-sm",
        compact
          ? "gap-x-3 @min-[13rem]/recording:grid-cols-2"
          : "gap-x-2 @min-[32rem]/recording:grid-cols-2",
      )}
    >
      <div>
        <dt className={label}>{compact ? "Distance" : "Recorded distance"}</dt>
        <dd className={cn(compact && "font-semibold tabular-nums")}>
          {m.distanceMetres === null
            ? "One-point observation"
            : `${lengthFormat.format(m.distanceMetres / 1000)} km`}
        </dd>
      </div>
      {compact && (
        <div>
          <dt className={label}>Elapsed time</dt>
          <dd className="font-semibold tabular-nums">
            {m.elapsedSeconds === null || m.sampleCount < 2
              ? "Unavailable"
              : formatRecordingDuration(m.elapsedSeconds)}
          </dd>
        </div>
      )}
      <div>
        <dt className={label}>Samples</dt>
        <dd className={cn(compact && "font-semibold tabular-nums")}>
          {whole.format(m.sampleCount)}
        </dd>
      </div>
      {!compact && time}
      <div>
        <dt className={label}>{compact ? "Elevation range" : "Elevation"}</dt>
        <dd className={cn(compact && "font-semibold tabular-nums")}>
          {m.elevationMinMetres === null
            ? compact
              ? "Unavailable"
              : "Elevation unavailable"
            : m.elevationMaxMetres !== null &&
                m.elevationMaxMetres !== m.elevationMinMetres
              ? `${whole.format(m.elevationMinMetres)}${compact ? "–" : " to "}${whole.format(m.elevationMaxMetres)} m`
              : `${whole.format(m.elevationMinMetres)} m`}
        </dd>
      </div>
      {compact && time}
    </dl>
  );
}

export function SectionPagination({
  previous,
  next,
}: {
  previous?: () => void;
  next?: () => void;
}) {
  if (!previous && !next) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {previous && (
        <Button type="button" variant="outline" onClick={previous}>
          Previous
        </Button>
      )}
      {next && (
        <Button type="button" variant="outline" onClick={next}>
          Next
        </Button>
      )}
    </div>
  );
}

export function RecordingSections({
  sections,
  editing,
  mapSelection,
  compact = false,
  scrollable = false,
}: {
  sections: RecordingSection[];
  compact?: boolean;
  scrollable?: boolean;
  mapSelection?: { selected?: number; select: (section: number) => void };
  editing?: {
    scope: AccountScope;
    id: string;
    selection: RecordingSelection;
    disabled: boolean;
    onChange: (selection: RecordingSelection) => void;
  };
}) {
  return (
    <ol
      aria-label={compact ? "Recording sections" : undefined}
      tabIndex={scrollable ? 0 : undefined}
      className={cn(
        "@container/recording min-w-0 divide-y divide-border",
        scrollable &&
          "max-h-[min(24rem,55dvh)] overflow-y-auto scroll-py-2 pe-[min(0.5rem,2vw)] [scrollbar-color:var(--color-input)_transparent] [scrollbar-gutter:stable]",
      )}
    >
      {sections.map((section) => (
        <SectionRow
          key={section.ordinal}
          section={section}
          editing={editing}
          mapSelection={mapSelection}
          compact={compact}
        />
      ))}
    </ol>
  );
}

function SectionRow({
  section,
  editing,
  mapSelection,
  compact,
}: {
  section: RecordingSection;
  compact: boolean;
  mapSelection?: { selected?: number; select: (section: number) => void };
  editing?: {
    scope: AccountScope;
    id: string;
    selection: RecordingSelection;
    disabled: boolean;
    onChange: (selection: RecordingSelection) => void;
  };
}) {
  const [samples, setSamples] = useState(false);
  const disclosure = useId();
  const track = section.trackName ?? `Track ${section.trackIndex + 1}`;
  const name = `${track}, section ${section.ordinal + 1}`;
  const isPath = section.measurements.sampleCount > 1;
  const included = editing
    ? isPath && !editing.selection.excluded.includes(section.ordinal)
    : section.included;
  const status = !isPath ? "Observation" : included ? "Included" : "Excluded";
  return (
    <li
      className={cn(
        "grid min-w-0 first:pt-0 last:pb-0",
        compact ? "gap-2 py-3" : "gap-3 py-4",
      )}
    >
      <div className="grid min-w-0 gap-1">
        {compact ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <h3 tabIndex={-1} className="font-semibold">
                Section {section.ordinal + 1}
              </h3>
              <p className="text-sm text-muted-foreground">{status}</p>
            </div>
            <p
              className="line-clamp-2 text-sm wrap-anywhere text-muted-foreground"
              title={track}
            >
              {track}
            </p>
            {section.breakBefore !== "segment_boundary" && (
              <p className="text-sm text-muted-foreground">
                {reasons[section.breakBefore]}
              </p>
            )}
          </>
        ) : (
          <>
            <h3 className="font-bold wrap-anywhere">{name}</h3>
            <p className="text-sm text-muted-foreground">
              {status} · {reasons[section.breakBefore]}
            </p>
          </>
        )}
        {(section.invalidElevations > 0 || section.invalidTimestamps > 0) && (
          <p className="text-sm text-muted-foreground">
            {section.invalidTimestamps > 0 &&
              `${section.invalidTimestamps} invalid time readings. `}
            {section.invalidElevations > 0 &&
              `${section.invalidElevations} invalid elevation readings.`}
          </p>
        )}
      </div>
      {section.splitRuns?.length ? (
        <ol className="grid gap-2">
          {section.splitRuns.map((run, index) => (
            <li
              key={run.firstPointIndex}
              className="grid gap-1 rounded-control border p-3"
            >
              <p className="text-sm font-semibold">
                Part {index + 1} · {reasons[run.breakBefore]}
              </p>
              <SectionFacts
                run={run}
                zone={section.displayTimeZone}
                compact={compact}
              />
            </li>
          ))}
        </ol>
      ) : (
        <SectionFacts
          run={section}
          zone={section.displayTimeZone}
          compact={compact}
        />
      )}
      {mapSelection && included && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          aria-pressed={mapSelection.selected === section.ordinal}
          onClick={() => mapSelection.select(section.ordinal)}
        >
          Select section {section.ordinal + 1} on map
        </Button>
      )}
      {editing && (
        <div className="flex flex-wrap gap-2">
          {isPath && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              focusableWhenDisabled
              disabled={editing.disabled}
              aria-label={`${included ? "Exclude section" : "Include section"} · ${name}`}
              onClick={() =>
                editing.onChange({
                  ...editing.selection,
                  excluded: included
                    ? [...editing.selection.excluded, section.ordinal]
                    : editing.selection.excluded.filter(
                        (value) => value !== section.ordinal,
                      ),
                })
              }
            >
              {included ? "Exclude section" : "Include section"}
            </Button>
          )}
          {isPath && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={samples}
              aria-controls={disclosure}
              onClick={() => setSamples((value) => !value)}
            >
              {samples ? "Hide samples" : "Review samples"}
            </Button>
          )}
        </div>
      )}
      {editing && (
        <div id={disclosure} hidden={!samples}>
          {samples && (
            <Samples
              scope={editing.scope}
              id={editing.id}
              section={section}
              edit={editing}
            />
          )}
        </div>
      )}
    </li>
  );
}

function Samples({
  scope,
  id,
  section,
  edit,
}: {
  scope: AccountScope;
  id: string;
  section: RecordingSection;
  edit: {
    selection: RecordingSelection;
    disabled: boolean;
    onChange: (selection: RecordingSelection) => void;
  };
}) {
  const [page, setPage] = useState(0);
  const { refresh } = useSessionAccess();
  const query = useQuery({
    queryKey: [scope.accountId, "recording-samples", id, section.ordinal, page],
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/segments/{section}/samples", {
          params: { path: { id, section: section.ordinal }, query: { page } },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  if (query.isError)
    return (
      <JourneyRetry
        title="Couldn’t load samples"
        busy={query.isFetching}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data) return <JourneyLoading label="Loading samples" />;
  const next = query.data.nextCursor;
  return (
    <div className="grid gap-3 rounded-card border p-3">
      <ol className="divide-y divide-border" aria-label="Recorded samples">
        {query.data.samples.map((point) => {
          const split = edit.selection.splits.some(
            (cut) =>
              cut.section === section.ordinal &&
              cut.beforePoint === point.index,
          );
          return (
            <li
              key={point.index}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div>
                <p className="font-semibold">Point {point.index + 1}</p>
                <p className="text-sm text-muted-foreground">
                  {point.instant
                    ? formatRecordedInstant(point.instant)
                    : "Time unavailable"}
                </p>
              </div>
              {point.index > section.firstPointIndex && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  focusableWhenDisabled
                  disabled={edit.disabled}
                  aria-label={`${split ? "Undo split before" : "Split before"} point ${point.index + 1}`}
                  onClick={() =>
                    edit.onChange({
                      ...edit.selection,
                      splits: split
                        ? edit.selection.splits.filter(
                            (cut) =>
                              cut.section !== section.ordinal ||
                              cut.beforePoint !== point.index,
                          )
                        : [
                            ...edit.selection.splits,
                            {
                              section: section.ordinal,
                              beforePoint: point.index,
                            },
                          ],
                    })
                  }
                >
                  {split
                    ? "Undo split"
                    : `Split before point ${point.index + 1}`}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      <SectionPagination
        previous={page > 0 ? () => setPage(page - 1) : undefined}
        next={next === null ? undefined : () => setPage(next)}
      />
    </div>
  );
}
