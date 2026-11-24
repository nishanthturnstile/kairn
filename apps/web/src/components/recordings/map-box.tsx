import { gpxLimits } from "@kairn/contracts/recording-limits";
import type { RecordingOverlay } from "@kairn/contracts/recordings";
import mapboxgl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map as MapboxMap,
} from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { routeColors } from "./route-colors";
import "mapbox-gl/dist/mapbox-gl.css";

const routeSource = "recording-path";
const endpointsSource = "recording-ends";
const mapStyle = "mapbox://styles/mapbox/outdoors-v12";
const satelliteStyle = "mapbox://styles/mapbox/satellite-streets-v12";

function paintSelection(map: MapboxMap, selected?: number, series?: number) {
  if (!map.getLayer("recording-selection")) return;
  const match: ExpressionSpecification =
    series === undefined
      ? ["==", ["get", "section"], selected ?? -1]
      : ["==", ["get", "series"], series];
  map.setFilter("recording-selection", match);
  map.setPaintProperty("recording-path-line", "line-width", [
    "case",
    match,
    7,
    4,
  ]);
  map.setPaintProperty("recording-path-casing", "line-width", [
    "case",
    match,
    10,
    7,
  ]);
}

function overlaySources(map: MapboxMap, overlay: RecordingOverlay) {
  const lines: Parameters<GeoJSONSource["setData"]>[0] = {
    type: "FeatureCollection",
    features: overlay.paths.map(({ section, series, coordinates }) => ({
      type: "Feature",
      properties: {
        section,
        series,
        color: routeColors[(series ?? 0) % routeColors.length],
      },
      geometry: { type: "LineString", coordinates },
    })),
  };
  const endpoints: Parameters<GeoJSONSource["setData"]>[0] = {
    type: "FeatureCollection",
    features: overlay.paths.flatMap(({ section, series, coordinates }) => {
      const ordinal =
        series === undefined ? section + 1 : (section % gpxLimits.sections) + 1;
      return [
        { name: `Section ${ordinal} start`, coordinates: coordinates[0] },
        {
          name: `Section ${ordinal} end`,
          coordinates: coordinates[coordinates.length - 1],
        },
      ].map(({ name, coordinates: point }) => ({
        type: "Feature",
        properties: { name, section, series },
        geometry: { type: "Point", coordinates: point },
      }));
    }),
  };
  const source = map.getSource<GeoJSONSource>(routeSource);
  if (source) {
    source.setData(lines);
    map.getSource<GeoJSONSource>(endpointsSource)?.setData(endpoints);
    return;
  }
  map.addSource(routeSource, { type: "geojson", data: lines });
  map.addSource(endpointsSource, { type: "geojson", data: endpoints });
  map.addLayer({
    id: "recording-path-casing",
    type: "line",
    source: routeSource,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": 7, "line-color": "#161913" },
  });
  map.addLayer({
    id: "recording-path-line",
    type: "line",
    source: routeSource,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": 4, "line-color": ["get", "color"] },
  });
  map.addLayer({
    id: "recording-point",
    type: "circle",
    source: endpointsSource,
    paint: {
      "circle-radius": 4,
      "circle-color": "#e4f49d",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#161913",
    },
  });
  map.addLayer({
    id: "recording-selection",
    type: "circle",
    source: endpointsSource,
    filter: ["==", ["get", "section"], -1],
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#f6ffc7",
    },
  });
  map.addLayer({
    id: "recording-label",
    type: "symbol",
    source: endpointsSource,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 12,
      "text-offset": [0, 1],
      "text-anchor": "top",
    },
    paint: {
      "text-color": "#161913",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });
}

function fit(map: MapboxMap, overlay: RecordingOverlay) {
  if (!overlay.bounds) return;
  const [west, south, east, north] = overlay.bounds;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 32, maxZoom: 16, duration: reduced ? 0 : 200 },
  );
}

export default function MapBox({
  token,
  overlay,
  selected,
  selectedSeries,
  select,
  large,
  fail,
}: {
  token: string;
  overlay: RecordingOverlay;
  selected?: number;
  selectedSeries?: number;
  select?: (section: number) => void;
  large?: boolean;
  fail: () => void;
}) {
  const host = useRef<HTMLElement>(null);
  const mapRef = useRef<MapboxMap>(null);
  const loadTimer = useRef<number>(undefined);
  const fittedOverlay = useRef<RecordingOverlay>(undefined);
  const data = useRef(overlay);
  const selectedRef = useRef(selected);
  const selectedSeriesRef = useRef(selectedSeries);
  const selectRef = useRef(select);
  const failRef = useRef(fail);
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(false);
  useEffect(() => {
    data.current = overlay;
    selectedRef.current = selected;
    selectedSeriesRef.current = selectedSeries;
    selectRef.current = select;
    failRef.current = fail;
  }, [overlay, selected, selectedSeries, select, fail]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const resize = new ResizeObserver(() => mapRef.current?.resize());
    let map: MapboxMap | undefined;
    fittedOverlay.current = undefined;
    try {
      map = new mapboxgl.Map({
        accessToken: token,
        container,
        style: mapStyle,
        attributionControl: true,
        scrollZoom: false,
        keyboard: !!large,
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      resize.observe(container);
      const instance = map;
      if (!large) instance.getCanvas().tabIndex = -1;
      const failMap = () => failRef.current();
      loadTimer.current = window.setTimeout(failMap, 15_000);
      instance.on("error", failMap);
      instance.on("style.load", () => {
        window.clearTimeout(loadTimer.current);
        try {
          overlaySources(instance, data.current);
          paintSelection(
            instance,
            selectedRef.current,
            selectedSeriesRef.current,
          );
          if (fittedOverlay.current !== data.current) {
            fit(instance, data.current);
            fittedOverlay.current = data.current;
          }
          setReady(true);
        } catch {
          failMap();
        }
      });
      instance.on("click", "recording-path-line", (event) => {
        const feature = event.features?.[0] as
          | { properties?: { section?: number } }
          | undefined;
        const section = feature?.properties?.section;
        if (typeof section === "number") selectRef.current?.(section);
      });
    } catch {
      failRef.current();
    }
    return () => {
      window.clearTimeout(loadTimer.current);
      resize.disconnect();
      mapRef.current = null;
      map?.remove();
    };
  }, [large, token]);

  useEffect(() => {
    if (mapRef.current?.getSource(routeSource)) {
      overlaySources(mapRef.current, overlay);
      fit(mapRef.current, overlay);
      fittedOverlay.current = overlay;
    }
  }, [overlay]);

  useEffect(() => {
    if (mapRef.current)
      paintSelection(mapRef.current, selected, selectedSeries);
  }, [selected, selectedSeries]);

  const controls = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        onClick={() => mapRef.current?.zoomIn({ duration: 0 })}
      >
        Zoom in
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        onClick={() => mapRef.current?.zoomOut({ duration: 0 })}
      >
        Zoom out
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        onClick={() => {
          if (mapRef.current) fit(mapRef.current, data.current);
        }}
      >
        Fit recording
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        aria-pressed={satellite}
        onClick={() => {
          setReady(false);
          loadTimer.current = window.setTimeout(
            () => failRef.current(),
            15_000,
          );
          mapRef.current?.setStyle(satellite ? mapStyle : satelliteStyle, {
            diff: false,
            localFontFamily: null,
            localIdeographFontFamily: "sans-serif",
          });
          setSatellite(!satellite);
        }}
      >
        Satellite view
      </Button>
    </div>
  );

  return (
    <div className="grid min-w-0 gap-2">
      {large && controls}
      <section
        ref={host}
        className={`min-w-0 overflow-hidden rounded-control ${large ? "h-(--journey-map-height)" : "h-72"}`}
        aria-label={
          large
            ? "Interactive map of the recorded journey"
            : "Map of selected recorded sections"
        }
      />
      {!large && controls}
    </div>
  );
}
