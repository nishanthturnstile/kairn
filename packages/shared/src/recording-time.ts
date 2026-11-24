export function recordingLocalMinute(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (key: string) => parts.find(({ type }) => type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
const utc = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const recordingFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatRecordedInstant(instant: string, zone = "UTC") {
  let formatter = utc;
  if (zone !== "UTC") {
    const prior = recordingFormatters.get(zone);
    if (prior) formatter = prior;
    else {
      try {
        formatter = new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: zone,
        });
      } catch {
        // A saved zone might be newer than this client's time zone data.
      }
      if (recordingFormatters.size >= 32) recordingFormatters.clear();
      recordingFormatters.set(zone, formatter);
    }
  }
  return `${formatter.format(new Date(instant))} ${formatter === utc ? "UTC" : zone}`;
}
