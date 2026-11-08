const SERVER_TIMESTAMP_WITH_TIMEZONE = /(?:z|[+-]\d{2}:?\d{2})$/i;

function parseServerTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.includes("T") && !SERVER_TIMESTAMP_WITH_TIMEZONE.test(trimmed) ? `${trimmed}Z` : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDashboardActivityOccurredAt(value: string, locale = "ru-RU", timeZone?: string): string {
  const date = parseServerTimestamp(value);
  if (!date) return "Время не указано";

  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.day}.${parts.month}.${parts.year}, ${parts.hour}:${parts.minute}`;
}
