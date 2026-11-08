import { NextResponse } from "next/server";

import type { CompanyContext } from "@/lib/access/company-guards";
import { requireCandidateAccess, requireVacancyAccess } from "@/lib/access/company-guards";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; response: NextResponse };

const ERROR_MESSAGES: Record<string, string> = {
  CANDIDATE_VACANCY_MISMATCH: "Кандидат не относится к выбранной вакансии.",
  NO_INTERVIEWERS: "Добавьте хотя бы одного интервьюера.",
  INTERVIEWER_LOOKUP_FAILED: "Не удалось проверить интервьюеров.",
  INTERVIEWER_NOT_FOUND: "Выберите интервьюеров из команды компании.",
  VACANCY_LOOKUP_FAILED: "Не удалось проверить вакансию.",
  VACANCY_NOT_SCHEDULABLE: "Собеседование можно назначить только для активной или приостановленной вакансии.",
  FORBIDDEN: "Недостаточно прав для этого действия.",
  NOT_FOUND: "Собеседование не найдено.",
};

function jsonError(error: string, status: number): Err {
  return {
    ok: false,
    response: NextResponse.json({ error, message: ERROR_MESSAGES[error] }, { status }),
  };
}

export type InterviewAccessRecord = {
  id: string;
  companyId: string;
  candidateId: string;
  vacancyId: string;
  status: "scheduled" | "completed" | "cancelled";
  interviewerIds: string[];
  createdById: string;
  updatedAt: string;
};

export type InterviewReadAccessLevel = "manage" | "interviewer_only";

type InterviewMutationAccessInput = {
  candidateId: string;
  vacancyId: string;
  interviewerIds: string[];
};

type InterviewMutationAccessData = {
  candidate: { id: string; vacancyId: string; companyId: string };
  vacancy: { id: string; companyId: string; status: string };
  interviewers: Array<{ id: string; name: string; email: string }>;
};

export async function requireCompanyInterviewers(
  admin: any,
  ctx: CompanyContext,
  interviewerIds: string[]
): Promise<Ok<{ interviewers: Array<{ id: string; name: string; email: string }> }> | Err> {
  const uniqueIds = Array.from(new Set(interviewerIds));
  if (uniqueIds.length === 0) return jsonError("NO_INTERVIEWERS", 400);

  const { data, error } = await admin
    .from("profiles")
    .select("id,name,email")
    .eq("company_id", ctx.companyId)
    .in("id", uniqueIds);

  if (error) return jsonError("INTERVIEWER_LOOKUP_FAILED", 500);
  if ((data ?? []).length !== uniqueIds.length) return jsonError("INTERVIEWER_NOT_FOUND", 400);

  return { ok: true, data: { interviewers: data ?? [] } };
}

export async function requireInterviewCreateAccess(
  admin: any,
  ctx: CompanyContext,
  input: InterviewMutationAccessInput
): Promise<Ok<InterviewMutationAccessData> | Err> {
  return requireInterviewMutationAccess(admin, ctx, input);
}

export async function requireInterviewMutationAccess(
  admin: any,
  ctx: CompanyContext,
  input: InterviewMutationAccessInput
): Promise<Ok<InterviewMutationAccessData> | Err> {
  const candRes = await requireCandidateAccess(admin, ctx, input.candidateId);
  if (!candRes.ok) return candRes;

  const vacRes = await requireVacancyAccess(admin, ctx, input.vacancyId);
  if (!vacRes.ok) return vacRes;

  const { data: vacancy, error: vacancyError } = await admin
    .from("vacancies")
    .select("id,status")
    .eq("id", vacRes.data.vacancy.id)
    .maybeSingle();

  if (vacancyError) return jsonError("VACANCY_LOOKUP_FAILED", 500);
  if (!vacancy) return jsonError("NOT_FOUND", 404);
  if (vacancy.status !== "active" && vacancy.status !== "paused") return jsonError("VACANCY_NOT_SCHEDULABLE", 400);

  const candidate = candRes.data.candidate;
  const accessibleVacancy = vacRes.data.vacancy;
  if (candidate.vacancyId !== accessibleVacancy.id) return jsonError("CANDIDATE_VACANCY_MISMATCH", 400);

  const interviewersRes = await requireCompanyInterviewers(admin, ctx, input.interviewerIds);
  if (!interviewersRes.ok) return interviewersRes;

  return {
    ok: true,
    data: {
      candidate: { id: candidate.id, vacancyId: candidate.vacancyId, companyId: candidate.companyId },
      vacancy: { id: accessibleVacancy.id, companyId: accessibleVacancy.companyId, status: vacancy.status },
      interviewers: interviewersRes.data.interviewers,
    },
  };
}

export async function requireInterviewManageAccess(
  admin: any,
  ctx: CompanyContext,
  interviewId: string
): Promise<Ok<{ interview: InterviewAccessRecord }> | Err> {
  const { data, error } = await admin
    .from("interviews")
    .select("id,company_id,candidate_id,vacancy_id,status,interviewer_ids,created_by,updated_at")
    .eq("id", interviewId)
    .maybeSingle();

  if (error) return jsonError("INTERVIEW_LOOKUP_FAILED", 500);
  if (!data || data.company_id !== ctx.companyId) return jsonError("NOT_FOUND", 404);

  const candRes = await requireCandidateAccess(admin, ctx, data.candidate_id);
  if (!candRes.ok) return candRes.response.status === 403 ? jsonError("FORBIDDEN", 403) : candRes;

  const vacRes = await requireVacancyAccess(admin, ctx, data.vacancy_id);
  if (!vacRes.ok) return vacRes.response.status === 403 ? jsonError("FORBIDDEN", 403) : vacRes;

  const candidate = candRes.data.candidate;
  const vacancy = vacRes.data.vacancy;
  if (candidate.vacancyId !== vacancy.id) return jsonError("CANDIDATE_VACANCY_MISMATCH", 400);

  return {
    ok: true,
    data: {
      interview: {
        id: data.id,
        companyId: data.company_id,
        candidateId: data.candidate_id,
        vacancyId: data.vacancy_id,
        status: data.status,
        interviewerIds: data.interviewer_ids,
        createdById: data.created_by,
        updatedAt: data.updated_at,
      },
    },
  };
}

export async function requireInterviewReadAccess(
  admin: any,
  ctx: CompanyContext,
  interview: InterviewAccessRecord
): Promise<InterviewReadAccessLevel | null> {
  if (ctx.role === "admin") return "manage";

  const candRes = await requireCandidateAccess(admin, ctx, interview.candidateId);
  const vacRes = await requireVacancyAccess(admin, ctx, interview.vacancyId);
  if (candRes.ok && vacRes.ok) return "manage";

  if (interview.interviewerIds.includes(ctx.userId)) return "interviewer_only";

  return null;
}
