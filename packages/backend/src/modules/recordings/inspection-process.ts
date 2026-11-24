import { once } from "node:events";
import { gpxLimits } from "@kairn/contracts/recording-limits";
import { inspectGpx } from "./gpx.js";

const samplePageSize = gpxLimits.samplePage;

async function emit(value: object) {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`))
    await once(process.stdout, "drain");
}

const result = await inspectGpx(process.stdin);
if (result.status === "rejected") {
  await emit(result);
} else {
  let section = 0;
  for (const [trackIndex, track] of result.tracks.entries()) {
    for (const [segmentIndex, segment] of track.segments.entries()) {
      for (const run of segment.runs) {
        const { samples, ...facts } = run;
        await emit({
          section: section++,
          summary: {
            ...facts,
            trackIndex,
            segmentIndex,
            trackName: track.name,
            firstPointIndex: samples[0].index,
            lastPointIndex: samples[samples.length - 1].index,
          },
        });
        for (let start = 0; start < samples.length; start += samplePageSize)
          await emit({
            section: section - 1,
            page: start / samplePageSize,
            samples: samples.slice(start, start + samplePageSize),
          });
      }
    }
  }
  await emit({
    status: "ready",
    sectionCount: section,
    documentName: result.documentName,
    diagnostics: result.diagnostics,
  });
}
