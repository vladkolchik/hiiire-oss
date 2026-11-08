import { z } from "zod";

export type CompanyValidationIssue = {
  path: Array<string | number>;
  message: string;
};

const COMPANY_NAME_MIN_MESSAGE = "Название компании должно быть не короче 2 символов";
const COMPANY_NAME_MAX_MESSAGE = "Название компании не должно быть длиннее 120 символов";
const COMPANY_INVALID_MESSAGE = "Проверьте название компании.";

const OptionalNullableTrimmed = (max: number, message: string) =>
  z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v !== "string") return v;
      const t = v.trim();
      return t.length ? t : null;
    },
    z.string().max(max, message).nullable().optional()
  );

export const CompanyPatchSchema = z
  .object({
    name: z
      .preprocess(
        (v) => (typeof v === "string" ? v.trim() : v),
        z.string().min(2, COMPANY_NAME_MIN_MESSAGE).max(120, COMPANY_NAME_MAX_MESSAGE)
      )
      .optional(),
    industry: OptionalNullableTrimmed(80, "Индустрия не должна быть длиннее 80 символов"),
    size: OptionalNullableTrimmed(40, "Размер компании не должен быть длиннее 40 символов"),
    description: OptionalNullableTrimmed(2000, "Описание компании не должно быть длиннее 2000 символов"),
    website: OptionalNullableTrimmed(200, "Сайт компании не должен быть длиннее 200 символов"),
    logoUrl: OptionalNullableTrimmed(500, "Ссылка на логотип не должна быть длиннее 500 символов"),
  })
  .strict();

function hasIssueForFields(issue: CompanyValidationIssue, fields: string[]): boolean {
  return issue.path.some((segment) => typeof segment === "string" && fields.includes(segment));
}

function friendlyCompanyIssueMessage(issue: Pick<CompanyValidationIssue, "path" | "message">): string {
  if (hasIssueForFields(issue, ["name"])) {
    const raw = issue.message.toLowerCase();
    if (raw.includes("120") || raw.includes("too big")) return COMPANY_NAME_MAX_MESSAGE;
    if (raw.includes("2") || raw.includes("too small")) return COMPANY_NAME_MIN_MESSAGE;
    return COMPANY_INVALID_MESSAGE;
  }

  return issue.message && !/invalid|expected|too big|too small/i.test(issue.message)
    ? issue.message
    : "Проверьте данные компании.";
}

export function mapCompanyValidationIssues(error: z.ZodError): CompanyValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number"),
    message: friendlyCompanyIssueMessage({
      path: issue.path.filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number"),
      message: issue.message,
    }),
  }));
}

export function getCompanyValidationMessage(
  issues: CompanyValidationIssue[] | null | undefined,
  fallback = COMPANY_INVALID_MESSAGE
): string {
  if (!issues || issues.length === 0) return fallback;

  const nameIssue = issues.find((issue) => hasIssueForFields(issue, ["name"]));
  return friendlyCompanyIssueMessage(nameIssue ?? issues[0]) ?? fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIssues(value: unknown): CompanyValidationIssue[] | null {
  if (!Array.isArray(value)) return null;

  return value
    .map((issue) => {
      if (!isRecord(issue)) return null;
      const path = Array.isArray(issue.path)
        ? issue.path.filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number")
        : [];
      const message = typeof issue.message === "string" ? issue.message : "";
      return { path, message };
    })
    .filter((issue): issue is CompanyValidationIssue => issue !== null);
}

export function readCompanyApiErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;

  const issuesMessage = getCompanyValidationMessage(readIssues(payload.issues), "");
  if (issuesMessage) return issuesMessage;

  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  if (payload.error === "INVALID_BODY") return COMPANY_INVALID_MESSAGE;
  if (payload.error === "FORBIDDEN") return "Изменять данные компании может только администратор компании.";

  return fallback;
}
