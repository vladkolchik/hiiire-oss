import { z } from "zod";

import { readUserFacingApiErrorMessage, zodErrorToUserFacingIssues, type UserFacingIssue } from "../api/user-facing-errors.ts";
import {
  FEEDBACK_ADMIN_CLASS_VALUES,
  FEEDBACK_ADMIN_NOTE_MAX_LENGTH,
  FEEDBACK_EXTERNAL_URL_MAX_LENGTH,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SECTION_VALUES,
  FEEDBACK_SOURCE_URL_MAX_LENGTH,
  FEEDBACK_STATUS_VALUES,
  FEEDBACK_TYPE_VALUES,
  type FeedbackSection,
} from "./constants.ts";

const FEEDBACK_INVALID_MESSAGE = "Проверьте сообщение и попробуйте ещё раз.";

function optionalTrimmedString(max: number, message: string) {
  return z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().max(max, message).nullable().optional()
  );
}

function optionalHttpUrl(max: number) {
  return z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z
      .string()
      .max(max, "Ссылка слишком длинная")
      .regex(/^https?:\/\//, "Укажите ссылку, которая начинается с http:// или https://")
      .nullable()
      .optional()
  );
}

export function normalizeFeedbackSections(input: unknown): FeedbackSection[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(FEEDBACK_SECTION_VALUES);
  const normalized: FeedbackSection[] = [];

  for (const item of input) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!allowed.has(value)) continue;
    if (!normalized.includes(value as FeedbackSection)) normalized.push(value as FeedbackSection);
  }

  return normalized;
}

export function normalizeFeedbackSourceUrl(input: unknown, appOrigin: string): string | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > FEEDBACK_SOURCE_URL_MAX_LENGTH) return null;

  try {
    const expectedOrigin = new URL(appOrigin).origin;
    const url = new URL(trimmed, expectedOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.origin !== expectedOrigin) return null;

    const normalized = url.toString();
    return normalized.length <= FEEDBACK_SOURCE_URL_MAX_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}

export const FeedbackSubmissionSchema = z
  .object({
    type: z.enum(FEEDBACK_TYPE_VALUES, { message: "Выберите тип обращения" }),
    sections: z.preprocess(
      normalizeFeedbackSections,
      z
        .array(z.enum(FEEDBACK_SECTION_VALUES))
        .min(1, "Выберите хотя бы один раздел")
        .max(10, "Выберите не больше 10 разделов")
    ),
    message: z
      .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().min(1, "Напишите сообщение"))
      .pipe(z.string().max(FEEDBACK_MESSAGE_MAX_LENGTH, "Сообщение не должно быть длиннее 10000 символов")),
    sourceUrl: optionalTrimmedString(FEEDBACK_SOURCE_URL_MAX_LENGTH, "Ссылка на страницу слишком длинная"),
  })
  .strict();

export const FeedbackAdminUpdateSchema = z
  .object({
    feedbackId: z.string().uuid("Не удалось определить обращение"),
    status: z.enum(FEEDBACK_STATUS_VALUES, { message: "Выберите корректный статус" }),
    adminClass: z.enum(FEEDBACK_ADMIN_CLASS_VALUES, { message: "Выберите корректную классификацию" }).nullable().optional(),
    adminNote: optionalTrimmedString(FEEDBACK_ADMIN_NOTE_MAX_LENGTH, "Заметка не должна быть длиннее 5000 символов"),
    externalUrl: optionalHttpUrl(FEEDBACK_EXTERNAL_URL_MAX_LENGTH),
  })
  .strict();

export type FeedbackSubmissionInput = z.infer<typeof FeedbackSubmissionSchema>;
export type FeedbackAdminUpdateInput = z.infer<typeof FeedbackAdminUpdateSchema>;

export function mapFeedbackValidationIssues(error: z.ZodError): UserFacingIssue[] {
  return zodErrorToUserFacingIssues(error, FEEDBACK_INVALID_MESSAGE);
}

export function readFeedbackApiErrorMessage(payload: unknown, fallback = "Не удалось отправить сообщение"): string {
  return readUserFacingApiErrorMessage(payload, fallback) === fallback && payload && typeof payload === "object"
    ? readUserFacingApiErrorMessage(payload, FEEDBACK_INVALID_MESSAGE)
    : readUserFacingApiErrorMessage(payload, fallback);
}
