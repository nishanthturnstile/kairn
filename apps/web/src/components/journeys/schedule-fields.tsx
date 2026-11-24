import type {
  FieldErrors,
  JourneyDraft,
  JourneyField,
} from "@kairn/shared/journey-form";
import type { ComponentProps } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ScheduleInput } from "@/components/ui/schedule-input";

export function JourneyInput({
  field,
  label,
  error,
  onEdit,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & {
  type?: "text" | "date" | "time";
  field: JourneyField;
  label: string;
  error?: string;
  onEdit: (field: JourneyField, value: string) => void;
}) {
  const id = `journey-${field}`;
  if (props.type === "date" || props.type === "time") {
    return (
      <ScheduleInput
        kind={props.type}
        id={id}
        label={label}
        value={String(props.value ?? "")}
        disabled={props.disabled}
        required={props.required}
        error={error}
        onValueChange={(next) => onEdit(field, next)}
      />
    );
  }
  return (
    <Field className="min-w-0" data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onEdit(field, event.currentTarget.value)}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Field>
  );
}

export function ScheduleFields({
  part,
  draft,
  errors,
  choices,
  update,
  disabled,
}: {
  part: "start" | "end";
  draft: JourneyDraft;
  errors: FieldErrors;
  choices?: [string, string];
  update: (field: JourneyField, value: string) => void;
  disabled: boolean;
}) {
  const date = `${part}Date` as const;
  const time = `${part}Time` as const;
  const offset = `${part}Offset` as const;
  const label = part === "start" ? "Start" : "End";
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">
        {part === "start" ? "Start" : "End (optional)"}
      </legend>
      <FieldGroup className="@min-[32rem]/journey-form:grid-cols-2">
        <JourneyInput
          field={date}
          label={`${label} date`}
          type="date"
          value={draft[date]}
          error={errors[date]}
          onEdit={update}
          disabled={disabled}
          required={part === "start"}
        />
        <JourneyInput
          field={time}
          label={`${label} time`}
          type="time"
          value={draft[time]}
          error={errors[time]}
          onEdit={update}
          disabled={disabled}
          required={part === "start"}
        />
        {(choices || draft[offset]) && (
          <Field
            data-invalid={errors[offset] ? true : undefined}
            className="@min-[32rem]/journey-form:col-span-2"
          >
            <FieldLabel htmlFor={`journey-${offset}`}>
              {label} time occurrence
            </FieldLabel>
            <NativeSelect
              id={`journey-${offset}`}
              value={draft[offset]}
              onChange={(event) => update(offset, event.currentTarget.value)}
              disabled={disabled}
              aria-invalid={errors[offset] ? true : undefined}
              aria-describedby={
                errors[offset] ? `journey-${offset}-error` : undefined
              }
            >
              <option value="">Choose an occurrence</option>
              {choices ? (
                choices.map((choice, index) => (
                  <option value={choice} key={choice}>
                    {index === 0 ? "First" : "Second"} occurrence (UTC{choice})
                  </option>
                ))
              ) : (
                <option value={draft[offset]}>UTC{draft[offset]}</option>
              )}
            </NativeSelect>
            {errors[offset] && (
              <p
                className="text-sm text-destructive"
                id={`journey-${offset}-error`}
              >
                {errors[offset]}
              </p>
            )}
          </Field>
        )}
      </FieldGroup>
    </fieldset>
  );
}
