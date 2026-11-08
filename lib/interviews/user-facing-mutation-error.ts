function cleanMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message ? message : null;
}

function isSafeRussianUserFacingMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /[А-Яа-яЁё]/.test(message) &&
    !/[A-Z][A-Za-z0-9]*Error:/.test(message) &&
    !/[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+/.test(message) &&
    !lower.includes("failed to fetch") &&
    !lower.includes("typeerror") &&
    !lower.includes("networkerror") &&
    !lower.includes("undefined") &&
    !lower.includes(".js:") &&
    !lower.includes(" at ")
  );
}

export function readInterviewMutationErrorDescription(error: unknown, fallback: string): string {
  const message = cleanMessage(error instanceof Error ? error.message : null);
  return message && isSafeRussianUserFacingMessage(message) ? message : fallback;
}
