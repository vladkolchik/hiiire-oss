import { z } from "zod";

import { readUserFacingApiErrorMessage, zodErrorToUserFacingIssues } from "../api/user-facing-errors.ts";

export const INTERVIEW_TYPE_VALUES = ["phone", "video", "in-person", "technical"] as const;
export const INTERVIEW_STATUS_VALUES = ["scheduled", "completed", "cancelled"] as const;
export const INTERVIEW_SYNC_STATUS_VALUES = ["not_connected", "pending", "synced", "failed"] as const;

const DURATION_MESSAGE = "Длительность должна быть от 5 до 480 минут";
const INVALID_DATE_MESSAGE = "Укажите дату и время собеседования";
const NOTE_LIMIT_MESSAGE = "Заметка не должна быть длиннее 2000 символов";
const EXPECTED_UPDATED_AT_MESSAGE = "Обновите календарь и попробуйте ещё раз";

const optionalTrimmedString = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const anyIsoDateTimeSchema = z
  .string()
  .trim()
  .min(1, INVALID_DATE_MESSAGE)
  .refine((value) => !Number.isNaN(Date.parse(value)), INVALID_DATE_MESSAGE);

const futureIsoDateTimeSchema = anyIsoDateTimeSchema.refine((value) => Date.parse(value) > Date.now(), "Выберите будущее время собеседования");

const expectedUpdatedAtSchema = z
  .string({ error: EXPECTED_UPDATED_AT_MESSAGE })
  .trim()
  .min(1, EXPECTED_UPDATED_AT_MESSAGE)
  .refine((value) => !Number.isNaN(Date.parse(value)), EXPECTED_UPDATED_AT_MESSAGE);

const meetingUrlSchema = z
  .string()
  .trim()
  .max(500, "Ссылка не должна быть длиннее 500 символов")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Введите корректную ссылку");

const interviewerIdsSchema = z
  .array(z.string().uuid("Выберите интервьюера"))
  .min(1, "Добавьте хотя бы одного интервьюера")
  .transform((ids) => Array.from(new Set(ids)));

const interviewTypeSchema = z.enum(INTERVIEW_TYPE_VALUES, {
  error: "Выберите тип собеседования",
});

const baseInterviewMutationSchema = z.object({
  scheduledAt: futureIsoDateTimeSchema,
  durationMinutes: z.number().int(DURATION_MESSAGE).min(5, DURATION_MESSAGE).max(480, DURATION_MESSAGE),
  type: interviewTypeSchema,
  interviewerIds: interviewerIdsSchema,
  meetingUrl: meetingUrlSchema,
  location: optionalTrimmedString(250, "Адрес не должен быть длиннее 250 символов"),
  notes: optionalTrimmedString(2000, NOTE_LIMIT_MESSAGE),
  allowConflicts: z.boolean().optional().default(false),
});

export const CreateInterviewBodySchema = baseInterviewMutationSchema.extend({
  candidateId: z.string().uuid("Выберите кандидата"),
  vacancyId: z.string().uuid("Выберите вакансию"),
});

export const UpdateInterviewBodySchema = baseInterviewMutationSchema.extend({
  candidateId: z.string().uuid("Выберите кандидата"),
  vacancyId: z.string().uuid("Выберите вакансию"),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const CancelInterviewBodySchema = z.object({
  cancelNote: optionalTrimmedString(2000, NOTE_LIMIT_MESSAGE),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const CompleteInterviewBodySchema = z.object({
  completionNote: optionalTrimmedString(2000, NOTE_LIMIT_MESSAGE),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export function mapInterviewValidationIssues(error: z.ZodError) {
  return zodErrorToUserFacingIssues(error, "Проверьте поля собеседования.");
}

export function readInterviewApiErrorMessage(json: unknown, fallback = "Не удалось выполнить действие с собеседованием") {
  return readUserFacingApiErrorMessage(json, fallback);
}
