import type { JourneySchedule, PrivateJourney } from "@kairn/contracts";
import { journeyRoleLabel } from "@kairn/shared/journey-editorial";
import {
  formatJourneyLocalMinute,
  journeyScheduleStatus,
  journeyStatusLabels,
} from "@kairn/shared/journey-time";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Badge } from "../fold/identity";
import { Action, AppText, Panel } from "../fold/primitives";

export function JourneyDetailContent({
  journey,
  asOf,
  onViewPeople,
}: {
  journey: PrivateJourney;
  asOf: number;
  onViewPeople: () => void;
}) {
  const { schedule } = journey;
  const status = schedule && journeyScheduleStatus(schedule, asOf);
  return (
    <View style={styles.content}>
      <View style={styles.metadata}>
        {status && <Badge text={journeyStatusLabels[status]} />}
        <AppText text="Private" variant="caption" subdued />
        {journey.state === "archived" && (
          <AppText text="Archived" variant="caption" subdued />
        )}
      </View>
      <Panel>
        <AppText text="Schedule" variant="section" accessibilityRole="header" />
        {schedule ? (
          <View style={styles.schedule}>
            <View>
              <ScheduleStop
                label="Intended start"
                minute={schedule.intendedStart}
                first
              />
              <ScheduleStop
                label="Intended end"
                minute={schedule.intendedEnd}
              />
            </View>
            <View style={[styles.valueRow, styles.timeZone]}>
              <AppText text="Time zone" variant="caption" subdued />
              <AppText text={schedule.timeZone} variant="label" />
            </View>
          </View>
        ) : (
          <AppText text="Dates unavailable" subdued />
        )}
      </Panel>
      <View style={styles.people}>
        <AppText text="People" variant="section" accessibilityRole="header" />
        <View style={[styles.valueRow, styles.role]}>
          <AppText text="Your role" variant="caption" subdued />
          <AppText
            text={journeyRoleLabel(journey.capabilities)}
            variant="label"
          />
        </View>
        <Action label="View people" onPress={onViewPeople} />
      </View>
    </View>
  );
}

function ScheduleStop({
  label,
  minute,
  first,
}: {
  label: string;
  minute: JourneySchedule["intendedEnd"];
  first?: boolean;
}) {
  const local = minute && formatJourneyLocalMinute(minute.local);
  return (
    <View style={[styles.stop, first && styles.firstStop]}>
      {first && <View style={styles.line} accessible={false} />}
      <View style={[styles.dot, minute && styles.dated]} accessible={false} />
      <AppText text={label} variant="caption" subdued />
      {local ? (
        <>
          <AppText text={local.date} variant="section" />
          <AppText text={local.time} subdued />
        </>
      ) : (
        <AppText text="End date unknown" variant="label" subdued />
      )}
    </View>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    content: { gap: space.step16 },
    metadata: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: space.step12,
    },
    schedule: { paddingTop: space.step4, gap: space.step16 },
    stop: { paddingStart: space.step24, gap: space.step4 },
    firstStop: { paddingBottom: space.step16 },
    line: {
      position: "absolute",
      start: space.step4,
      top: space.step8,
      bottom: -space.step8,
      width: border.control,
      backgroundColor: color.boundary,
    },
    dot: {
      position: "absolute",
      start: 0,
      top: space.step8,
      width: space.step8,
      height: space.step8,
      borderRadius: space.step4,
      borderColor: color.action,
      borderWidth: border.control,
      backgroundColor: color.surface,
    },
    dated: { backgroundColor: color.action },
    valueRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      gap: space.step8,
    },
    timeZone: {
      borderTopColor: color.boundary,
      borderTopWidth: border.control,
      paddingTop: space.step12,
    },
    role: { justifyContent: "space-between" },
    people: {
      gap: space.step12,
      padding: space.step12,
      borderRadius: radius.card,
      borderColor: color.boundary,
      borderWidth: border.control,
      backgroundColor: color.actionWash,
    },
  }),
);
