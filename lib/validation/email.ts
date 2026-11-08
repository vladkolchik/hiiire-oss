import { z } from "zod";

export const EMAIL_INPUT_PATTERN = String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`;

export function isEmailLike(value: string) {
  return new RegExp(`^${EMAIL_INPUT_PATTERN}$`, "i").test(value.trim());
}

export function getEmailValidationMessage(value: string) {
  const email = value.trim();

  if (!email) return "Укажите email";
  if (/\s/.test(email)) return "Email не должен содержать пробелы";

  const atIndex = email.indexOf("@");
  if (atIndex === -1) return "Добавьте символ @ в адрес email";
  if (email.indexOf("@", atIndex + 1) !== -1) return "Укажите email в формате name@company.com";

  const [localPart, domain = ""] = email.split("@");
  if (!localPart || !domain) return "Укажите email в формате name@company.com";
  if (!domain.includes(".")) return "После символа @ укажите домен с точкой, например company.com";

  const domainParts = domain.split(".");
  if (domainParts.some((part) => !part.length)) {
    return "Укажите email в формате name@company.com";
  }

  return "";
}

export function applyEmailInputValidity(input: HTMLInputElement) {
  input.setCustomValidity(getEmailValidationMessage(input.value));
}

export function createEmailSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, "Укажите email")
    .max(maxLength, `Email не должен быть длиннее ${maxLength} символов`)
    .superRefine((value, ctx) => {
      const message = getEmailValidationMessage(value);

      if (!message) return;

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
      });
    });
}
