import type {
  RecordingRunSummary,
  RecordingSection,
  RecordingSelection,
} from "@kairn/contracts/recordings";
import { formatRecordedInstant } from "@kairn/shared/recording-time";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { journeyResult } from "../../journey-api";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import { JourneyRetry } from "../journeys/states";

const kilometres = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
const reasons: Record<RecordingRunSummary["breakBefore"], string> = {
  segment_boundary: "The file starts another section here.",
  invalid_coordinates: "Path unknown across invalid coordinates.",
  clock_reversal: "Path unknown where the clock moved backward.",
  long_pause: "Path unknown across a long pause.",
  implausible_jump: "Path unknown across an unusually large jump.",
  user_split: "You marked a break here.",
};

type Edit = {
  scope: VerifiedMobileScope;
  importId: string;
  disabled: boolean;
  selection: RecordingSelection;
  change: (next: RecordingSelection) => void;
};

export function RecordingSectionList({
  sections,
  edit,
}: {
  sections: RecordingSection[];
  edit?: Edit;
}) {
  return sections.map((section) => (
    <Section key={section.ordinal} section={section} edit={edit} />
  ));
}

function Section({
  section,
  edit,
}: {
  section: RecordingSection;
  edit?: Edit;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = `${section.trackName ?? `Track ${section.trackIndex + 1}`}, section ${section.ordinal + 1}`;
  const path = section.measurements.sampleCount > 1;
  const included =
    (edit
      ? !edit.selection.excluded.includes(section.ordinal)
      : section.included) && path;
  return (
    <Panel>
      <AppText text={title} variant="label" accessibilityRole="header" />
      <AppText
        text={`${!path ? "Observation" : included ? "Included" : "Excluded"}. ${reasons[section.breakBefore]}`}
        subdued
      />
      {section.invalidTimestamps > 0 && (
        <AppText
          text={`${section.invalidTimestamps} invalid time readings.`}
          subdued
        />
      )}
      {section.invalidElevations > 0 && (
        <AppText
          text={`${section.invalidElevations} invalid elevation readings.`}
          subdued
        />
      )}
      {section.splitRuns?.length ? (
        section.splitRuns.map((run, index) => (
          <View key={run.firstPointIndex} style={styles.group}>
            <AppText
              text={`Part ${index + 1}. ${reasons[run.breakBefore]}`}
              variant="label"
            />
            <Facts run={run} zone={section.displayTimeZone} />
          </View>
        ))
      ) : (
        <Facts run={section} zone={section.displayTimeZone} />
      )}
      {edit && path && (
        <>
          <Action
            label={included ? "Exclude section" : "Include section"}
            accessibilityLabel={`${included ? "Exclude section" : "Include section"}. ${title}`}
            disabled={edit.disabled}
            onPress={() =>
              edit.change({
                ...edit.selection,
                excluded: included
                  ? [...edit.selection.excluded, section.ordinal]
                  : edit.selection.excluded.filter(
                      (item) => item !== section.ordinal,
                    ),
              })
            }
          />
          <Action
            label={expanded ? "Hide samples" : "Review samples"}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
          />
          {expanded && <SampleList edit={edit} section={section} />}
        </>
      )}
    </Panel>
  );
}

function Facts({
  run,
  zone = "UTC",
}: {
  run: RecordingRunSummary;
  zone?: string;
}) {
  const { measurements: item } = run;
  return (
    <View accessible style={styles.group}>
      <AppText
        text={
          item.distanceMetres === null
            ? "One-point observation"
            : `Recorded distance ${kilometres.format(item.distanceMetres / 1000)} km`
        }
      />
      <AppText text={`${item.sampleCount} samples`} subdued />
      <AppText
        text={
          item.firstInstant
            ? `First recorded time ${formatRecordedInstant(item.firstInstant, zone)}`
            : "Time unavailable"
        }
        subdued
      />
      {item.lastInstant && item.lastInstant !== item.firstInstant && (
        <AppText
          text={`Last recorded time ${formatRecordedInstant(item.lastInstant, zone)}`}
          subdued
        />
      )}
      <AppText
        text={
          item.elevationMinMetres === null
            ? "Elevation unavailable"
            : `Elevation ${item.elevationMinMetres} to ${item.elevationMaxMetres ?? item.elevationMinMetres} metres`
        }
        subdued
      />
    </View>
  );
}

function SampleList({
  edit,
  section,
}: {
  edit: Edit;
  section: RecordingSection;
}) {
  const { scope, importId, selection, change, disabled } = edit;
  const { refresh } = useMobileSession();
  const [page, setPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const result = useQuery({
    queryKey: ["recording-samples", importId, section.ordinal, page],
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET("/api/v1/imports/{id}/segments/{section}/samples", {
          params: {
            path: { id: importId, section: section.ordinal },
            query: { page },
          },
          signal,
        }),
        scope,
        refresh,
      ),
  });
  if (result.isError)
    return (
      <JourneyRetry
        text="Couldn’t load samples."
        retry={() => void result.refetch()}
      />
    );
  if (!result.data)
    return <StatusNotice notice={{ text: "Loading samples", tone: "info" }} />;
  const max = 12;
  const { nextCursor, samples } = result.data;
  return (
    <View style={styles.section}>
      {samples.slice(offset, offset + max).map((point) => {
        const isSplit = selection.splits.some(
          (item) =>
            item.section === section.ordinal &&
            item.beforePoint === point.index,
        );
        return (
          <View key={point.index} style={styles.group}>
            <AppText text={`Point ${point.index + 1}`} variant="label" />
            <AppText
              text={
                point.instant
                  ? formatRecordedInstant(point.instant)
                  : "Time unavailable"
              }
              subdued
            />
            {point.index > section.firstPointIndex && (
              <Action
                label={isSplit ? "Undo split" : "Split before this point"}
                accessibilityLabel={
                  isSplit
                    ? `Undo split before point ${point.index + 1}`
                    : `Split before this point. Point ${point.index + 1}`
                }
                disabled={disabled}
                onPress={() =>
                  change({
                    ...selection,
                    splits: isSplit
                      ? selection.splits.filter(
                          (item) =>
                            item.section !== section.ordinal ||
                            item.beforePoint !== point.index,
                        )
                      : [
                          ...selection.splits,
                          {
                            section: section.ordinal,
                            beforePoint: point.index,
                          },
                        ],
                  })
                }
              />
            )}
          </View>
        );
      })}
      {offset > 0 && (
        <Action
          label="Previous samples"
          onPress={() => setOffset(offset - max)}
        />
      )}
      {!offset && page > 0 && (
        <Action
          label="Previous sample page"
          onPress={() => setPage(page - 1)}
        />
      )}
      {offset + max < samples.length ? (
        <Action label="Next samples" onPress={() => setOffset(offset + max)} />
      ) : (
        nextCursor !== null && (
          <Action
            label="Next sample page"
            onPress={() => {
              setOffset(0);
              setPage(nextCursor);
            }}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create(({ semantic: { space } }) => ({
  group: { gap: space.step4 },
  section: { gap: space.step12 },
}));
