import {
  type RecordingOverlay,
  recordingOverlay,
} from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { journeyResult } from "@/lib/journey-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { JourneyLoading, JourneyRetry } from "../journeys/states";
import { RecordingRoutePreview } from "./route-preview";

type Subject = { id: string; journeyId?: string; revision?: number | string };

export function RecordingMap({
  scope,
  subject,
  cursor,
  through,
  selected,
  select,
}: {
  scope: AccountScope;
  subject: Subject;
  cursor?: number;
  through: number;
  selected?: number;
  select: (section: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { refresh } = useSessionAccess();
  const overlay = useQuery<RecordingOverlay>({
    queryKey: [
      scope.accountId,
      "recording-map",
      subject.journeyId,
      subject.id,
      subject.revision,
      cursor,
      through,
    ],
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const query = { cursor, through };
      const result = subject.journeyId
        ? await scope.api.GET(
            "/api/v1/journeys/{journeyId}/recordings/{id}/overlay",
            {
              params: {
                path: { id: subject.id, journeyId: subject.journeyId },
                query,
              },
              signal,
            },
          )
        : await scope.api.GET("/api/v1/imports/{id}/overlay", {
            params: { path: { id: subject.id }, query },
            signal,
          });
      return recordingOverlay.parse(journeyResult(result, scope, refresh));
    },
  });
  const choices = [
    ...new Set(overlay.data?.paths.map(({ section }) => section)),
  ];
  const current = selected === undefined ? -1 : choices.indexOf(selected);
  return (
    <div className="grid min-w-0 gap-3">
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide map" : "Show map"}
      </Button>
      {open &&
        (overlay.isError ? (
          <JourneyRetry
            title="Couldn’t load the recorded route"
            busy={overlay.isFetching}
            retry={() => void overlay.refetch()}
          />
        ) : overlay.isFetching || !overlay.data ? (
          <JourneyLoading label="Loading map" />
        ) : !overlay.data.paths.length ? (
          <p className="text-sm text-muted-foreground">
            No selected paths on this page.
          </p>
        ) : (
          <>
            <RecordingRoutePreview
              overlay={overlay.data}
              selected={selected}
              select={select}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={current <= 0}
                onClick={() => select(choices[current - 1])}
              >
                Previous section
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={current + 1 >= choices.length}
                onClick={() => select(choices[current + 1])}
              >
                Next section
              </Button>
            </div>
            <p className="text-sm text-muted-foreground" role="status">
              {current >= 0
                ? `Section ${choices[current] + 1} selected`
                : "No section selected"}
            </p>
          </>
        ))}
    </div>
  );
}
