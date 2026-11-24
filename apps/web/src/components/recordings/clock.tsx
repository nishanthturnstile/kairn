import {
  type RecordingSelection,
  recordingClock,
} from "@kairn/contracts/recordings";
import { type KeyboardEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function RecordingClock({
  selection,
  disabled,
  change,
}: {
  selection: RecordingSelection;
  disabled: boolean;
  change: (selection: RecordingSelection) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("0");
  const [zone, setZone] = useState("UTC");
  const [error, setError] = useState("");

  function apply() {
    const parsed = recordingClock.safeParse({
      shiftMinutes: minutes.trim() ? Number(minutes) : Number.NaN,
      displayTimeZone: zone.trim(),
    });
    if (!parsed.success) {
      setError(
        "Enter whole minutes from −1440 to 1440 and a time zone such as Europe/London.",
      );
      return;
    }
    setError("");
    change({ ...selection, clock: parsed.data });
  }

  function submitAdjustment(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setMinutes(String(selection.clock?.shiftMinutes ?? 0));
            setZone(selection.clock?.displayTimeZone ?? "UTC");
            setError("");
          }
          setOpen(!open);
        }}
      >
        {open ? "Close time settings" : "Adjust recording time"}
      </Button>
      {open && (
        <div className="grid min-w-0 gap-3 rounded-control border p-3">
          <p className="text-sm text-muted-foreground">
            Shift the device clock in minutes. Use zero to change only how times
            are displayed. The original stays intact.
          </p>
          <Field>
            <FieldLabel htmlFor={`${id}-shift`}>
              Clock shift in minutes
            </FieldLabel>
            <Input
              id={`${id}-shift`}
              type="number"
              step={1}
              min={-1440}
              max={1440}
              value={minutes}
              disabled={disabled}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => setMinutes(event.target.value)}
              onKeyDown={submitAdjustment}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-zone`}>Display time zone</FieldLabel>
            <Input
              id={`${id}-zone`}
              value={zone}
              disabled={disabled}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => setZone(event.target.value)}
              onKeyDown={submitAdjustment}
            />
          </Field>
          {error && (
            <p
              id={`${id}-error`}
              className="text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={apply}
            >
              Apply time adjustment
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !selection.clock}
              focusableWhenDisabled
              onClick={() => {
                setMinutes("0");
                setZone("UTC");
                setError("");
                change({ ...selection, clock: undefined });
              }}
            >
              Reset recording time
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
