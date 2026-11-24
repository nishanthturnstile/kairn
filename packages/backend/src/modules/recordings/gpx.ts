import { TextDecoder } from "node:util";
import {
  gpxInspectionVersion,
  gpxLimits,
} from "@kairn/contracts/recording-limits";
import type {
  GpxBreak,
  GpxDiagnostics,
  GpxIssue,
} from "@kairn/contracts/recordings";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { Temporal } from "temporal-polyfill";
import {
  addSample,
  type GpxRun,
  type GpxSample,
  newRun,
} from "./measurements.js";

type GpxVersion = "1.0" | "1.1";
type GpxSegment = { pointCount: number; runs: GpxRun[] };
type GpxTrack = { name: string | null; segments: GpxSegment[] };
type ParsedGpx = {
  status: "ready";
  version: GpxVersion;
  inspectionVersion: typeof gpxInspectionVersion;
  documentName: string | null;
  tracks: GpxTrack[];
  diagnostics: GpxDiagnostics;
};

export type GpxInspection =
  | ParsedGpx
  | { status: "rejected"; issue: GpxIssue; diagnostics?: GpxDiagnostics };

class InspectionError extends Error {
  constructor(readonly issue: GpxIssue) {
    super(issue);
  }
}

function reject(issue: GpxIssue): never {
  throw new InspectionError(issue);
}

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
function number(text: string | undefined) {
  const value = text?.trim();
  if (!value || !decimal.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

const timestampFormat =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(?:\.\d{1,9})?)(Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/;

function parseTimestamp(timestamp: string) {
  const match = timestampFormat.exec(timestamp);
  if (!match) return null;
  const [, local, offset] = match;
  if (/^[+-]14:(?!00)/.test(offset ?? "")) return null;
  try {
    Temporal.PlainDateTime.from(local, { overflow: "reject" });
    if (!offset) return { offset: null, instant: null };
    return { offset, instant: Temporal.Instant.from(timestamp) };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function readRoot(tag: SaxesTagNS): GpxVersion {
  const version = tag.attributes.version?.value;
  if (
    tag.local !== "gpx" ||
    (version !== "1.0" && version !== "1.1") ||
    (tag.uri !== "" &&
      tag.uri !== `http://www.topografix.com/GPX/${version.replace(".", "/")}`)
  )
    reject("unsupported_gpx");
  return version;
}

type TextKind = "name" | "time" | "ele";
type Element =
  | "gpx"
  | "metadata"
  | "trk"
  | "trkseg"
  | "trkpt"
  | "rte"
  | TextKind
  | "ignored";

class GpxReader {
  readonly tracks: GpxTrack[] = [];
  readonly diagnostics: GpxDiagnostics = {
    tracks: 0,
    segments: 0,
    trackPoints: 0,
    invalidCoordinates: 0,
    invalidTimestamps: 0,
    invalidElevations: 0,
    ignoredRoutes: 0,
    ignoredWaypoints: 0,
  };

  version?: GpxVersion;
  private documentName: string | null = null;
  private namespace = "";
  private stack: Element[] = [];
  private point: GpxSample | null = null;
  private pointInstant: bigint | null = null;
  private previousInstant: bigint | null = null;
  private lastKnownInstant: bigint | null = null;
  private sectionCount = 0;
  private breakBefore: GpxBreak = "segment_boundary";
  private run: GpxRun | undefined;
  private text = "";
  private textLimit = 0;
  private textOverflow = false;
  private examinedPoints = 0;
  private hasPath = false;

  private get track() {
    return this.tracks[this.tracks.length - 1];
  }

  private get segment() {
    return this.track.segments[this.track.segments.length - 1];
  }

  private examinePoint() {
    if (++this.examinedPoints > gpxLimits.points) reject("point_limit");
  }

  open(tag: SaxesTagNS) {
    if (this.stack.length >= gpxLimits.depth) reject("depth_limit");
    this.stack.push(this.classify(tag));
  }

  private classify(tag: SaxesTagNS): Element {
    const parent = this.stack.at(-1);
    if (parent === undefined) {
      this.version = readRoot(tag);
      this.namespace = tag.uri;
      return "gpx";
    }
    if (tag.uri !== this.namespace) return "ignored";
    const name = tag.local;
    if (parent === "gpx" && name === "metadata" && this.version === "1.1")
      return "metadata";
    if (
      (parent === "metadata" || (parent === "gpx" && this.version === "1.0")) &&
      name === "name" &&
      this.documentName === null
    )
      return this.startText("name", gpxLimits.label);
    if (parent === "gpx" && name === "trk") {
      if (++this.diagnostics.tracks > gpxLimits.tracks) reject("track_limit");
      this.tracks.push({ name: null, segments: [] });
      return name;
    }
    if (parent === "gpx" && name === "rte") {
      this.diagnostics.ignoredRoutes++;
      return name;
    }
    if (parent === "gpx" && name === "wpt") {
      this.examinePoint();
      this.diagnostics.ignoredWaypoints++;
    }
    if (parent === "rte" && name === "rtept") this.examinePoint();
    if (parent === "trk" && name === "trkseg") {
      if (++this.diagnostics.segments > gpxLimits.segments)
        reject("segment_limit");
      this.track.segments.push({ pointCount: 0, runs: [] });
      this.run = undefined;
      this.previousInstant = null;
      this.lastKnownInstant = null;
      this.breakBefore = "segment_boundary";
      return name;
    }
    if (parent === "trkseg" && name === "trkpt") {
      this.startPoint(tag);
      return name;
    }
    if (parent === "trk" && name === "name" && this.track.name === null)
      return this.startText(name, gpxLimits.label);
    if (parent === "trkpt" && this.point) {
      if (name === "time" && this.point.timestamp === null)
        return this.startText(name, gpxLimits.timestamp);
      if (name === "ele" && this.point.elevationMetres === null)
        return this.startText(name, 64);
    }
    return "ignored";
  }

  private startPoint(tag: SaxesTagNS) {
    this.examinePoint();
    this.diagnostics.trackPoints++;
    const index = this.segment.pointCount++;
    const latitude = number(tag.attributes.lat?.value);
    const longitude = number(tag.attributes.lon?.value);
    this.pointInstant = null;
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      this.diagnostics.invalidCoordinates++;
      this.point = null;
      this.run = undefined;
      this.previousInstant = null;
      this.lastKnownInstant = null;
      this.breakBefore = "invalid_coordinates";
      return;
    }
    this.point = {
      index,
      latitude,
      longitude,
      elevationMetres: null,
      timestamp: null,
      invalidTimestamp: false,
      invalidElevation: false,
      offset: null,
      instant: null,
    };
  }

  private startText(kind: TextKind, limit: number) {
    this.text = "";
    this.textLimit = limit;
    this.textOverflow = false;
    return kind;
  }

  append(text: string) {
    const element = this.stack.at(-1);
    if (element !== "name" && element !== "time" && element !== "ele") return;
    const available = this.textLimit - this.text.length;
    this.textOverflow ||= text.length > available;
    this.text += text.slice(0, available);
  }

  close() {
    const element = this.stack.pop();
    const text = this.text;
    if (element === "name") {
      const parsed =
        text
          .replace(/\s+/gu, " ")
          .replace(/[\uD800-\uDBFF]$/u, "")
          .trim() || null;
      if (this.stack.at(-1) === "trk") this.track.name = parsed;
      else this.documentName = parsed;
    }
    if (element === "time" && this.point) {
      this.point.timestamp = text;
      const timestamp = this.textOverflow ? null : parseTimestamp(text.trim());
      if (!timestamp) {
        this.diagnostics.invalidTimestamps++;
        this.point.invalidTimestamp = true;
      } else {
        this.point.offset = timestamp.offset;
        this.point.instant = timestamp.instant?.toString() ?? null;
        this.pointInstant = timestamp.instant?.epochNanoseconds ?? null;
      }
    }
    if (element === "ele" && this.point) {
      this.point.elevationMetres = this.textOverflow ? null : number(text);
      if (this.point.elevationMetres === null) {
        this.diagnostics.invalidElevations++;
        this.point.invalidElevation = true;
      }
    }
    if (element === "trkpt" && this.point) this.finishPoint(this.point);
  }

  private finishPoint(point: GpxSample) {
    if (this.run) {
      const reason =
        this.pointInstant !== null &&
        this.lastKnownInstant !== null &&
        this.pointInstant < this.lastKnownInstant
          ? "clock_reversal"
          : addSample(this.run, point, this.pointInstant, this.previousInstant);
      if (reason) {
        this.run = undefined;
        this.breakBefore = reason;
      } else this.hasPath = true;
    }
    if (!this.run) {
      if (++this.sectionCount > gpxLimits.sections) reject("section_limit");
      this.lastKnownInstant = null;
      this.run = newRun(this.breakBefore);
      this.segment.runs.push(this.run);
      addSample(this.run, point, this.pointInstant, null);
    }
    this.previousInstant = this.pointInstant;
    this.lastKnownInstant = this.pointInstant ?? this.lastKnownInstant;
    this.point = null;
  }

  result(): GpxInspection {
    if (!this.version) return { status: "rejected", issue: "malformed_xml" };
    if (!this.hasPath)
      return {
        status: "rejected",
        issue: "no_recorded_path",
        diagnostics: this.diagnostics,
      };
    return {
      status: "ready",
      version: this.version,
      inspectionVersion: gpxInspectionVersion,
      documentName: this.documentName,
      tracks: this.tracks,
      diagnostics: this.diagnostics,
    };
  }
}

function decode(decoder: TextDecoder, bytes?: Uint8Array) {
  try {
    return decoder.decode(bytes, { stream: bytes !== undefined });
  } catch (error) {
    if (error instanceof TypeError) reject("unsupported_encoding");
    throw error;
  }
}

export async function inspectGpx(
  input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): Promise<GpxInspection> {
  const reader = new GpxReader();
  const parser = new SaxesParser({ xmlns: true });
  // saxes can buffer an entire text node, attribute, or declaration before
  // emitting an event. Feed bounded chunks and cap the span between events.
  let lastEvent = 0;
  function markToken() {
    if (parser.position - lastEvent > gpxLimits.tokenCharacters)
      reject("token_limit");
    lastEvent = parser.position;
  }
  parser.on("opentag", (tag) => {
    markToken();
    reader.open(tag);
  });
  parser.on("text", (text) => {
    markToken();
    reader.append(text);
  });
  parser.on("cdata", (text) => {
    markToken();
    reader.append(text);
  });
  parser.on("closetag", () => {
    markToken();
    reader.close();
  });
  parser.on("comment", markToken);
  parser.on("processinginstruction", markToken);
  parser.on("doctype", () => reject("xml_declaration_forbidden"));
  parser.on("xmldecl", ({ encoding }) => {
    markToken();
    if (encoding && encoding.toLowerCase() !== "utf-8")
      reject("unsupported_encoding");
  });
  parser.on("error", () => reject("malformed_xml"));

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  try {
    for await (const chunk of input) {
      bytes += chunk.byteLength;
      if (bytes > gpxLimits.bytes) reject("byte_limit");
      const blockSize = 64 * 1024;
      for (let offset = 0; offset < chunk.byteLength; offset += blockSize) {
        parser.write(
          decode(decoder, chunk.subarray(offset, offset + blockSize)),
        );
        if (parser.position - lastEvent > gpxLimits.tokenCharacters)
          reject("token_limit");
      }
    }
    parser.write(decode(decoder)).close();
    return reader.result();
  } catch (error) {
    if (error instanceof InspectionError)
      return { status: "rejected", issue: error.issue };
    throw error;
  }
}
