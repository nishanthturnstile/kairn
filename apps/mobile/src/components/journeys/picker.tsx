import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { type ReactNode, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Action } from "../ui";
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
    const current = new Date(
      mode === "date" ? `${value}T12:00Z` : `2000-01-01T${value}Z`,
    );
    const initial = Number.isNaN(current.getTime()) ? new Date() : current;
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
      {expanded && selection && (
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
          <Action label="Cancel" onPress={() => setSelection(null)} />
        </>
      )}
    </View>
  );
}
