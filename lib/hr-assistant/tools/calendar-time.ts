export const ASSISTANT_CALENDAR_TIME_PRESETS = ["today", "tomorrow", "yesterday", "this_week", "next_week", "local_date"] as const;

export type AssistantCalendarTimePreset = (typeof ASSISTANT_CALENDAR_TIME_PRESETS)[number];

export type ResolveAssistantCalendarTimeInput = {
  preset: AssistantCalendarTimePreset;
  timeZone?: string | null;
  referenceIso?: string | null;
  localDate?: string | null;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeAssistantCalendarTimeZone(timeZone: string | null | undefined): string {
  const candidate = typeof timeZone === "string" && timeZone.trim() ? timeZone.trim() : "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function parseReferenceDate(referenceIso: string | null | undefined): Date {
  const parsed = referenceIso ? new Date(referenceIso) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function toLocalDate(parts: Pick<ZonedParts, "year" | "month" | "day">): string {
  return [parts.year, String(parts.month).padStart(2, "0"), String(parts.day).padStart(2, "0")].join("-");
}

function parseLocalDate(value: string): Pick<ZonedParts, "year" | "month" | "day"> {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function isValidLocalDate(value: string | null | undefined): value is string {
  if (!value || !LOCAL_DATE_PATTERN.test(value)) return false;

  const { year, month, day } = parseLocalDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function addLocalDays(localDate: string, days: number): string {
  const { year, month, day } = parseLocalDate(localDate);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return toLocalDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function localDayOfWeek(localDate: string): number {
  const { year, month, day } = parseLocalDate(localDate);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

function zonedLocalDateTimeToUtcIso(
  localDate: string,
  timeZone: string,
  time: { hour: number; minute: number; second: number } = { hour: 0, minute: 0, second: 0 }
): string {
  const { year, month, day } = parseLocalDate(localDate);
  const wantedAsUtc = Date.UTC(year, month - 1, day, time.hour, time.minute, time.second);
  let guess = wantedAsUtc;

  for (let index = 0; index < 3; index += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess -= actualAsUtc - wantedAsUtc;
  }

  return new Date(guess).toISOString();
}

function resolveRangeStart(input: ResolveAssistantCalendarTimeInput, referenceLocalDate: string): string {
  switch (input.preset) {
    case "today":
      return referenceLocalDate;
    case "tomorrow":
      return addLocalDays(referenceLocalDate, 1);
    case "yesterday":
      return addLocalDays(referenceLocalDate, -1);
    case "this_week":
      return addLocalDays(referenceLocalDate, 1 - localDayOfWeek(referenceLocalDate));
    case "next_week":
      return addLocalDays(referenceLocalDate, 8 - localDayOfWeek(referenceLocalDate));
    case "local_date":
      return input.localDate ?? referenceLocalDate;
  }
}

function resolveRangeEnd(preset: AssistantCalendarTimePreset, startLocalDate: string): string {
  if (preset === "this_week" || preset === "next_week") return addLocalDays(startLocalDate, 7);
  return addLocalDays(startLocalDate, 1);
}

function buildRangeLabel(preset: AssistantCalendarTimePreset, startLocalDate: string, endLocalDate: string): string {
  if (preset === "this_week") return `Текущая неделя: ${startLocalDate} - ${addLocalDays(endLocalDate, -1)}`;
  if (preset === "next_week") return `Следующая неделя: ${startLocalDate} - ${addLocalDays(endLocalDate, -1)}`;
  return `День пользователя: ${startLocalDate}`;
}

export function resolveAssistantCalendarTime(input: ResolveAssistantCalendarTimeInput) {
  if (input.preset === "local_date" && !isValidLocalDate(input.localDate)) {
    return {
      ok: false as const,
      error: {
        code: "invalid_input",
        message: "Укажите корректную дату в формате ГГГГ-ММ-ДД.",
        retryable: false,
      },
    };
  }

  const timeZone = normalizeAssistantCalendarTimeZone(input.timeZone);
  const referenceDate = parseReferenceDate(input.referenceIso);
  const referenceParts = getZonedParts(referenceDate, timeZone);
  const referenceLocalDate = toLocalDate(referenceParts);
  const startLocalDate = resolveRangeStart(input, referenceLocalDate);
  const endLocalDate = resolveRangeEnd(input.preset, startLocalDate);
  const fromIso = zonedLocalDateTimeToUtcIso(startLocalDate, timeZone);
  const toIso = zonedLocalDateTimeToUtcIso(endLocalDate, timeZone);

  return {
    ok: true as const,
    preset: input.preset,
    timeZone,
    reference: {
      nowIso: referenceDate.toISOString(),
      localDate: referenceLocalDate,
      localTime: [String(referenceParts.hour).padStart(2, "0"), String(referenceParts.minute).padStart(2, "0")].join(":"),
    },
    range: {
      fromIso,
      toIso,
      localStart: `${startLocalDate}T00:00:00`,
      localEnd: `${endLocalDate}T00:00:00`,
      label: buildRangeLabel(input.preset, startLocalDate, endLocalDate),
    },
    calendarQuery: {
      fromIso,
      toIso,
    },
  };
}
