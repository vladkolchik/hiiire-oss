export type SafeLogFields = Record<string, string | number | boolean | null | undefined>;

export function logJson(level: "info" | "warn" | "error", event: string, fields: SafeLogFields = {}): void {
  const payload = {
    level,
    event,
    service: "telegram-relay",
    ...fields,
  };

  console.log(JSON.stringify(payload));
}
