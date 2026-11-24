import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import {
  type GpxInspection,
  inspectGpx,
} from "../packages/backend/src/modules/recordings/gpx";
import { aggregateRunMeasurements } from "../packages/backend/src/modules/recordings/measurements";
import { gpxLimits } from "../packages/contracts/src/recordings";
import { largeTrack } from "./fixtures/gpx/generated";

const point = (longitude: string, details = "") =>
  `<trkpt lat="0" lon="${longitude}">${details}</trkpt>`;
const track = (points: string) => `<trk><trkseg>${points}</trkseg></trk>`;
const document = (contents: string) => `<gpx version="1.1">${contents}</gpx>`;
const inspect = (xml: string) => inspectGpx([Buffer.from(xml)]);
function ready(result: GpxInspection) {
  if (result.status !== "ready") throw new Error(result.issue);
  return result;
}

describe("GPX evidence inspection", () => {
  it("preserves sample and segment order, ignores extensions and separates measured runs", async () => {
    const bytes = await readFile(
      new URL("./fixtures/gpx/two-runs.gpx", import.meta.url),
    );
    // Feed single bytes so XML tokens and non-ASCII labels cross chunk boundaries.
    function* chunks() {
      for (let i = 0; i < bytes.length; i++) yield bytes.subarray(i, i + 1);
    }
    const { diagnostics, tracks, version } = ready(await inspectGpx(chunks()));
    expect(version).toBe("1.1");
    expect(diagnostics).toMatchObject({
      tracks: 1,
      segments: 3,
      trackPoints: 4,
      ignoredRoutes: 1,
      ignoredWaypoints: 1,
    });
    expect(tracks[0].name).toBe("Sentier d’été & forêt");
    const [first, empty, last] = tracks[0].segments;
    expect(empty).toEqual({ pointCount: 0, runs: [] });
    expect(first.runs[0].measurements).toMatchObject({
      elapsedSeconds: 600,
      elevationMinMetres: -4,
      elevationMaxMetres: 2,
    });
    expect(last.runs[0].samples[0]).toMatchObject({
      timestamp: "2026-06-12T15:40:00+05:30",
      offset: "+05:30",
      instant: "2026-06-12T10:10:00Z",
      elevationMetres: null,
    });
    const combined = aggregateRunMeasurements([
      first.runs[0].measurements,
      last.runs[0].measurements,
    ]);
    expect(combined.elapsedSeconds).toBe(1200);
    expect(Math.abs((combined.distanceMetres ?? 0) - 2226.39)).toBeLessThan(2);
  });

  it("keeps stationary samples and dateline distances without bridging a bad coordinate", async () => {
    const xml = `<gpx xmlns="http://www.topografix.com/GPX/1/0" version="1.0">${track(
      point("179.999") +
        point("-179.999") +
        point("-179.999") +
        point("1e2") +
        point("2"),
    )}</gpx>`;
    const result = ready(await inspect(xml));
    const [path, observation] = result.tracks[0].segments[0].runs;
    expect(path.samples.map((sample) => sample.index)).toEqual([0, 1, 2]);
    expect(path.measurements.distanceMetres).toBeCloseTo(222.639, 2);
    expect(observation.measurements.distanceMetres).toBeNull();
    expect(observation.samples[0].index).toBe(4);
    expect(observation.breakBefore).toBe("invalid_coordinates");
    expect(result.diagnostics.invalidCoordinates).toBe(1);
  });

  it("adds rises within a run and distinguishes flat and incomplete elevation", async () => {
    const result = ready(
      await inspect(
        document(
          track(
            point("1", "<ele>100</ele>") +
              point("1.001", "<ele>110</ele>") +
              point("1.002", "<ele>105</ele>") +
              point("1.003", "<ele>115</ele>"),
          ) +
            track(
              point("2", "<ele>900</ele>") + point("2.001", "<ele>899</ele>"),
            ) +
            track(
              point("3", "<ele>1</ele>") +
                point("3.001") +
                point("3.002", "<ele>80</ele>") +
                point("3.003", "<ele>82</ele>"),
            ),
        ),
      ),
    );
    expect(
      result.tracks.map(
        ({ segments }) => segments[0].runs[0].measurements.elevationGainMetres,
      ),
    ).toEqual([20, 0, null]);
  });

  it("keeps missing and unresolved time distinct and sets no duration for partial evidence", async () => {
    const result = ready(
      await inspect(
        document(
          track(
            point("1", "<time>2026-10-25T01:30:00.123456789Z</time>") +
              point(
                "1.001",
                "<time>2026-10-25T01:30:00</time><ele>Infinity</ele>",
              ) +
              point("1.002", "<time>2026-02-30T02:00:00Z</time><ele>0</ele>") +
              point("1.003"),
          ),
        ),
      ),
    );
    const [run] = result.tracks[0].segments[0].runs;
    expect(result.diagnostics).toMatchObject({
      invalidTimestamps: 1,
      invalidElevations: 1,
    });
    expect(run.samples.map((sample) => sample.timestamp)).toEqual([
      "2026-10-25T01:30:00.123456789Z",
      "2026-10-25T01:30:00",
      "2026-02-30T02:00:00Z",
      null,
    ]);
    expect(run.measurements).toMatchObject({
      firstInstant: "2026-10-25T01:30:00.123456789Z",
      timedSampleCount: 1,
      elapsedSeconds: null,
      elevationMinMetres: 0,
    });
  });

  it("breaks suspect edges at the right source index", async () => {
    const timed = (lon: string, clock: string) =>
      point(lon, `<time>2026-06-12T${clock}:00Z</time>`);
    const { tracks } = ready(
      await inspect(
        document(
          track(
            timed("1", "08:00") +
              timed("1", "08:05") +
              timed("1", "08:04") +
              timed("1", "09:00") +
              timed("2", "09:01") +
              timed("2", "09:02"),
          ),
        ),
      ),
    );
    expect(
      tracks[0].segments[0].runs.map(({ breakBefore, samples }) => [
        breakBefore,
        samples.map(({ index }) => index),
      ]),
    ).toEqual([
      ["segment_boundary", [0, 1]],
      ["clock_reversal", [2]],
      ["long_pause", [3]],
      ["implausible_jump", [4, 5]],
    ]);
  });

  it("detects clock reversals with an untimed sample between the observations", async () => {
    const result = ready(
      await inspect(
        document(
          track(
            point("1", "<time>2026-06-12T10:00:00Z</time>") +
              point("1.001") +
              point("1.002", "<time>2026-06-12T09:59:00Z</time>"),
          ),
        ),
      ),
    );
    const [first, second] = result.tracks[0].segments[0].runs;
    expect(first.samples.map(({ index }) => index)).toEqual([0, 1]);
    expect(second.breakBefore).toBe("clock_reversal");
    expect(second.samples[0].index).toBe(2);
  });

  it("localizes invalid optional fields to the affected run", async () => {
    const result = ready(
      await inspect(
        document(
          track(
            point("1", "<time>invalid</time><ele>invalid</ele>") +
              point("1.001"),
          ) + track(point("2") + point("2.001")),
        ),
      ),
    );
    expect(
      result.tracks.map(({ segments }) => segments[0].runs[0]),
    ).toMatchObject([
      {
        invalidTimestamps: 1,
        invalidElevations: 1,
        samples: [{ invalidElevation: true }, { invalidElevation: false }],
      },
      { invalidTimestamps: 0, invalidElevations: 0 },
    ]);
  });

  it.each(["text", "attribute", "comment"])(
    "bounds the parser's pending %s token",
    async (kind) => {
      const oversized = "a".repeat(gpxLimits.tokenCharacters + 1);
      const token = {
        text: `<x>${oversized}</x>`,
        attribute: `<x a="${oversized}"/>`,
        comment: `<!--${oversized}-->`,
      }[kind];
      expect(await inspect(document(token ?? ""))).toEqual({
        status: "rejected",
        issue: "token_limit",
      });
    },
  );

  it("keeps overlapping or uncertain traversals separate", async () => {
    const result = ready(
      await inspect(document(track(point("1") + point("1.001")))),
    );
    const measurements = result.tracks[0].segments[0].runs[0].measurements;
    expect(aggregateRunMeasurements([measurements, measurements])).toEqual({
      distanceMetres: null,
      elapsedSeconds: null,
    });
    const timed = {
      ...measurements,
      firstInstant: "2026-06-12T08:00:00Z",
      lastInstant: "2026-06-12T08:10:00Z",
      elapsedSeconds: 600,
      timedSampleCount: 2,
    };
    expect(aggregateRunMeasurements([timed, timed]).distanceMetres).toBeNull();
    expect(
      aggregateRunMeasurements([
        timed,
        {
          ...timed,
          firstInstant: "2026-06-12T08:20:00Z",
          lastInstant: "2026-06-12T08:30:00Z",
        },
      ]).distanceMetres,
    ).toBeCloseTo(222.639, 2);
  });

  it.each([
    [
      "<gpx version='1.0' xmlns='http://www.topografix.com/GPX/1/1'/>",
      "unsupported_gpx",
    ],
    [
      "<!DOCTYPE gpx [<!ENTITY local 'test'>]><gpx version='1.1'/>",
      "xml_declaration_forbidden",
    ],
    [
      "<?xml version='1.0' encoding='ISO-8859-1'?><gpx version='1.1'/>",
      "unsupported_encoding",
    ],
    ["<gpx version='1.1'>&undeclared;</gpx>", "malformed_xml"],
    [
      `${document(track(point("0") + point("1")))}<unfinished>`,
      "malformed_xml",
    ],
    [
      document("<x>".repeat(gpxLimits.depth) + "</x>".repeat(gpxLimits.depth)),
      "depth_limit",
    ],
    [document(""), "no_recorded_path"],
    [document(track(point("1"))), "no_recorded_path"],
    [document("<wpt lat='0' lon='0'/>"), "no_recorded_path"],
    [
      document("<rte><rtept lat='0' lon='0'/><rtept lat='0' lon='1'/></rte>"),
      "no_recorded_path",
    ],
  ])("reports bounded file issues", async (xml, issue) => {
    expect(await inspect(xml)).toMatchObject({ status: "rejected", issue });
  });

  it("applies the byte limit before parsing bytes above the ceiling", async () => {
    expect(await inspectGpx([Buffer.alloc(gpxLimits.bytes + 1)])).toEqual({
      status: "rejected",
      issue: "byte_limit",
    });
  });

  it("accepts the maximum point count and rejects one additional element", async () => {
    expect(
      ready(await inspectGpx(largeTrack(gpxLimits.points))).diagnostics
        .trackPoints,
    ).toBe(gpxLimits.points);
    expect(await inspectGpx(largeTrack(gpxLimits.points + 1))).toMatchObject({
      status: "rejected",
      issue: "point_limit",
    });
  }, 30_000);
});
