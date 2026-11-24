import {
  type RecordingSelection,
  recordingClock,
} from "@kairn/contracts/recordings";
import { useState } from "react";
import {
  Action,
  AppText,
  Field,
  Panel,
  StatusNotice,
} from "../fold/primitives";

export function RecordingClock({
  selection,
  disabled,
  change,
}: {
  selection: RecordingSelection;
  disabled: boolean;
  change: (selection: RecordingSelection) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [minutes, setMinutes] = useState("0");
  const [zone, setZone] = useState("UTC");
  const [invalid, setInvalid] = useState(false);

  function apply() {
    const parsed = recordingClock.safeParse({
      shiftMinutes: minutes.trim() ? Number(minutes) : Number.NaN,
      displayTimeZone: zone.trim(),
    });
    setInvalid(!parsed.success);
    if (parsed.success) change({ ...selection, clock: parsed.data });
  }

  return (
    <>
      <Action
        label={expanded ? "Close time settings" : "Adjust recording time"}
        accessibilityState={{ expanded }}
        onPress={() => {
          if (!expanded) {
            setMinutes(String(selection.clock?.shiftMinutes ?? 0));
            setZone(selection.clock?.displayTimeZone ?? "UTC");
            setInvalid(false);
          }
          setExpanded(!expanded);
        }}
      />
      {expanded && (
        <Panel>
          <AppText
            text="Shift the device clock in minutes. Use zero to change only how times are displayed. The original stays intact."
            subdued
          />
          <Field
            label="Clock shift in minutes"
            editable={!disabled}
            value={minutes}
            onChangeText={setMinutes}
          />
          <Field
            label="Display time zone"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            value={zone}
            onChangeText={setZone}
          />
          {invalid && (
            <StatusNotice
              notice={{
                text: "Enter whole minutes from −1440 to 1440 and a time zone such as Europe/London.",
                tone: "warning",
              }}
            />
          )}
          <Action
            label="Apply time adjustment"
            disabled={disabled}
            onPress={apply}
          />
          {selection.clock && (
            <Action
              label="Reset recording time"
              disabled={disabled}
              onPress={() => {
                setMinutes("0");
                setZone("UTC");
                setInvalid(false);
                change({ ...selection, clock: undefined });
              }}
            />
          )}
        </Panel>
      )}
    </>
  );
}
