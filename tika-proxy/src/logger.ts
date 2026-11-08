export type SafeFieldValue = string | number | boolean | null | undefined;
export type SafeFields = Record<string, SafeFieldValue>;
export type LogLevel = "info" | "warn" | "error";

function normalizeFields(fields: SafeFields): Record<string, string | number | boolean | null> {
  const normalized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

export function logJson(level: LogLevel, message: string, fields: SafeFields = {}): void {
  const line = JSON.stringify({
    level,
    message,
    ...normalizeFields(fields),
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}
