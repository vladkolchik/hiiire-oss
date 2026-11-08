import { z } from "zod";

import { VACANCY_SALARY_INTEGER_MESSAGE, VACANCY_SALARY_NUMBER_MESSAGE } from "./salary.ts";

export type VacancyValidationIssue = {
  path: Array<string | number>;
  message: string;
};

type VacancyValidationIssueLike = {
  path: readonly unknown[];
  message: string;
  code?: string;
};

const VACANCY_DESCRIPTION_MIN_MESSAGE = "Описание вакансии должно быть не короче 20 символов";

const VACANCY_FIELD_FALLBACK_MESSAGES: Record<string, string> = {
  title: "Введите название вакансии",
  description: VACANCY_DESCRIPTION_MIN_MESSAGE,
  requirements: "Проверьте требования к вакансии",
  responsibilities: "Проверьте обязанности вакансии",
  requirementsText: "Проверьте требования к вакансии",
  responsibilitiesText: "Проверьте обязанности вакансии",
  salaryMin: VACANCY_SALARY_NUMBER_MESSAGE,
  salaryMax: VACANCY_SALARY_NUMBER_MESSAGE,
  salaryCurrency: "Выберите валюту из списка",
  location: "Укажите локацию",
  employmentType: "Выберите тип занятости",
  experienceLevel: "Выберите уровень опыта",
  status: "Выберите статус вакансии",
  department: "Укажите отдел",
  hiringManager: "Укажите ответственного",
  headcount: "Укажите план найма",
  workSchedule: "Укажите график",
  employmentForms: "Выберите формат работы",
  employmentForm: "Выберите формат работы",
  salaryPeriod: "Выберите период оплаты",
  salaryTax: "Выберите формат выплаты",
  bonus: "Опишите бонусы",
  benefits: "Опишите условия",
  probationMonths: "Испытательный срок: 0–24",
  travelPercent: "Командировки: 0–100%",
  mandatoryRequirements: "Опишите обязательные требования",
  hiringProcess: "Опишите этапы отбора",
};

const VACANCY_NUMERIC_RANGE_MESSAGES: Record<string, string> = {
  headcount: "План найма: 1–1000",
  probationMonths: "Испытательный срок: 0–24",
  travelPercent: "Командировки: 0–100%",
};

function hasIssueForFields(issue: VacancyValidationIssue, fields: string[]): boolean {
  return issue.path.some((segment) => typeof segment === "string" && fields.includes(segment));
}

function getIssueField(issue: VacancyValidationIssueLike): string | null {
  return issue.path.find((segment): segment is string => typeof segment === "string") ?? null;
}

function isTechnicalVacancyMessage(message: string): boolean {
  const lower = message.toLowerCase();
  const upper = message.toUpperCase();
  return (
    /^[A-Z][A-Za-z0-9]*Error:/.test(message) ||
    /^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(upper) ||
    lower.startsWith("error:") ||
    lower.includes("too big:") ||
    lower.includes("too small:") ||
    lower.includes("expected string") ||
    lower.includes("expected number") ||
    lower.includes("invalid input") ||
    lower.includes("invalid option")
  );
}

function getVacancyIssueFallback(issue: VacancyValidationIssueLike): string | null {
  const field = getIssueField(issue);
  if (!field) return null;

  if ((field === "salaryMin" || field === "salaryMax") && issue.message.toLowerCase().includes("expected int")) {
    return VACANCY_SALARY_INTEGER_MESSAGE;
  }

  if ("code" in issue && (issue.code === "too_big" || issue.code === "too_small")) {
    return VACANCY_NUMERIC_RANGE_MESSAGES[field] ?? VACANCY_FIELD_FALLBACK_MESSAGES[field] ?? null;
  }

  return VACANCY_FIELD_FALLBACK_MESSAGES[field] ?? null;
}

function getUserFacingVacancyIssueMessage(issue: VacancyValidationIssueLike, fallback = "Некорректные данные вакансии"): string {
  const message = issue.message.trim();
  if (message && !isTechnicalVacancyMessage(message)) return message;
  return getVacancyIssueFallback(issue) ?? fallback;
}

export function mapVacancyValidationIssues(error: z.ZodError): VacancyValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number"),
    message: getUserFacingVacancyIssueMessage(issue),
  }));
}

export function getVacancyValidationMessage(
  issues: VacancyValidationIssue[] | null | undefined,
  fallback = "Некорректные данные вакансии"
): string {
  if (!issues || issues.length === 0) return fallback;

  const primaryIssue =
    issues.find((issue) => hasIssueForFields(issue, ["title"])) ??
    issues.find((issue) => hasIssueForFields(issue, ["description"])) ??
    issues.find((issue) => hasIssueForFields(issue, ["salaryMin", "salaryMax"])) ??
    issues.find((issue) =>
      hasIssueForFields(issue, ["requirements", "responsibilities", "requirementsText", "responsibilitiesText"])
    ) ??
    issues[0];

  return primaryIssue ? getUserFacingVacancyIssueMessage(primaryIssue, fallback) : fallback;
}
