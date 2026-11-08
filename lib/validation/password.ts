import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 72;

const passwordAsciiWithoutWhitespacePattern = /^[\x21-\x7E]+$/;

export function getPasswordValidationMessage(value: string) {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Пароль должен быть не менее ${PASSWORD_MIN_LENGTH} символов`;
  }

  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Пароль не должен быть длиннее ${PASSWORD_MAX_LENGTH} символов`;
  }

  if (!passwordAsciiWithoutWhitespacePattern.test(value)) {
    return "Пароль может содержать только латинские буквы, цифры и знаки без пробелов";
  }

  return "";
}

export function createPasswordSchema() {
  return z.string().superRefine((value, ctx) => {
    const message = getPasswordValidationMessage(value);

    if (!message) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message,
    });
  });
}
