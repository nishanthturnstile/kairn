import type { RecordingOverlay } from "@kairn/contracts/recordings";
import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  ShapeSource,
  SymbolLayer,
  setAccessToken,
  setTelemetryEnabled,
} from "@rnmapbox/maps";
import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useReduceMotionPreference } from "../fold/motion";
import { Action, AppText } from "../fold/primitives";

export default function RecordingMapView({
  token,
  overlay,
  selected,
  batch = false,
  onSelect,
  failed,
}: {
  token: string;
  overlay: RecordingOverlay;
  selected?: number;
  batch?: boolean;
  onSelect: (section: number) => void;
  failed: () => void;
}) {
  const camera = useRef<ComponentRef<typeof Camera>>(null);
  const map = useRef<ComponentRef<typeof MapView>>(null);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const reduceMotion = useReduceMotionPreference();
  const failure = useRef(failed);
  useEffect(() => {
    failure.current = failed;
  }, [failed]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) failure.current();
    }, 15_000);
    setTelemetryEnabled(false);
    void setAccessToken(token)
      .then(() => {
        clearTimeout(timer);
        if (active) setConfigured(true);
      })
      .catch(() => {
        if (active) failure.current();
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token]);

  useEffect(() => {
    if (!configured || loaded) return;
    const timer = setTimeout(() => failure.current(), 15_000);
    return () => clearTimeout(timer);
  }, [configured, loaded]);

  const route = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: overlay.paths.map(({ section, series, coordinates }) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates },
        properties: { section, series: series ?? -1 },
      })),
    }),
    [overlay],
  );
  const ends = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: overlay.paths.flatMap(({ section, coordinates }, index) =>
        [
          {
            name: `${batch ? "Path" : "Section"} ${batch ? index + 1 : section + 1} start`,
            point: coordinates[0],
          },
          {
            name: `${batch ? "Path" : "Section"} ${batch ? index + 1 : section + 1} end`,
            point: coordinates[coordinates.length - 1],
          },
        ].map(({ name, point }) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: point },
          properties: { name, section },
        })),
      ),
    }),
    [batch, overlay],
  );

  if (!configured || !overlay.bounds)
    return <AppText text="Opening map" subdued />;
  const [west, south, east, north] = overlay.bounds;
  const duration = reduceMotion ? 0 : 200;
  const fit = () =>
    camera.current?.fitBounds([east, north], [west, south], 32, duration);
  async function zoom(delta: number) {
    try {
      const current = await map.current?.getZoom();
      if (current !== undefined)
        camera.current?.zoomTo(
          Math.min(20, Math.max(0, current + delta)),
          duration,
        );
    } catch {
      failure.current();
    }
  }

  return (
    <View style={styles.group}>
      <MapView
        ref={map}
        style={styles.map}
        styleURL={
          satellite
            ? "mapbox://styles/mapbox/satellite-streets-v12"
            : "mapbox://styles/mapbox/outdoors-v12"
        }
        attributionEnabled
        logoEnabled
        compassEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        accessibilityLabel="Map of selected recorded sections"
        onDidFinishLoadingStyle={() => {
          setLoaded(true);
          fit();
        }}
        onMapLoadingError={() => failure.current()}
      >
        <Camera
          ref={camera}
          maxZoomLevel={20}
          defaultSettings={{
            bounds: { ne: [east, north], sw: [west, south] },
            padding: {
              paddingTop: 24,
              paddingBottom: 24,
              paddingLeft: 24,
              paddingRight: 24,
            },
          }}
        />
        <ShapeSource
          id="import-recorded-route"
          shape={route}
          onPress={(event) => {
            const section = event.features[0]?.properties?.section;
            if (typeof section === "number") onSelect(section);
          }}
        >
          <LineLayer
            id="recording-casing"
            style={{
              lineColor: "#161913",
              lineWidth: 7,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <LineLayer
            id="recording-route"
            style={{
              lineColor: batch
                ? [
                    "match",
                    ["%", ["get", "series"], 4],
                    1,
                    "#8dcfe2",
                    2,
                    "#f6b28b",
                    3,
                    "#efb4e4",
                    "#e4f49d",
                  ]
                : "#e4f49d",
              lineWidth:
                batch && selected !== undefined
                  ? ["case", ["==", ["get", "section"], selected], 6, 4]
                  : 4,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </ShapeSource>
        <ShapeSource id="import-recorded-ends" shape={ends}>
          <CircleLayer
            id="recording-endpoint"
            style={{
              circleRadius: 4,
              circleColor: "#e4f49d",
              circleStrokeColor: "#161913",
              circleStrokeWidth: 2,
            }}
          />
          <CircleLayer
            id="recording-selected-point"
            filter={["==", ["get", "section"], selected ?? -1]}
            style={{
              circleRadius: 10,
              circleColor: "transparent",
              circleStrokeColor: "#f6ffc7",
              circleStrokeWidth: 3,
            }}
          />
          <SymbolLayer
            id="recording-endpoint-label"
            style={{
              textField: ["get", "name"],
              textSize: 12,
              textOffset: [0, 1],
              textAnchor: "top",
              textColor: "#161913",
              textHaloColor: "#ffffff",
              textHaloWidth: 2,
            }}
          />
        </ShapeSource>
      </MapView>
      <Action label="Zoom in" disabled={!loaded} onPress={() => void zoom(1)} />
      <Action
        label="Zoom out"
        disabled={!loaded}
        onPress={() => void zoom(-1)}
      />
      <Action label="Fit recording" disabled={!loaded} onPress={fit} />
      <Action
        label={satellite ? "Show map view" : "Show satellite view"}
        disabled={!loaded}
        onPress={() => {
          setLoaded(false);
          setSatellite(!satellite);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create(({ semantic: { space } }) => ({
  group: { gap: space.step8 },
  map: { height: 280, width: "100%" },
}));
