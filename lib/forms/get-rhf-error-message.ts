export function getRhfErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.trim().length > 0 ? msg : null;
}
