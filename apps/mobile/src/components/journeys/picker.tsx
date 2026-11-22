import { isCalendarDate, isClockTime } from "@kairn/shared/journey-form";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  type ComponentRef,
  type ReactNode,
  type Ref,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  type Pressable,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { FoldSheet } from "../fold/controls";
import { Action, Field } from "../fold/primitives";
import { journeyStyles } from "./states";

export function SchedulePicker({
  mode,
  label,
  value,
  disabled,
  compact,
  renderField,
  onChange,
}: {
  mode: "date" | "time";
  label: string;
  value: string;
  disabled: boolean;
  compact: boolean;
  renderField: (trigger?: ReactNode) => ReactNode;
  onChange: (value: string) => void;
}) {
  const triggerRef = useRef<ComponentRef<typeof Pressable>>(null);
  const { rt } = useUnistyles();
  const [selection, setSelection] = useState<Date | null>(null);

  function commit(date: Date) {
    if (!disabled)
      onChange(
        date
          .toISOString()
          .slice(mode === "date" ? 0 : 11, mode === "date" ? 10 : 16),
      );
  }

  function open() {
    Keyboard.dismiss();
    // The picker uses UTC to carry a wall-clock value across device zones.
    const now = new Date();
    const local = new Date(
      Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
      ),
    );
    const valid = mode === "date" ? isCalendarDate(value) : isClockTime(value);
    const initial = valid
      ? new Date(mode === "date" ? `${value}T12:00Z` : `2000-01-01T${value}Z`)
      : local;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        mode,
        value: initial,
        is24Hour: true,
        timeZoneName: "UTC",
        onValueChange: (_, date) => commit(date),
      });
    } else {
      setSelection(initial);
    }
  }

  const expanded = Platform.OS === "ios" && !!selection && !disabled;
  const trigger = disabled ? undefined : (
    <Action
      ref={triggerRef}
      label={compact ? "Pick" : label}
      accessibilityLabel={label}
      accessibilityState={Platform.OS === "ios" ? { expanded } : undefined}
      variant="text"
      onPress={() => {
        if (expanded) setSelection(null);
        else open();
      }}
    />
  );
  return (
    <View style={journeyStyles.group}>
      {renderField(compact ? trigger : undefined)}
      {!compact && trigger}
      {Platform.OS === "ios" && (
        <FoldSheet
          title={label}
          visible={expanded}
          closeLabel="Cancel"
          onClose={() => setSelection(null)}
          onDismiss={() => {
            if (triggerRef.current)
              AccessibilityInfo.sendAccessibilityEvent(
                triggerRef.current,
                "focus",
              );
          }}
        >
          {selection && (
            <>
              <DateTimePicker
                mode={mode}
                display="spinner"
                value={selection}
                timeZoneName="UTC"
                themeVariant={rt.themeName === "dark" ? "dark" : "light"}
                onValueChange={(_, date) => setSelection(date)}
              />
              <Action
                label={mode === "date" ? "Use date" : "Use time"}
                variant="primary"
                onPress={() => {
                  commit(selection);
                  setSelection(null);
                }}
              />
            </>
          )}
        </FoldSheet>
      )}
    </View>
  );
}

export function focusInvalidSchedule(
  input: ComponentRef<typeof TextInput> | null | undefined,
  mode: "date" | "time",
  text: string,
) {
  if (!input) return;
  input.focus();
  const parts = text.split(mode === "date" ? "-" : ":");
  let start = 0,
    end = 0;
  if (mode === "time") {
    start = /^([01]\d|2[0-3])$/.test(parts[0]) ? 3 : 0;
    end = start + 2;
  } else if (!/^\d{4}$/.test(parts[0]) || Number(parts[0]) < 1) end = 4;
  else if (!/^(0[1-9]|1[0-2])$/.test(parts[1] ?? "")) {
    start = 5;
    end = 7;
  } else {
    start = 8;
    end = 10;
  }
  requestAnimationFrame(() => {
    if (input.isFocused())
      input.setSelection(
        Math.min(start, text.length),
        Math.min(end, text.length),
      );
  });
}

export function ScheduleField({
  mode,
  label,
  value,
  disabled = false,
  compact,
  onChange,
  error,
  ref,
}: {
  mode: "date" | "time";
  label: string;
  value: string;
  disabled?: boolean;
  compact?: boolean;
  onChange: (next: string) => void;
  error?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const { width, fontScale } = useWindowDimensions();
  const format = mode === "date" ? "YYYY-MM-DD" : "HH:MM";
  function edit(text: string) {
    // Format a compact paste or a new digit at the end. Keep native range edits
    // and deletion intact, including deletion of a separator.
    const digits = text.replace(/[-:]/g, "");
    const compactPaste =
      /^\d+$/.test(text) && text.length === (mode === "date" ? 8 : 4);
    if (
      compactPaste ||
      (text.startsWith(value) &&
        text.length === value.length + 1 &&
        /^\d+$/.test(digits) &&
        /\d$/.test(text))
    ) {
      const parts =
        mode === "date"
          ? [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6)]
          : [digits.slice(0, 2), digits.slice(2)];
      onChange(parts.filter(Boolean).join(mode === "date" ? "-" : ":"));
    } else onChange(text);
  }
  return (
    <SchedulePicker
      mode={mode}
      label={`Pick ${label.toLowerCase()}`}
      value={value}
      disabled={disabled}
      compact={compact ?? (width >= 365 && fontScale <= 1.35)}
      onChange={onChange}
      renderField={(trigger) => (
        <Field
          label={label}
          ref={ref}
          error={error}
          accessibilityHint={`Enter ${format}`}
          placeholder={format}
          value={value}
          onChangeText={edit}
          inputMode="numeric"
          maxLength={format.length}
          autoCorrect={false}
          autoCapitalize="none"
          editable={!disabled}
          suffix={trigger}
        />
      )}
    />
  );
}
