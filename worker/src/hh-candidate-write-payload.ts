import type { CandidateDesiredSalarySource } from "./shared/candidate-desired-salary.js";

export type HhCandidateWritePayloadInput = {
  applied_at: string;
  avatar_url: string | null;
  candidate_id: string | null;
  contactKey: string;
  created_at: string;
  created_by: string;
  desired_salary_amount?: number | null;
  desired_salary_currency?: string | null;
  desired_salary_source?: CandidateDesiredSalarySource | null;
  desired_salary_text?: string | null;
  hh_auto_survey_text: string | null;
  hh_source_fingerprint: string;
  hhru_resume_id: string;
  name: string;
  position: string;
  resume_text: string | null;
  source: "hh.ru" | "manual" | "referral" | "other";
  status: "new" | "reviewing" | "security-check" | "interview-scheduled" | "interviewed" | "offer" | "hired" | "rejected";
  updated_at: string;
  vacancy_id: string;
};

export function hasHhDesiredSalaryPatch(row: HhCandidateWritePayloadInput): boolean {
  return Object.prototype.hasOwnProperty.call(row, "desired_salary_text");
}

export function buildHhCandidateWritePayload(row: HhCandidateWritePayloadInput) {
  return {
    applied_at: row.applied_at,
    avatar_url: row.avatar_url,
    created_at: row.created_at,
    created_by: row.created_by,
    ...(hasHhDesiredSalaryPatch(row)
      ? {
          desired_salary_text: row.desired_salary_text ?? null,
          desired_salary_amount: row.desired_salary_amount ?? null,
          desired_salary_currency: row.desired_salary_currency ?? null,
          desired_salary_source: row.desired_salary_source ?? null,
        }
      : {}),
    hh_auto_survey_text: row.hh_auto_survey_text,
    hh_source_fingerprint: row.hh_source_fingerprint,
    hhru_resume_id: row.hhru_resume_id,
    name: row.name,
    position: row.position,
    resume_text: row.resume_text,
    source: row.source,
    status: row.status,
    updated_at: row.updated_at,
    vacancy_id: row.vacancy_id,
  };
}

export function splitHhCandidateRowsByDesiredSalaryPatch(rows: HhCandidateWritePayloadInput[]): {
  withDesiredSalaryPatch: HhCandidateWritePayloadInput[];
  withoutDesiredSalaryPatch: HhCandidateWritePayloadInput[];
} {
  const withDesiredSalaryPatch: HhCandidateWritePayloadInput[] = [];
  const withoutDesiredSalaryPatch: HhCandidateWritePayloadInput[] = [];

  for (const row of rows) {
    if (hasHhDesiredSalaryPatch(row)) {
      withDesiredSalaryPatch.push(row);
    } else {
      withoutDesiredSalaryPatch.push(row);
    }
  }

  return { withDesiredSalaryPatch, withoutDesiredSalaryPatch };
}
