import { z } from "zod";

export const PHONE_MAX_LENGTH = 50;
export const PHONE_ALLOWED_CHARACTERS_MESSAGE =
  "Телефон может содержать только цифры, +, пробелы, скобки и дефисы";
export const PHONE_INCOMPLETE_MESSAGE = "Укажите полный номер телефона";

const phoneAllowedCharactersPattern = /^[0-9+()\-\s]+$/;
const disallowedPhoneCharactersPattern = /[^0-9+()\-\s]/g;

export function sanitizePhoneInput(value: string) {
  return value.replace(disallowedPhoneCharactersPattern, "").replace(/\s{2,}/g, " ").trimStart();
}

export function getPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function getPhoneValidationMessage(value: string, options?: { minDigits?: number }) {
  const phone = value.trim();
  if (!phone) return "Введите телефон";
  if (phone.length > PHONE_MAX_LENGTH) return `Телефон не должен быть длиннее ${PHONE_MAX_LENGTH} символов`;
  if (!phoneAllowedCharactersPattern.test(phone)) return PHONE_ALLOWED_CHARACTERS_MESSAGE;
  if (options?.minDigits && getPhoneDigits(phone).length < options.minDigits) return PHONE_INCOMPLETE_MESSAGE;
  return "";
}

export function createPhoneSchema(options?: { minDigits?: number }) {
  return z
    .string()
    .superRefine((value, ctx) => {
      const message = getPhoneValidationMessage(value, options);
      if (!message) return;

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
      });
    })
    .transform((value) => value.trim());
}
