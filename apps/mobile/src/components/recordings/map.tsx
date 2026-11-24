import { recordingOverlay } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { Component, lazy, type ReactNode, Suspense, useState } from "react";
import { journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";

const NativeMap = lazy(() => import("./map-view"));
const token = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
const configured = Boolean(token?.startsWith("pk."));

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

export function RecordingMap({
  scope,
  id,
  journeyId,
  batch = false,
  revision,
  cursor,
  through,
  selected,
  onSelect,
}: {
  scope: VerifiedMobileScope;
  id: string;
  journeyId?: string;
  batch?: boolean;
  revision?: number | string;
  cursor?: number;
  through: number;
  selected?: number;
  onSelect: (section: number) => void;
}) {
  const { refresh } = useMobileSession();
  const [open, setOpen] = useState(batch);
  const [failed, setFailed] = useState(false);
  const result = useQuery({
    queryKey: [
      "recording-map",
      batch,
      journeyId,
      id,
      revision,
      cursor,
      through,
    ],
    enabled: open && configured,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const query = { cursor, through };
      const response = journeyId
        ? await scope.api.GET(
            "/api/v1/journeys/{journeyId}/recordings/{id}/overlay",
            {
              params: { path: { id, journeyId }, query },
              signal,
            },
          )
        : batch
          ? await scope.api.GET("/api/v1/recording-batches/{id}/overlay", {
              params: { path: { id } },
              signal,
            })
          : await scope.api.GET("/api/v1/imports/{id}/overlay", {
              params: { path: { id }, query },
              signal,
            });
      return recordingOverlay.parse(journeyResult(response, scope, refresh));
    },
  });
  const paths = [...new Set(result.data?.paths.map(({ section }) => section))];
  const index = selected === undefined ? -1 : paths.indexOf(selected);
  return (
    <Panel>
      <Action
        label={open ? "Hide map" : "Show map"}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen(!open);
          setFailed(false);
        }}
      />
      {open &&
        (!configured || failed || result.isError ? (
          <>
            <StatusNotice
              notice={{
                text: "Map unavailable. You can continue with the section list.",
                tone: "warning",
              }}
            />
            <Action
              label="Retry map"
              onPress={() => {
                setFailed(false);
                if (configured) void result.refetch();
              }}
            />
          </>
        ) : result.isFetching || !result.data ? (
          <AppText text="Loading map" subdued />
        ) : !result.data.paths.length ? (
          <AppText text="No selected paths on this page." subdued />
        ) : (
          <>
            <MapBoundary onFailure={() => setFailed(true)}>
              <Suspense fallback={<AppText text="Opening map" subdued />}>
                <NativeMap
                  token={token ?? ""}
                  overlay={result.data}
                  selected={selected}
                  batch={batch}
                  onSelect={onSelect}
                  failed={() => setFailed(true)}
                />
              </Suspense>
            </MapBoundary>
            <Action
              label="Previous section on map"
              disabled={index <= 0}
              onPress={() => onSelect(paths[index - 1])}
            />
            <Action
              label="Next section on map"
              disabled={index + 1 >= paths.length}
              onPress={() => onSelect(paths[index + 1])}
            />
            {selected !== undefined && (
              <AppText
                text={
                  batch
                    ? `Path ${index + 1} selected`
                    : `Section ${selected + 1} selected`
                }
                accessibilityLiveRegion="polite"
              />
            )}
          </>
        ))}
    </Panel>
  );
}
