import { Popover } from "@base-ui/react/popover";
import { DayPicker } from "@daypicker/react";
import { isCalendarDate, isClockTime } from "@kairn/shared/journey-form";
import IMask from "imask/holder";
import "imask/masked/pattern";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
} from "lucide-react";
import {
  useCallback,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAndroidBack } from "@/hooks/use-android-back";
import { Button } from "./button";
import { Field, FieldLabel } from "./field";
import { Input } from "./input";
import { NativeSelect } from "./native-select";

type ScheduleProps = {
  kind: "date" | "time";
  id?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
};

const dateParts = [
  { name: "Year", format: "YYYY", min: 1, max: 9999 },
  { name: "Month", format: "MM", min: 1, max: 12 },
  { name: "Day", format: "DD", min: 1, max: 31 },
] as const;
const timeParts = [
  { name: "Hour", format: "HH", min: 0, max: 23 },
  { name: "Minute", format: "MM", min: 0, max: 59 },
] as const;

function partError(
  part: (typeof dateParts | typeof timeParts)[number],
  text: string,
  values: string[],
) {
  let maximum: number = part.max;
  if (
    part.name === "Day" &&
    Number(values[1]) >= 1 &&
    Number(values[1]) <= 12
  ) {
    // An unfinished year still allows February 29 until the year is known.
    const last = new Date(0);
    const year =
      values[0]?.length === 4 && Number(values[0]) > 0
        ? Number(values[0])
        : 2000;
    last.setUTCFullYear(year, Number(values[1]), 0);
    maximum = last.getUTCDate();
  }
  const width = part.format.length;
  if (
    text.length === width &&
    /^\d+$/.test(text) &&
    Number(text) >= part.min &&
    Number(text) <= maximum
  )
    return undefined;
  if (part.name === "Year") return "Enter a four-digit year from 0001 to 9999.";
  return `Enter ${part.name === "Hour" ? "an" : "a"} ${part.name.toLowerCase()} from ${padded(part.min)} to ${padded(maximum)}.`;
}

function padded(value: number) {
  return String(value).padStart(2, "0");
}

// Calendar days are independent of both the browser's and the journey's time zones.
function calendarToday() {
  const now = new Date();
  return new Date(
    `${now.getFullYear()}-${padded(now.getMonth() + 1)}-${padded(now.getDate())}T12:00:00Z`,
  );
}

const dayName = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "full",
  timeZone: "UTC",
});

const shortWeekday = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  timeZone: "UTC",
});

const monthName = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  timeZone: "UTC",
});
const months = Array.from({ length: 12 }, (_, i) =>
  monthName.format(Date.UTC(2000, i, 1)),
);

function monthStart(year: number, month: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 1);
  return date;
}

function Calendar({
  value,
  choose,
}: {
  value: string;
  choose: (value: string) => void;
}) {
  const selected = isCalendarDate(value)
    ? new Date(`${value}T12:00:00Z`)
    : undefined;
  const today = calendarToday();
  const [view, setView] = useState(selected ?? today);
  const [typedYear, setTypedYear] = useState<string | null>(null);
  const yearSelect = useRef<HTMLSelectElement>(null);
  const yearInput = useRef<HTMLInputElement>(null);
  const yearErrorId = useId();
  const daySelectId = useId();
  const editingYear = typedYear !== null;
  useLayoutEffect(() => {
    if (editingYear) {
      yearInput.current?.focus();
      yearInput.current?.select();
    }
  }, [editingYear]);
  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const nextMonth = monthStart(year, month + 1);
  nextMonth.setUTCDate(0);
  const daysInMonth = nextMonth.getUTCDate();
  const firstYear = Math.max(1, year - 10);
  const lastYear = Math.min(9999, year + 10);
  const validYear =
    typedYear !== null && /^\d{1,4}$/.test(typedYear) && Number(typedYear) > 0;
  const invalidYear = Boolean(typedYear) && !validYear;
  function browse(next: Date) {
    setView(next);
    setTypedYear(null);
  }
  function applyYear() {
    if (!validYear) return;
    browse(monthStart(Number(typedYear), month));
    yearSelect.current?.focus();
  }
  return (
    <>
      <div className="fold-calendar-nav">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Previous month"
          disabled={year === 1 && month === 0}
          onClick={() => browse(monthStart(year, month - 1))}
        >
          <ChevronLeftIcon aria-hidden="true" className="rtl:rotate-180" />
        </Button>
        <div className="fold-period-fields">
          <NativeSelect
            aria-label="Month"
            value={month}
            onChange={(e) => browse(monthStart(year, Number(e.target.value)))}
          >
            {months.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Year"
            ref={yearSelect}
            value={editingYear ? "type" : year}
            onChange={(e) => {
              if (e.target.value === "type") setTypedYear(String(year));
              else browse(monthStart(Number(e.target.value), month));
            }}
          >
            {Array.from(
              { length: lastYear - firstYear + 1 },
              (_, i) => firstYear + i,
            ).map((y) => (
              <option key={y} value={y}>
                {String(y).padStart(4, "0")}
              </option>
            ))}
            <option value="type">Type year…</option>
          </NativeSelect>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Next month"
          disabled={year === 9999 && month === 11}
          onClick={() => browse(monthStart(year, month + 1))}
        >
          <ChevronRightIcon aria-hidden="true" className="rtl:rotate-180" />
        </Button>
      </div>
      {editingYear && (
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Input
              ref={yearInput}
              aria-label="Enter year"
              placeholder="YYYY"
              inputMode="numeric"
              aria-invalid={invalidYear || undefined}
              aria-describedby={invalidYear ? yearErrorId : undefined}
              value={typedYear}
              onChange={(e) => setTypedYear(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyYear();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!validYear}
              onClick={applyYear}
            >
              Go
            </Button>
          </div>
          {invalidYear && (
            <p id={yearErrorId} className="text-sm text-destructive">
              Enter a year from 1 to 9999.
            </p>
          )}
        </div>
      )}
      <div className="fold-compact-day">
        <Field>
          <FieldLabel htmlFor={daySelectId}>Day</FieldLabel>
          <NativeSelect
            id={daySelectId}
            disabled={editingYear}
            value={view.getUTCDate()}
            onChange={(event) => {
              const next = monthStart(year, month);
              next.setUTCDate(Number(event.target.value));
              setView(next);
            }}
          >
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const date = monthStart(year, month);
              date.setUTCDate(day);
              return (
                <option key={day} value={day}>
                  {day} · {shortWeekday.format(date)}
                </option>
              );
            })}
          </NativeSelect>
        </Field>
        <Button
          type="button"
          disabled={editingYear}
          onClick={() => choose(view.toISOString().slice(0, 10))}
        >
          Use date
        </Button>
      </div>
      <DayPicker
        className="fold-calendar"
        disabled={editingYear}
        mode="single"
        required
        timeZone="UTC"
        today={today}
        month={view}
        onMonthChange={browse}
        hideNavigation
        classNames={{ month_caption: "sr-only" }}
        selected={selected}
        startMonth={new Date("0001-01-01T12:00:00Z")}
        endMonth={new Date("9999-12-01T12:00:00Z")}
        labels={{
          labelDayButton: (day, modifiers) =>
            [
              dayName.format(day),
              modifiers.today && "Today",
              modifiers.selected && "Selected",
            ]
              .filter(Boolean)
              .join(", "),
        }}
        weekStartsOn={1}
        onSelect={(date) => choose(date.toISOString().slice(0, 10))}
      />
    </>
  );
}

function TimeColumn({
  label,
  count,
  value,
  onChange,
}: {
  label: string;
  count: number;
  value: string;
  onChange: (next: string) => void;
}) {
  const group = useId();
  const rail = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = rail.current;
    const selected = list?.querySelector("input:checked")?.parentElement;
    if (list && selected)
      list.scrollTop =
        selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
  }, []);
  return (
    <fieldset className="grid min-w-0 gap-1">
      <legend className="mb-1 text-sm font-semibold text-muted-foreground">
        {label}
      </legend>
      <div ref={rail} className="fold-time-rail" tabIndex={-1}>
        {Array.from({ length: count }, (_, index) => {
          const part = padded(index);
          return (
            <label key={part} className="fold-time-option">
              <input
                className="sr-only"
                type="radio"
                name={group}
                tabIndex={value === part ? 0 : -1}
                checked={value === part}
                onChange={() => onChange(part)}
              />
              {part}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ClockPicker({
  value,
  choose,
}: {
  value: string;
  choose: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => {
    if (isClockTime(value)) return value;
    const now = new Date();
    return `${padded(now.getHours())}:${padded(now.getMinutes())}`;
  });
  const [hour, minute] = draft.split(":");
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <TimeColumn
          label="Hour"
          count={24}
          value={hour}
          onChange={(next) => setDraft(`${next}:${minute}`)}
        />
        <TimeColumn
          label="Minute"
          count={60}
          value={minute}
          onChange={(next) => setDraft(`${hour}:${next}`)}
        />
      </div>
      <Button type="button" onClick={() => choose(draft)}>
        Use {draft}
      </Button>
    </>
  );
}

const dateMask = {
  mask: "year-`month-`day",
  blocks: {
    year: { mask: "0000", placeholderChar: "Y" },
    month: { mask: "00", placeholderChar: "M" },
    day: { mask: "00", placeholderChar: "D" },
  },
};
const timeMask = {
  mask: "hour:`minute",
  blocks: {
    hour: { mask: "00", placeholderChar: "H" },
    minute: { mask: "00", placeholderChar: "M" },
  },
};

function scheduleMask(input: HTMLInputElement, kind: ScheduleProps["kind"]) {
  return IMask(input, {
    ...(kind === "date" ? dateMask : timeMask),
    lazy: false,
    overwrite: true,
    eager: "append",
  });
}

// Keep the display template out of drafts, including a completely empty optional end.
function draftValue(display: string) {
  return /\d/.test(display) ? display.replace(/[YMDH]/g, "") : "";
}

export function ScheduleInput({
  kind,
  label,
  value,
  onValueChange,
  id,
  required,
  disabled,
  error,
}: ScheduleProps) {
  const [open, setOpen] = useState(false);
  const back = useAndroidBack({
    open: open && !disabled,
    onOpenChange: setOpen,
  });
  const [touched, setTouched] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const mask = useRef<ReturnType<typeof scheduleMask> | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const isDate = kind === "date";
  const Icon = isDate ? CalendarDaysIcon : Clock3Icon;
  const parts = isDate ? dateParts : timeParts;
  const separator = isDate ? "-" : ":";
  const format = parts.map((part) => part.format).join(separator);
  const values = value.split(separator);
  const issues = parts.map((part, i) =>
    partError(part, values[i] ?? "", values),
  );
  const invalidPart = issues.findIndex(Boolean);
  const partMessage =
    value &&
    issues.find(
      (issue, i) =>
        issue &&
        (touched || error || values[i]?.length === parts[i].format.length),
    );
  const message = disabled ? undefined : partMessage || error;
  const errorText = message ? (
    <p id={`${inputId}-error`} className="mt-1 text-sm text-destructive">
      {message}
    </p>
  ) : null;
  const currentDraft = useEffectEvent(() => value);
  const acceptInput = useEffectEvent((display: string) => {
    const next = draftValue(display);
    if (next !== value) onValueChange(next);
  });

  useLayoutEffect(() => {
    if (!input.current) return;
    const editor = scheduleMask(input.current, kind);
    editor.value = currentDraft();
    mask.current = editor;
    editor.on("accept", () => acceptInput(editor.value));
    return () => {
      editor.destroy();
      mask.current = null;
    };
  }, [kind]);

  useLayoutEffect(() => {
    const editor = mask.current;
    if (editor && draftValue(editor.value) !== value) editor.value = value;
  }, [value]);

  const validityMessage =
    (value || required ? issues[invalidPart] : "") || error || "";
  useLayoutEffect(() => {
    input.current?.setCustomValidity(validityMessage);
  }, [validityMessage]);

  const invalidFormat = error ? parts[invalidPart]?.format : undefined;
  const selectInvalidPart = useCallback(() => {
    if (!invalidFormat) return;
    const start = format.indexOf(invalidFormat);
    input.current?.setSelectionRange(start, start + invalidFormat.length);
  }, [format, invalidFormat]);

  useLayoutEffect(() => {
    if (input.current === document.activeElement) selectInvalidPart();
  }, [selectInvalidPart]);

  function alignEmptyTail(field: HTMLInputElement) {
    const firstEmpty = field.value.search(/[YMDH][YMDH:-]*$/);
    if (
      firstEmpty >= 0 &&
      field.selectionStart === field.selectionEnd &&
      (field.selectionStart ?? 0) > firstEmpty
    ) {
      field.setSelectionRange(firstEmpty, firstEmpty);
    }
  }

  function choose(next: string) {
    onValueChange(next);
    setTouched(false);
    setOpen(false);
  }
  return (
    <Popover.Root open={open && !disabled} {...back}>
      <Field
        data-invalid={Boolean(message) || undefined}
        className="@container/schedule min-w-0"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
          <span
            id={`${inputId}-format`}
            className="tabular-nums text-muted-foreground"
          >
            {format}
            {!isDate && <span className="sr-only">, 24-hour time</span>}
          </span>
        </div>
        <div ref={anchor} className="fold-schedule-control relative">
          <Input
            ref={input}
            id={inputId}
            className="pe-[calc(var(--spacing-control)+0.25rem)] tabular-nums"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            required={required}
            disabled={disabled}
            aria-invalid={Boolean(message) || undefined}
            aria-describedby={`${inputId}-format${message ? ` ${inputId}-error` : ""}`}
            onFocus={(event) => {
              alignEmptyTail(event.currentTarget);
              selectInvalidPart();
            }}
            onClick={(event) => alignEmptyTail(event.currentTarget)}
            onKeyDownCapture={(event) => {
              // WebKit can restore a caret past the template after focus.
              if (/^\d$/.test(event.key)) alignEmptyTail(event.currentTarget);
            }}
            onBlur={() => {
              setTouched(true);
              if (value) {
                const normalized = parts
                  .map((part, i) => {
                    const digits = values[i] ?? "";
                    return digits.length === 1 && part.format.length === 2
                      ? digits.padStart(2, "0")
                      : digits;
                  })
                  .join(separator);
                if (normalized !== value) onValueChange(normalized);
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text/plain").trim();
              const complete = isDate
                ? /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/
                : /^(?:\d{4}|\d{2}:\d{2})$/;
              if (!complete.test(text)) {
                if (
                  !/^\d+$/.test(text) ||
                  text.length > format.length - parts.length + 1
                )
                  event.preventDefault();
                return;
              }
              if (!mask.current) return;
              event.preventDefault();
              mask.current.value = text;
              mask.current.cursorPos = format.length;
            }}
          />
          <Popover.Trigger
            disabled={disabled}
            aria-label={`Choose ${label.toLowerCase()}`}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-0 top-1/2 -translate-y-1/2"
              />
            }
          >
            <Icon aria-hidden="true" />
            <span className="fold-picker-label">
              Choose {label.toLowerCase()}
            </span>
          </Popover.Trigger>
        </div>
        {/* On submit, the form focuses the first invalid field. Its description
            supplies the error without queuing messages from the other fields. */}
        <div aria-live="polite">{error ? null : errorText}</div>
        {error && errorText}
      </Field>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          align="start"
          sideOffset={5}
          collisionPadding={8}
          className="isolate z-50"
        >
          <Popover.Popup
            ref={popup}
            className="fold-picker"
            data-slot="schedule-popup"
            initialFocus={() => {
              const controls = popup.current?.querySelectorAll<HTMLElement>(
                isDate
                  ? '.fold-compact-day select, button.rdp-day_button[tabindex="0"]'
                  : "input:checked",
              );
              return (
                Array.from(controls ?? []).find(
                  (control) => control.getClientRects().length > 0,
                ) ?? true
              );
            }}
          >
            <Popover.Title className="fold-picker-title">{label}</Popover.Title>
            {open &&
              (isDate ? (
                <Calendar value={value} choose={choose} />
              ) : (
                <ClockPicker value={value} choose={choose} />
              ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
