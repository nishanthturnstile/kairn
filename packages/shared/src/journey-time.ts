const journeyDateFormat = new Intl.DateTimeFormat("en-IN", {
  calendar: "gregory",
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const journeyTimeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatJourneyLocalMinute(local: string) {
  // Give Intl a fixed reference zone so it displays the recorded wall time.
  const displayDate = new Date(`${local}Z`);
  return {
    date: journeyDateFormat.format(displayDate),
    time: journeyTimeFormat
      .format(displayDate)
      .replace(/\s+/g, " ")
      .toLowerCase(),
  };
}
