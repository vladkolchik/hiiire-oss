export function formatUserTimeZoneLabel(date = new Date()): string {
  const referenceDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMinutes = -referenceDate.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const offset = `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  return timeZone ? `${timeZone}, ${offset}` : offset;
}
