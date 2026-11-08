import { NextResponse } from "next/server.js";

import { getConfirmedServerUser } from "../auth/server-email-confirmation.ts";

type Role = "admin" | "hr" | "recruiter";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; response: NextResponse };

export type CompanyContext = {
  userId: string;
  email: string | null;
  companyId: string;
  role: Role;
};

function jsonError(error: string, status: number): Err {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

export async function requireCompanyContext(
  // Intentionally `any` to avoid deep/infinite type instantiation from Supabase generics.
  // Guards are runtime-oriented and validate everything we use anyway.
  supabase: any
): Promise<Ok<CompanyContext> | Err> {
  const authRes = await getConfirmedServerUser(supabase);
  if (!authRes.ok) {
    return jsonError(authRes.reason === "pending_email" ? "EMAIL_NOT_CONFIRMED" : "UNAUTHORIZED", authRes.reason === "pending_email" ? 403 : 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id,role")
    .eq("id", authRes.user.id)
    .maybeSingle();

  if (profileError) return jsonError("PROFILE_LOOKUP_FAILED", 500);
  if (!profile?.company_id) return jsonError("NO_COMPANY", 403);

  return {
    ok: true,
    data: {
      userId: authRes.user.id,
      email: typeof authRes.user.email === "string" && authRes.user.email.trim() ? authRes.user.email.trim() : null,
      companyId: profile.company_id,
      role: profile.role,
    },
  };
}

export async function requireVacancyAccess(
  admin: any,
  ctx: CompanyContext,
  vacancyId: string
): Promise<Ok<{ vacancy: { id: string; companyId: string; createdById: string } }> | Err> {
  const { data: vac, error } = await admin
    .from("vacancies")
    .select("id,company_id,created_by")
    .eq("id", vacancyId)
    .maybeSingle();

  if (error) return jsonError("VACANCY_LOOKUP_FAILED", 500);
  if (!vac || vac.company_id !== ctx.companyId) return jsonError("NOT_FOUND", 404);

  if (ctx.role !== "admin" && vac.created_by !== ctx.userId) return jsonError("FORBIDDEN", 403);

  return { ok: true, data: { vacancy: { id: vac.id, companyId: vac.company_id, createdById: vac.created_by } } };
}

export async function requireCandidateAccess(
  admin: any,
  ctx: CompanyContext,
  candidateId: string
): Promise<Ok<{ candidate: { id: string; vacancyId: string; createdById: string; companyId: string } }> | Err> {
  const { data: cand, error: candErr } = await admin
    .from("candidates")
    .select("id,vacancy_id,created_by")
    .eq("id", candidateId)
    .maybeSingle();

  if (candErr) return jsonError("CANDIDATE_LOOKUP_FAILED", 500);
  if (!cand) return jsonError("NOT_FOUND", 404);

  const { data: vac, error: vacErr } = await admin.from("vacancies").select("id,company_id").eq("id", cand.vacancy_id).maybeSingle();
  if (vacErr) return jsonError("VACANCY_LOOKUP_FAILED", 500);
  if (!vac || vac.company_id !== ctx.companyId) return jsonError("FORBIDDEN", 403);

  if (ctx.role !== "admin" && cand.created_by !== ctx.userId) return jsonError("FORBIDDEN", 403);

  return {
    ok: true,
    data: { candidate: { id: cand.id, vacancyId: cand.vacancy_id, createdById: cand.created_by, companyId: vac.company_id } },
  };
}

export async function requireJobAiAccess(
  admin: any,
  ctx: CompanyContext,
  jobId: string
): Promise<
  | Ok<{
      job: {
        id: string;
        companyId: string;
        requestedById: string | null;
        status: string;
        attempt: number;
        maxAttempts: number;
        lastError: string | null;
        candidateId: string;
        createdAt: string;
        updatedAt: string;
        finishedAt: string | null;
      };
    }>
  | Err
> {
  const { data: job, error } = await admin
    .from("jobs_ai")
    .select("id,company_id,requested_by,status,attempt,max_attempts,last_error,candidate_id,created_at,updated_at,finished_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) return jsonError("JOB_LOOKUP_FAILED", 500);
  if (!job || job.company_id !== ctx.companyId) return jsonError("NOT_FOUND", 404);

  if (ctx.role !== "admin" && job.requested_by !== ctx.userId) return jsonError("FORBIDDEN", 403);

  return {
    ok: true,
    data: {
      job: {
        id: job.id,
        companyId: job.company_id,
        requestedById: job.requested_by,
        status: job.status,
        attempt: job.attempt,
        maxAttempts: job.max_attempts,
        lastError: job.last_error,
        candidateId: job.candidate_id,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        finishedAt: job.finished_at,
      },
    },
  };
}
