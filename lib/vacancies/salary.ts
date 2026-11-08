import { z } from "zod";

export const VACANCY_SALARY_MAX_DIGITS = 15;
export const VACANCY_SALARY_MAX_INPUT_LENGTH =
  VACANCY_SALARY_MAX_DIGITS + Math.floor((VACANCY_SALARY_MAX_DIGITS - 1) / 3);
export const VACANCY_SALARY_MAX_VALUE = 999_999_999_999_999;
export const VACANCY_SALARY_MAX_DIGITS_MESSAGE = "Зарплата не может быть больше 15 цифр";
export const VACANCY_SALARY_INTEGER_MESSAGE = "Введите целую сумму без копеек";
export const VACANCY_SALARY_NUMBER_MESSAGE = "Введите сумму цифрами";

const VACANCY_SALARY_MIN_NEGATIVE_MESSAGE = "Зарплата не может быть отрицательной";
const VACANCY_SALARY_RANGE_MESSAGE = "Сумма «от» должна быть меньше или равна сумме «до».";

type VacancySalaryFields = {
  salaryMin?: string | number | null;
  salaryMax?: string | number | null;
};

function normalizeSalaryString(value: string): string {
  return value.replace(/[\s\u00a0]+/g, "").trim();
}

function isPlainIntegerSalary(value: string): boolean {
  return /^-?\d+$/.test(value);
}

function isSeparatedIntegerSalary(value: string): boolean {
  return /^-?\d{1,3}([.,]\d{3})+$/.test(value);
}

function isFractionalSalary(value: string): boolean {
  return /^-?\d+[.,]\d+$/.test(value);
}

function hasNumericInput(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function hasFilledInput(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

export function parseVacancySalaryValue(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;

  const normalizedValue = normalizeSalaryString(value);
  if (!normalizedValue) return Number.NaN;

  if (isSeparatedIntegerSalary(normalizedValue)) {
    return Number(normalizedValue.replace(/[.,]/g, ""));
  }

  if (isPlainIntegerSalary(normalizedValue)) {
    return Number(normalizedValue);
  }

  if (isFractionalSalary(normalizedValue)) {
    return Number(normalizedValue.replace(",", "."));
  }

  return Number(normalizedValue);
}

export function formatVacancySalaryInput(value: string | number | null | undefined): string {
  const salary = parseVacancySalaryValue(value);
  if (!Number.isFinite(salary) || !Number.isInteger(salary) || salary < 0) {
    return typeof value === "string" ? value : "";
  }

  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0, useGrouping: true })
    .format(salary)
    .replace(/\u00a0/g, " ");
}

export function limitVacancySalaryInput(value: string): { value: string; exceeded: boolean } {
  let digits = 0;
  let exceeded = false;
  let limited = "";

  for (const char of value) {
    if (/\d/.test(char)) {
      if (digits >= VACANCY_SALARY_MAX_DIGITS) {
        exceeded = true;
        continue;
      }

      digits += 1;
    }

    limited += char;
  }

  return { value: limited, exceeded };
}

export function addVacancySalaryIssues(values: VacancySalaryFields, ctx: z.RefinementCtx): void {
  const min = parseVacancySalaryValue(values.salaryMin);
  const max = parseVacancySalaryValue(values.salaryMax);
  const hasMinInput = hasFilledInput(values.salaryMin);
  const hasMaxInput = hasFilledInput(values.salaryMax);
  const hasMin = hasNumericInput(values.salaryMin) && Number.isFinite(min);
  const hasMax = hasNumericInput(values.salaryMax) && Number.isFinite(max);

  if (hasMinInput && !Number.isFinite(min)) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_NUMBER_MESSAGE, path: ["salaryMin"] });
  }
  if (hasMaxInput && !Number.isFinite(max)) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_NUMBER_MESSAGE, path: ["salaryMax"] });
  }
  if (hasMin && !Number.isInteger(min)) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_INTEGER_MESSAGE, path: ["salaryMin"] });
  }
  if (hasMax && !Number.isInteger(max)) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_INTEGER_MESSAGE, path: ["salaryMax"] });
  }

  const hasIntegerMin = hasMin && Number.isInteger(min);
  const hasIntegerMax = hasMax && Number.isInteger(max);

  if (hasIntegerMin && min < 0) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_MIN_NEGATIVE_MESSAGE, path: ["salaryMin"] });
  }
  if (hasIntegerMax && max < 0) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_MIN_NEGATIVE_MESSAGE, path: ["salaryMax"] });
  }
  if (hasIntegerMin && min > VACANCY_SALARY_MAX_VALUE) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_MAX_DIGITS_MESSAGE, path: ["salaryMin"] });
  }
  if (hasIntegerMax && max > VACANCY_SALARY_MAX_VALUE) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_MAX_DIGITS_MESSAGE, path: ["salaryMax"] });
  }
  if (hasIntegerMin && hasIntegerMax && min > max) {
    ctx.addIssue({ code: "custom", message: VACANCY_SALARY_RANGE_MESSAGE, path: ["salaryMin"] });
  }
}
