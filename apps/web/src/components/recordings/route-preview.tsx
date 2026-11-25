import type { RecordingOverlay } from "@kairn/contracts/recordings";
import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { JourneyLoading } from "../journeys/states";
import { routeColors } from "./route-colors";

const MapBox = lazy(() => import("./map-box"));
const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;

class MapBoundary extends Component<{
  children: ReactNode;
  onFailure: () => void;
}> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type RoutePreviewProps = {
  overlay: RecordingOverlay;
  selected?: number;
  selectedSeries?: number;
  select?: (section: number) => void;
  large?: boolean;
};

export function RecordingRoutePreview(props: RoutePreviewProps) {
  const [failed, setFailed] = useState(false);
  const configured = typeof token === "string" && token.startsWith("pk.");
  if (configured && !failed) {
    const fail = () => setFailed(true);
    return (
      <MapBoundary onFailure={fail}>
        <Suspense
          fallback={
            <div
              className={
                props.large
                  ? "grid h-(--journey-map-height) place-items-center rounded-control border bg-card"
                  : undefined
              }
            >
              <JourneyLoading label="Opening map" />
            </div>
          }
        >
          <MapBox {...props} token={token} fail={fail} />
        </Suspense>
      </MapBoundary>
    );
  }

  return (
    <figure className="grid min-w-0 gap-2">
      <RecordingRouteOverview {...props} />
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span>Recorded route without a basemap.</span>
        {configured && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFailed(false)}
          >
            Retry basemap
          </Button>
        )}
      </figcaption>
    </figure>
  );
}

export function RecordingRouteOverview({
  overlay,
  selected,
  selectedSeries,
  large,
}: Omit<RoutePreviewProps, "select">) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    const bounds = overlay.bounds;
    if (!element || !context || !bounds) return;

    const [west, south, east, north] = bounds;
    // The API aligns paths across the date line. Correct longitude scale at
    // the middle latitude and fit both axes with the same drawing scale.
    const longitudeScale = Math.cos(((north + south) * Math.PI) / 360);
    const horizontalSpan = (east - west) * longitudeScale;
    const verticalSpan = north - south;
    const isSelected = ({
      section,
      series,
    }: RecordingOverlay["paths"][number]) =>
      selectedSeries === undefined
        ? section === selected
        : series === selectedSeries;
    const paths = [...overlay.paths].sort(
      (a, b) => Number(isSelected(a)) - Number(isSelected(b)),
    );

    const observer = new ResizeObserver(
      ([
        {
          contentRect: { width, height },
        },
      ]) => {
        if (!width || !height) return;
        const ratio = Math.min(window.devicePixelRatio, 2);
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
        context.scale(ratio, ratio);
        context.lineCap = "round";
        context.lineJoin = "round";
        const padding = Math.min(24, width / 8, height / 8);
        const scale = Math.min(
          (width - padding * 2) / Math.max(horizontalSpan, 1e-9),
          (height - padding * 2) / Math.max(verticalSpan, 1e-9),
        );
        const left = (width - horizontalSpan * scale) / 2;
        const top = (height - verticalSpan * scale) / 2;
        const outline = getComputedStyle(element)
          .getPropertyValue("--fold-map-ink")
          .trim();

        for (const path of paths) {
          context.beginPath();
          for (const [i, [longitude, latitude]] of path.coordinates.entries()) {
            const x = left + (longitude - west) * longitudeScale * scale;
            const y = top + (north - latitude) * scale;
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          const lineWidth = isSelected(path) ? 5 : 3;
          context.strokeStyle = outline;
          context.lineWidth = lineWidth + 2;
          context.stroke();
          context.strokeStyle =
            routeColors[(path.series ?? 0) % routeColors.length];
          context.lineWidth = lineWidth;
          context.stroke();
        }
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [overlay, selected, selectedSeries]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Recorded route overview"
      className={`recording-route-overview block min-h-40 w-full rounded-control border ${large ? "h-(--journey-map-height)" : "aspect-[2/1]"}`}
    />
  );
}
