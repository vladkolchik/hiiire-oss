import { z } from "zod";

export type UserFacingIssue = {
  path: Array<string | number>;
  message: string;
};

const ApiErrorPayloadSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  issues: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])).default([]),
        message: z.string(),
      })
    )
    .optional(),
});

function cleanMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message.length > 0 ? message : null;
}

function isTechnicalMessage(message: string): boolean {
  const lower = message.toLowerCase();
  const upper = message.toUpperCase();
  return (
    /^[A-Z][A-Za-z0-9]*Error:/.test(message) ||
    /^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(upper) ||
    lower === "invalid_body" ||
    lower.startsWith("error:") ||
    lower.includes("too big:") ||
    lower.includes("too small:") ||
    lower.includes("expected string") ||
    lower.includes("invalid input") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes(" at ") ||
    lower.includes(".js:") ||
    lower.includes("provider") ||
    lower.includes("internal") ||
    lower.includes("password cannot be longer")
  );
}

export function zodErrorToUserFacingIssues(error: z.ZodError, fallback = "Проверьте поля формы."): UserFacingIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number"),
    message: isTechnicalMessage(issue.message) ? fallback : issue.message,
  }));
}

export function firstUserFacingIssueMessage(
  issues: readonly UserFacingIssue[] | null | undefined,
  fallback: string
): string {
  const message = issues
    ?.map((issue) => cleanMessage(issue.message))
    .find((item): item is string => item !== null && !isTechnicalMessage(item));
  return message ?? fallback;
}

export function readUserFacingApiErrorMessage(json: unknown, fallback: string): string {
  const parsed = ApiErrorPayloadSchema.safeParse(json);
  if (!parsed.success) return fallback;

  const message = cleanMessage(parsed.data.message);
  if (message && !isTechnicalMessage(message)) return message;

  return firstUserFacingIssueMessage(parsed.data.issues, fallback);
}
