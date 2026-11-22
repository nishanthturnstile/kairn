import { isCalendarDate, isClockTime } from "@kairn/shared/journey-form";
import { type ComponentRef, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { DestinationTab, destinationIcons } from "../destination-tabs";
import { Choice, Heading, Select, styles } from "../fold/controls";
import { PasswordField } from "../fold/password-field";
import {
  Action,
  AppText,
  Field,
  Panel,
  StatusNotice,
  touchTarget,
} from "../fold/primitives";
import { focusInvalidSchedule, ScheduleField } from "../journeys/picker";
import type { SectionId } from "./catalog";

export function Buttons({ navigate }: { navigate: (id: SectionId) => void }) {
  const [state, setState] = useState("Ready");
  const [size, setSize] = useState<"Compact" | "Standard" | "Capture">(
    "Standard",
  );
  return (
    <>
      <Select
        label="Preview state"
        values={["Ready", "Saving", "Saved", "Disabled"]}
        value={state}
        onChange={setState}
      />
      <Select
        label="Button size"
        values={["Compact", "Standard", "Capture"] as const}
        value={size}
        onChange={setSize}
      />
      <Panel>
        <Heading text="Inset key" />
        <Action
          size={
            size === "Capture"
              ? "capture"
              : size === "Compact"
                ? "compact"
                : "standard"
          }
          variant="primary"
          label={
            state === "Saved"
              ? "Saved"
              : state === "Saving"
                ? "Saving…"
                : "Save moment"
          }
          disabled={state !== "Ready"}
          feedback={
            state === "Saved"
              ? "success"
              : state === "Saving"
                ? "pending"
                : "idle"
          }
          onPress={() => setState("Saved")}
        />
        <StatusNotice
          notice={
            state === "Saved"
              ? { text: "Sample moment saved.", tone: "success" }
              : null
          }
        />
      </Panel>
      <Action label="Reset sample" onPress={() => setState("Ready")} />
      <Action
        label="Discard saved sample"
        variant="danger"
        disabled={state !== "Saved"}
        onPress={() => setState("Ready")}
      />
      <Action label="Go to fields" onPress={() => navigate("fields")} />
      <Action
        label="Inspect overlays"
        variant="text"
        onPress={() => navigate("overlays")}
      />
      <Action
        label="About action sizes"
        variant="text"
        onPress={() =>
          Alert.alert(
            "Action sizes",
            `Controls have at least a ${touchTarget}-unit touch target. Capture actions use 56.`,
          )
        }
      />
    </>
  );
}
const destinations = {
  Journeys: "Two journeys in your sample workspace.",
  Discover: "Published journeys from the community.",
  Saved: "Your collection of saved journeys.",
};
export function Navigation() {
  const [value, select] = useState<keyof typeof destinations>("Journeys");
  const [vertical, setVertical] = useState(false);
  const { fontScale } = useWindowDimensions();
  return (
    <>
      <View
        role="tablist"
        style={{
          flexDirection: vertical || fontScale > 1.35 ? "column" : "row",
          gap: 8,
        }}
      >
        {(Object.keys(destinations) as (keyof typeof destinations)[]).map(
          (name) => (
            <DestinationTab
              key={name}
              label={name}
              icon={destinationIcons[name.toLowerCase()]}
              selected={value === name}
              stacked={fontScale >= 1.5}
              onPress={() => select(name)}
              onLongPress={() => select(name)}
            />
          ),
        )}
        <DestinationTab
          label="Archived"
          disabled
          selected={false}
          stacked={fontScale >= 1.5}
        />
      </View>
      <AppText text={destinations[value]} />
      <Choice
        kind="switch"
        label="Vertical navigation"
        checked={vertical}
        onChange={() => setVertical(!vertical)}
      />
    </>
  );
}
export function Fields() {
  const [name, setName] = useState(""),
    [note, setNote] = useState(""),
    [password, setPassword] = useState("");
  const [access, setAccess] = useState("Only me");
  const [date, setDate] = useState(""),
    [time, setTime] = useState("");
  const [attempted, submit] = useState(false),
    [applied, setApplied] = useState("");
  const input = useRef<ComponentRef<typeof TextInput>>(null),
    dateInput = useRef<ComponentRef<typeof TextInput>>(null),
    timeInput = useRef<ComponentRef<typeof TextInput>>(null);
  const badDate = !!date && !isCalendarDate(date),
    badTime = !!time && !isClockTime(time);
  function apply() {
    submit(true);
    if (!name.trim()) {
      input.current?.focus();
      return;
    }
    if (badDate) {
      focusInvalidSchedule(dateInput.current, "date", date);
      return;
    }
    if (badTime) {
      focusInvalidSchedule(timeInput.current, "time", time);
      return;
    }
    Keyboard.dismiss();
    setApplied(name.trim());
  }
  return (
    <>
      <Field
        ref={input}
        label="Journey name (required)"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setApplied("");
        }}
        error={attempted && !name.trim() ? "Enter a journey name." : undefined}
      />
      <Field
        label="Note"
        multiline
        numberOfLines={3}
        value={note}
        onChangeText={setNote}
      />
      <Select
        label="Visibility"
        value={access}
        values={["Only me", "Journey review"]}
        onChange={setAccess}
      />
      <PasswordField
        label="Sample password"
        value={password}
        onChangeText={setPassword}
      />
      <ScheduleField
        ref={dateInput}
        mode="date"
        label="Start date"
        value={date}
        onChange={setDate}
        error={
          attempted && badDate ? "Enter a valid calendar date." : undefined
        }
      />
      <ScheduleField
        ref={timeInput}
        mode="time"
        label="Start time"
        value={time}
        onChange={setTime}
        error={
          attempted && badTime ? "Enter a time from 00:00 to 23:59." : undefined
        }
      />
      <Action label="Apply name" variant="primary" onPress={apply} />
      <StatusNotice
        notice={
          applied
            ? { text: `Sample name applied: ${applied}`, tone: "success" }
            : null
        }
      />
      <Heading text="Field availability" />
      <Field
        label="Original journey reference (read only)"
        value="Nilgiri weekend"
        readOnly
      />
      <Field
        label="Archived note (unavailable)"
        value="No archived notes"
        editable={false}
        accessibilityState={{ disabled: true }}
      />
    </>
  );
}
export function Selection() {
  const [captions, setCaptions] = useState(true),
    [credits, setCredits] = useState(false),
    [local, setLocal] = useState(true),
    [access, setAccess] = useState("Only me");
  return (
    <>
      <View style={styles.block}>
        <Heading text="Journal details" />
        <Choice
          label="Include captions"
          kind="checkbox"
          checked={captions}
          onChange={() => setCaptions(!captions)}
        />
        <Choice
          label="Include author credits"
          kind="checkbox"
          checked={credits}
          onChange={() => setCredits(!credits)}
        />
        <Choice
          label="Include private originals"
          kind="checkbox"
          checked={false}
          disabled
        />
      </View>
      <View accessibilityRole="radiogroup" style={styles.block}>
        <Heading text="Source access" />
        {["Only me", "Journey review"].map((v) => (
          <Choice
            key={v}
            label={v}
            checked={access === v}
            onChange={() => setAccess(v)}
          />
        ))}
        <Choice label="Public sharing unavailable" checked={false} disabled />
      </View>
      <Choice
        kind="switch"
        label="Keep a local copy"
        checked={local}
        onChange={() => setLocal(!local)}
      />
      <Choice
        kind="switch"
        label="Automatic upload unavailable"
        checked={false}
        disabled
      />
    </>
  );
}
