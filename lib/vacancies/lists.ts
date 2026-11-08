import { z } from "zod";

export const VACANCY_LIST_MAX_TEXT_LENGTH = 2000;

export const VACANCY_LIST_TEXT_TOO_LONG_MESSAGE = `Поле не должно быть длиннее ${VACANCY_LIST_MAX_TEXT_LENGTH} символов.`;
export const VACANCY_LIST_EMPTY_ITEM_MESSAGE = "Пустые пункты не сохраняются. Удалите пустые строки и попробуйте снова.";
export const VACANCY_LIST_FIELD_DESCRIPTION = `Каждая строка — отдельный пункт. До ${VACANCY_LIST_MAX_TEXT_LENGTH} символов.`;

export function parseVacancyListText(text: string | undefined): string[] {
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function vacancyListTextSchema() {
  return z
    .string()
    .max(VACANCY_LIST_MAX_TEXT_LENGTH, VACANCY_LIST_TEXT_TOO_LONG_MESSAGE)
    .optional();
}

function getVacancyListApiTextLength(items: string[]): number {
  return items.join("\n").length;
}

export function vacancyListApiSchema() {
  return z
    .array(z.string().trim().min(1, VACANCY_LIST_EMPTY_ITEM_MESSAGE))
    .superRefine((items, ctx) => {
      if (getVacancyListApiTextLength(items) > VACANCY_LIST_MAX_TEXT_LENGTH) {
        ctx.addIssue({
          code: "custom",
          message: VACANCY_LIST_TEXT_TOO_LONG_MESSAGE,
        });
      }
    })
    .default([]);
}
