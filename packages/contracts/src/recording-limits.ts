export const gpxLimits = {
  bytes: 50 * 1024 ** 2,
  partBytes: 8 * 1024 ** 2,
  points: 500_000,
  tracks: 2_000,
  segments: 10_000,
  depth: 32,
  tokenCharacters: 1024 ** 2,
  samplePage: 128,

  sections: 20_000,
  label: 160,
  timestamp: 64,
} as const;

export const gpxInspectionVersion = 1 as const;

export const gpxBatchLimits = {
  files: 10,
  bytes: 200 * 1024 ** 2,
} as const;

export function recordingFileName(value: string) {
  return (
    value
      .replace(/[\p{Cc}/\\]/gu, "_")
      .replace(/[\uD800-\uDFFF]/gu, "_")
      .trim()
      .slice(0, 255)
      .replace(/[\uD800-\uDBFF]$/u, "") || "Recording.gpx"
  );
}
