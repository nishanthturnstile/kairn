import type {
  GpxBreak,
  RecordingMeasurements,
} from "@kairn/contracts/recordings";
import geodesic from "geographiclib-geodesic";
import { Temporal } from "temporal-polyfill";

export type GpxSample = {
  index: number;
  latitude: number;
  longitude: number;
  elevationMetres: number | null;
  timestamp: string | null;
  invalidTimestamp: boolean;
  invalidElevation: boolean;
  offset: string | null;
  instant: string | null;
};

export type GpxRun = {
  breakBefore: GpxBreak;
  samples: GpxSample[];
  measurements: RecordingMeasurements;
  invalidTimestamps: number;
  invalidElevations: number;
};

function distanceBetween(first: GpxSample, second: GpxSample): number {
  const result = geodesic.Geodesic.WGS84.Inverse(
    first.latitude,
    first.longitude,
    second.latitude,
    second.longitude,
    geodesic.Geodesic.DISTANCE,
  );
  if (result.s12 === undefined) throw new Error("Geodesic distance missing");
  return result.s12;
}

// GPX inspection policy v1. Keep edges with incomplete time evidence unless
// they independently exceed the maximum plausible separation.
const maxPauseSeconds = 30 * 60;
const maxSpeedMetresPerSecond = 100;
const maxUntimedEdgeMetres = 20_000;

export function addSample(
  run: GpxRun,
  sample: GpxSample,
  instant: bigint | null,
  previousInstant: bigint | null,
): GpxBreak | null {
  const previous = run.samples.at(-1);
  const measurements = run.measurements;
  let distance = 0;
  if (previous) {
    const seconds =
      instant === null || previousInstant === null
        ? null
        : Number(instant - previousInstant) / 1e9;
    if (seconds !== null && seconds < 0) return "clock_reversal";
    if (seconds !== null && seconds > maxPauseSeconds) return "long_pause";
    distance = distanceBetween(previous, sample);
    if (
      seconds === null
        ? distance > maxUntimedEdgeMetres
        : distance > Math.max(100, seconds * maxSpeedMetresPerSecond)
    )
      return "implausible_jump";
    measurements.distanceMetres = (measurements.distanceMetres ?? 0) + distance;
    if (measurements.elapsedSeconds !== null && seconds !== null)
      measurements.elapsedSeconds += seconds;
    else measurements.elapsedSeconds = null;

    // A missing height makes the run's total unknown. Add only accepted edges.
    if (
      measurements.sampleCount === 1 ||
      measurements.elevationGainMetres != null
    ) {
      const from = previous.elevationMetres;
      const to = sample.elevationMetres;
      const ascent =
        from === null || to === null
          ? null
          : (measurements.elevationGainMetres ?? 0) + Math.max(0, to - from);
      measurements.elevationGainMetres =
        ascent !== null && Number.isFinite(ascent) ? ascent : null;
    }
  } else {
    measurements.elapsedSeconds = instant === null ? null : 0;
  }

  run.samples.push(sample);
  run.invalidTimestamps += Number(sample.invalidTimestamp);
  run.invalidElevations += Number(sample.invalidElevation);
  measurements.sampleCount++;
  if (sample.instant !== null) {
    measurements.timedSampleCount++;
    measurements.firstInstant ??= sample.instant;
    measurements.lastInstant = sample.instant;
  }
  const elevation = sample.elevationMetres;
  if (elevation !== null) {
    measurements.elevationMinMetres = Math.min(
      measurements.elevationMinMetres ?? elevation,
      elevation,
    );
    measurements.elevationMaxMetres = Math.max(
      measurements.elevationMaxMetres ?? elevation,
      elevation,
    );
  }
  return null;
}

export function newRun(breakBefore: GpxBreak): GpxRun {
  return {
    breakBefore,
    samples: [],
    invalidTimestamps: 0,
    invalidElevations: 0,
    measurements: {
      sampleCount: 0,
      timedSampleCount: 0,
      firstInstant: null,
      lastInstant: null,
      distanceMetres: null,
      elapsedSeconds: null,
      elevationMinMetres: null,
      elevationMaxMetres: null,
      elevationGainMetres: null,
    },
  };
}

export function aggregateRunMeasurements(
  measurements: readonly RecordingMeasurements[],
) {
  const paths = measurements.filter((run) => run.sampleCount >= 2);
  const unknown = { distanceMetres: null, elapsedSeconds: null };
  if (paths.length === 0) return unknown;
  if (paths.length === 1)
    return {
      distanceMetres: paths[0].distanceMetres,
      elapsedSeconds: paths[0].elapsedSeconds,
    };

  // A complete, monotone sequence supplies evidence of disjoint traversals
  // only if its time window does not overlap another selected run.
  const ranges = [];
  for (const run of paths) {
    if (
      run.firstInstant === null ||
      run.lastInstant === null ||
      run.elapsedSeconds === null ||
      run.distanceMetres === null
    )
      return unknown;
    ranges.push({
      ...run,
      start: Temporal.Instant.from(run.firstInstant).epochNanoseconds,
      end: Temporal.Instant.from(run.lastInstant).epochNanoseconds,
      distance: run.distanceMetres,
      elapsed: run.elapsedSeconds,
    });
  }
  ranges.sort((left, right) =>
    left.start < right.start ? -1 : Number(left.start > right.start),
  );
  let previousEnd: bigint | null = null;
  let distanceMetres = 0;
  let elapsedSeconds = 0;
  for (const range of ranges) {
    if (previousEnd !== null && range.start <= previousEnd) return unknown;
    previousEnd = range.end;
    distanceMetres += range.distance;
    elapsedSeconds += range.elapsed;
  }
  return { distanceMetres, elapsedSeconds };
}
