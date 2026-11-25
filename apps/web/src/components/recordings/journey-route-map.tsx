import { journeyRecordingOverview } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { journeyResult } from "@/lib/journey-api";
import { journeyRouteKey } from "@/lib/recording-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { JourneyLoading, JourneyRetry } from "../journeys/states";
import { RecordingRouteOverview, RecordingRoutePreview } from "./route-preview";

export function JourneyRouteMap({
  journeyId,
  scope,
  overviewOnly,
  onlyWithRecordings,
}: {
  journeyId: string;
  scope: AccountScope;
  overviewOnly?: boolean;
  onlyWithRecordings?: boolean;
}) {
  const { refresh } = useSessionAccess();
  const geometry = useQuery({
    queryKey: journeyRouteKey(scope, journeyId),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const response = await scope.api.GET(
        "/api/v1/journeys/{journeyId}/recordings/overview",
        { params: { path: { journeyId } }, signal },
      );
      if (onlyWithRecordings && response.response.status === 503) return null;
      return journeyRecordingOverview.parse(
        journeyResult(response, scope, refresh),
      );
    },
  });

  if (onlyWithRecordings && !geometry.isError && !geometry.data?.paths.length)
    return null;

  return (
    <section
      aria-label="Journey route"
      className="grid min-w-0 gap-2 [--journey-map-height:clamp(250px,60svh,32rem)] sm:[--journey-map-height:max(320px,calc(100svh-20.5rem))]"
    >
      {geometry.isError ? (
        <JourneyRetry
          title="Couldn’t load the recorded route"
          busy={geometry.isFetching}
          retry={() => void geometry.refetch()}
        />
      ) : !geometry.isFetchedAfterMount || !geometry.data ? (
        <div className="grid min-h-48 place-items-center rounded-control border bg-card">
          <JourneyLoading label="Loading recorded route" />
        </div>
      ) : !geometry.data.paths.length ? (
        <div className="grid min-h-40 place-content-center justify-items-center gap-2 rounded-control border bg-card px-4 py-6 text-center">
          <MapPin aria-hidden="true" className="size-5 text-muted-foreground" />
          <p className="font-semibold">No recorded route available</p>
        </div>
      ) : (
        <>
          {overviewOnly ? (
            <RecordingRouteOverview overlay={geometry.data} />
          ) : (
            <RecordingRoutePreview overlay={geometry.data} large />
          )}
          {geometry.data.limited && (
            <p className="text-sm text-muted-foreground">
              This map shows selected sections of a long recording or journey.
              Open Recordings to see all sections.
            </p>
          )}
        </>
      )}
    </section>
  );
}
