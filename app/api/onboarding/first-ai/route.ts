import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { isAiAllowed, loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import {
  deriveFirstAiOnboardingProgress,
  type FirstAiOnboardingCandidateSummary,
  type FirstAiOnboardingPersistedState,
  type FirstAiOnboardingVacancySummary,
} from "@/lib/onboarding/first-ai";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PatchSchema = z.object({
  action: z.enum(["start_manual", "start_hh", "dismiss", "open_result", "acknowledge_result"]),
  candidateId: z.string().uuid().optional(),
});

type FirstAiContext = {
  userId: string;
  companyId: string;
  role: string;
};

type StateRow = {
  completed_at: string | null;
  dismissed_at: string | null;
  result_opened_at: string | null;
  result_acknowledged_at: string | null;
  hh_oauth_error_at: string | null;
  hh_started_at: string | null;
  started_path: "manual" | "hh" | null;
};

type VacancyRow = {
  id: string;
  created_at: string;
  hhru_vacancy_id: string | null;
  created_by: string | null;
};

type CandidateRow = {
  id: string;
  created_at: string;
  vacancy_id: string;
  source: "manual" | "hh.ru" | "referral" | "other" | null;
  match_percentage: number | null;
  ai_analyses: Array<{ candidate_id: string }> | null;
  created_by: string | null;
};

type JobRow = {
  candidate_id: string;
  status: "queued" | "processing" | "done" | "failed" | "canceled";
  updated_at: string;
  requested_by: string | null;
};

type CreditRow = {
  balance: number | null;
  reserved: number | null;
};

const VACANCY_SCOPE_CHUNK_SIZE = 100;
const FIRST_AI_BILLING_SETTINGS_HREF = "/dashboard/settings?tab=plan";

function emptyState(): FirstAiOnboardingPersistedState {
  return {
    completedAt: null,
    dismissedAt: null,
    resultOpenedAt: null,
    resultAcknowledgedAt: null,
    hhOauthErrorAt: null,
    hhStartedAt: null,
    startedPath: null,
  };
}

function mapState(row: StateRow | null): FirstAiOnboardingPersistedState {
  if (!row) return emptyState();
  return {
    completedAt: row.completed_at,
    dismissedAt: row.dismissed_at,
    resultOpenedAt: row.result_opened_at,
    resultAcknowledgedAt: row.result_acknowledged_at,
    hhOauthErrorAt: row.hh_oauth_error_at,
    hhStartedAt: row.hh_started_at,
    startedPath: row.started_path,
  };
}

function mapVacancies(rows: VacancyRow[]): FirstAiOnboardingVacancySummary[] {
  return rows.map((row) => ({
    id: row.id,
    isHh: Boolean(row.hhru_vacancy_id),
    createdAt: row.created_at,
  }));
}

function latestJobsByCandidate(rows: JobRow[]): Map<string, JobRow> {
  const byCandidate = new Map<string, JobRow>();
  for (const row of rows) {
    const prev = byCandidate.get(row.candidate_id);
    if (!prev || row.updated_at > prev.updated_at) byCandidate.set(row.candidate_id, row);
  }
  return byCandidate;
}

function mapCandidates(rows: CandidateRow[], jobs: Map<string, JobRow>): FirstAiOnboardingCandidateSummary[] {
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    matchPercentage: row.match_percentage,
    hasAiAnalysis: Array.isArray(row.ai_analyses) && row.ai_analyses.length > 0,
    latestJobStatus: jobs.get(row.id)?.status ?? null,
    createdAt: row.created_at,
  }));
}

function mergeCandidateRows(priority: CandidateRow | null, recentRows: CandidateRow[]): CandidateRow[] {
  const byId = new Map<string, CandidateRow>();
  if (priority) byId.set(priority.id, priority);
  for (const row of recentRows) byId.set(row.id, row);
  return [...byId.values()];
}

function mergeVacancyRows(priority: VacancyRow | null, recentRows: VacancyRow[]): VacancyRow[] {
  const byId = new Map<string, VacancyRow>();
  if (priority) byId.set(priority.id, priority);
  for (const row of recentRows) byId.set(row.id, row);
  return [...byId.values()];
}

function applyUserScope(query: any, ctx: FirstAiContext, ownerColumn: "created_by" | "requested_by") {
  return ctx.role === "admin" ? query : query.eq(ownerColumn, ctx.userId);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function readFirstAiCompanyVacancyIds(admin: any, ctx: Pick<FirstAiContext, "companyId">): Promise<string[]> {
  const pageSize = 500;
  const ids: string[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("vacancies")
      .select("id")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error("VACANCY_SCOPE_LOOKUP_FAILED");
    const rows = (data ?? []) as Array<{ id: string }>;
    ids.push(...rows.map((row) => row.id));
    if (rows.length < pageSize) return ids;
  }
}

function applyCandidateScope(query: any, ctx: FirstAiContext, vacancyIdsChunk: string[]) {
  query = query.in("vacancy_id", vacancyIdsChunk);
  return ctx.role === "admin" ? query : query.eq("created_by", ctx.userId);
}

async function readFirstAiRecentCandidates(admin: any, ctx: FirstAiContext, vacancyIds: string[]): Promise<{ data: CandidateRow[]; error: unknown | null }> {
  const rows: CandidateRow[] = [];
  for (const vacancyChunk of chunks(vacancyIds, VACANCY_SCOPE_CHUNK_SIZE)) {
    let query = admin
      .from("candidates")
      .select("id,created_at,vacancy_id,source,match_percentage,created_by,ai_analyses(candidate_id)")
      .order("created_at", { ascending: false })
      .limit(20);

    query = applyCandidateScope(query, ctx, vacancyChunk);
    const { data, error } = await query;
    if (error) return { data: [], error };
    rows.push(...((data ?? []) as CandidateRow[]));
  }

  return {
    data: mergeCandidateRows(null, rows).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20),
    error: null,
  };
}

async function readFirstAiBillingSummary(admin: any, ctx: Pick<FirstAiContext, "companyId" | "role">) {
  const canManageBilling = ctx.role === "admin";
  const [planSnapshot, creditsRes] = await Promise.all([
    loadCompanyPlanSnapshot(admin, ctx.companyId),
    admin.from("company_credits").select("balance,reserved").eq("company_id", ctx.companyId).maybeSingle(),
  ]);

  if (creditsRes.error) {
    return {
      canStartAi: false,
      canManageBilling,
      blockedReason: canManageBilling
        ? "Не удалось проверить тариф и AI-кредиты. Откройте настройки оплаты."
        : "Не удалось проверить доступ к AI-анализу. Обратитесь к администратору.",
    };
  }

  if (!isAiAllowed(planSnapshot)) {
    return {
      canStartAi: false,
      canManageBilling,
      blockedReason: canManageBilling
        ? "AI-анализ недоступен на текущем тарифе. Проверьте тариф и оплату."
        : "AI-анализ недоступен на текущем тарифе. Обратитесь к администратору.",
    };
  }

  const credits = creditsRes.data as CreditRow | null;
  const availableCredits = Number(credits?.balance ?? 0) - Number(credits?.reserved ?? 0);
  if (availableCredits <= 0) {
    return {
      canStartAi: false,
      canManageBilling,
      blockedReason: canManageBilling ? "Пополните AI-кредиты, чтобы запустить анализ." : "AI-кредиты закончились. Обратитесь к администратору.",
    };
  }

  return { canStartAi: true, canManageBilling, blockedReason: null };
}

async function readFirstAiAccessibleResultCandidate(admin: any, ctx: FirstAiContext, vacancyIds: string[]): Promise<CandidateRow | null> {
  if (vacancyIds.length === 0) return null;

  const rows: CandidateRow[] = [];
  for (const vacancyChunk of chunks(vacancyIds, VACANCY_SCOPE_CHUNK_SIZE)) {
    let scoreQuery = admin
      .from("candidates")
      .select("id,created_at,vacancy_id,source,match_percentage,created_by,ai_analyses(candidate_id)")
      .not("match_percentage", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    scoreQuery = applyCandidateScope(scoreQuery, ctx, vacancyChunk);

    let analysisQuery = admin
      .from("candidates")
      .select("id,created_at,vacancy_id,source,match_percentage,created_by,ai_analyses!inner(candidate_id)")
      .order("created_at", { ascending: false })
      .limit(1);
    analysisQuery = applyCandidateScope(analysisQuery, ctx, vacancyChunk);

    const [scoreRes, analysisRes] = await Promise.all([scoreQuery.maybeSingle(), analysisQuery.maybeSingle()]);
    if (scoreRes.error || analysisRes.error) throw new Error("RESULT_LOOKUP_FAILED");
    if (scoreRes.data) rows.push(scoreRes.data as CandidateRow);
    if (analysisRes.data) rows.push(analysisRes.data as CandidateRow);
  }

  return mergeCandidateRows(null, rows).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

async function readFirstAiAccessibleVacancy(admin: any, ctx: FirstAiContext): Promise<VacancyRow | null> {
  let query = admin
    .from("vacancies")
    .select("id,created_at,hhru_vacancy_id,created_by")
    .eq("company_id", ctx.companyId)
    .order("created_at", { ascending: false })
    .limit(1);

  query = applyUserScope(query, ctx, "created_by");
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("VACANCY_LOOKUP_FAILED");
  return (data as VacancyRow | null) ?? null;
}

async function readFirstAiAccessibleCandidate(admin: any, ctx: FirstAiContext, vacancyIds: string[]): Promise<CandidateRow | null> {
  if (vacancyIds.length === 0) return null;

  const rows: CandidateRow[] = [];
  for (const vacancyChunk of chunks(vacancyIds, VACANCY_SCOPE_CHUNK_SIZE)) {
    let query = admin
      .from("candidates")
      .select("id,created_at,vacancy_id,source,match_percentage,created_by,ai_analyses(candidate_id)")
      .order("created_at", { ascending: false })
      .limit(1);

    query = applyCandidateScope(query, ctx, vacancyChunk);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error("CANDIDATES_LOOKUP_FAILED");
    if (data) rows.push(data as CandidateRow);
  }

  return mergeCandidateRows(null, rows).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

async function readFirstAiAccessibleJobCandidate(admin: any, ctx: FirstAiContext, vacancyIds: string[]): Promise<CandidateRow | null> {
  if (vacancyIds.length === 0) return null;

  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    let jobQuery = admin
      .from("jobs_ai")
      .select("candidate_id,status,updated_at,requested_by")
      .eq("company_id", ctx.companyId)
      .in("status", ["queued", "processing", "done", "failed"])
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    jobQuery = applyUserScope(jobQuery, ctx, "requested_by");
    const { data: jobs, error: jobsErr } = await jobQuery;
    if (jobsErr) throw new Error("JOBS_LOOKUP_FAILED");

    const rows = (jobs ?? []) as JobRow[];
    const candidateIds = Array.from(new Set(rows.map((job) => job.candidate_id)));
    if (candidateIds.length === 0) return null;

    const candidateRows: CandidateRow[] = [];
    for (const vacancyChunk of chunks(vacancyIds, VACANCY_SCOPE_CHUNK_SIZE)) {
      let candidateQuery = admin
        .from("candidates")
        .select("id,created_at,vacancy_id,source,match_percentage,created_by,ai_analyses(candidate_id)")
        .in("id", candidateIds);

      candidateQuery = applyCandidateScope(candidateQuery, ctx, vacancyChunk);
      const { data: candidates, error: candidatesErr } = await candidateQuery;
      if (candidatesErr) throw new Error("CANDIDATES_LOOKUP_FAILED");
      candidateRows.push(...((candidates ?? []) as CandidateRow[]));
    }

    const byId = new Map(candidateRows.map((candidate) => [candidate.id, candidate]));
    const accessible = candidateIds.map((id) => byId.get(id)).find((candidate): candidate is CandidateRow => Boolean(candidate));
    if (accessible) return accessible;
    if (rows.length < pageSize) return null;
  }
}

async function readLatestJobsForCandidateIds(admin: any, ctx: FirstAiContext, candidateIds: string[]): Promise<JobRow[]> {
  if (candidateIds.length === 0) return [];

  let query = admin
    .from("jobs_ai")
    .select("candidate_id,status,updated_at,requested_by")
    .eq("company_id", ctx.companyId)
    .in("candidate_id", candidateIds)
    .order("updated_at", { ascending: false });

  query = applyUserScope(query, ctx, "requested_by");
  const { data, error } = await query;
  if (error) throw new Error("JOBS_LOOKUP_FAILED");
  return (data ?? []) as JobRow[];
}

async function applyFirstAiOnboardingAction(
  admin: any,
  input: { userId: string; action: "start_manual" | "start_hh" | "dismiss" | "open_result" | "acknowledge_result"; nowIso: string },
): Promise<{ ok: true } | { ok: false }> {
  const startPatch =
    input.action === "start_manual"
      ? { user_id: input.userId, started_path: "manual" as const, updated_at: input.nowIso }
      : input.action === "start_hh"
        ? { user_id: input.userId, started_path: "hh" as const, hh_started_at: input.nowIso, hh_oauth_error_at: null, updated_at: input.nowIso }
        : null;

  if (startPatch) {
    const { error } = await admin.from("first_ai_onboarding_states").upsert(startPatch, { onConflict: "user_id" });
    return error ? { ok: false } : { ok: true };
  }

  const { data: existing, error: lookupErr } = await admin
    .from("first_ai_onboarding_states")
    .select("completed_at,dismissed_at,result_opened_at,result_acknowledged_at")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (lookupErr) return { ok: false };
  if (existing?.completed_at || existing?.dismissed_at) return { ok: true };

  if (input.action === "open_result") {
    const { error } = await admin.rpc("record_first_ai_onboarding_open_result", {
      p_user_id: input.userId,
      p_now: input.nowIso,
    });
    return error ? { ok: false } : { ok: true };
  }

  if (input.action === "acknowledge_result") {
    const { error } = await admin.rpc("record_first_ai_onboarding_acknowledge_result", {
      p_user_id: input.userId,
      p_now: input.nowIso,
    });
    return error ? { ok: false } : { ok: true };
  }

  const patch: Record<string, string> = { user_id: input.userId, updated_at: input.nowIso };
  if (input.action === "dismiss") patch.dismissed_at = input.nowIso;
  const { error } = await admin.from("first_ai_onboarding_states").upsert(patch, { onConflict: "user_id" });
  if (!error) return { ok: true };

  const { data: afterRace, error: afterRaceErr } = await admin
    .from("first_ai_onboarding_states")
    .select("completed_at,dismissed_at,result_opened_at,result_acknowledged_at")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!afterRaceErr && (afterRace?.completed_at || afterRace?.dismissed_at)) return { ok: true };
  return { ok: false };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;
    const companyVacancyIds = await readFirstAiCompanyVacancyIds(admin, ctx);

    let vacanciesQuery = admin.from("vacancies").select("id,created_at,hhru_vacancy_id,created_by").eq("company_id", ctx.companyId);
    vacanciesQuery = applyUserScope(vacanciesQuery, ctx, "created_by");

    const [stateRes, vacanciesRes, candidatesRes, resultCandidate, vacancyRow, anyCandidate, jobCandidate, hhRes, billing] = await Promise.all([
      admin
        .from("first_ai_onboarding_states")
        .select("completed_at,dismissed_at,hh_oauth_error_at,hh_started_at,result_opened_at,result_acknowledged_at,started_path")
        .eq("user_id", ctx.userId)
        .maybeSingle(),
      vacanciesQuery.order("created_at", { ascending: false }).limit(20),
      readFirstAiRecentCandidates(admin, ctx, companyVacancyIds),
      readFirstAiAccessibleResultCandidate(admin, ctx, companyVacancyIds),
      readFirstAiAccessibleVacancy(admin, ctx),
      readFirstAiAccessibleCandidate(admin, ctx, companyVacancyIds),
      readFirstAiAccessibleJobCandidate(admin, ctx, companyVacancyIds),
      admin
        .from("integrations_accounts")
        .select("is_active,last_synced_at,last_sync_error,last_sync_error_at")
        .eq("company_id", ctx.companyId)
        .eq("user_id", ctx.userId)
        .eq("provider", "hh.ru")
        .maybeSingle(),
      readFirstAiBillingSummary(admin, ctx),
    ]);

    if (stateRes.error) return NextResponse.json({ error: "STATE_LOOKUP_FAILED" }, { status: 500 });
    if (vacanciesRes.error) return NextResponse.json({ error: "VACANCIES_LOOKUP_FAILED" }, { status: 500 });
    if (candidatesRes.error) return NextResponse.json({ error: "CANDIDATES_LOOKUP_FAILED" }, { status: 500 });
    if (hhRes.error) return NextResponse.json({ error: "HH_LOOKUP_FAILED" }, { status: 500 });

    const state = mapState((stateRes.data as StateRow | null) ?? null);
    const vacancyRows = mergeVacancyRows(vacancyRow, (vacanciesRes.data ?? []) as VacancyRow[]);
    const candidateRows = mergeCandidateRows(resultCandidate, mergeCandidateRows(anyCandidate, mergeCandidateRows(jobCandidate, (candidatesRes.data ?? []) as CandidateRow[])));
    const jobs = latestJobsByCandidate(await readLatestJobsForCandidateIds(admin, ctx, candidateRows.map((candidate) => candidate.id)));
    const hhData = hhRes.data as { is_active?: boolean; last_synced_at?: string | null; last_sync_error?: string | null; last_sync_error_at?: string | null } | null;
    const hasSyncError = Boolean(hhData?.last_sync_error);
    const progress = deriveFirstAiOnboardingProgress({
      state,
      vacancies: mapVacancies(vacancyRows),
      candidates: mapCandidates(candidateRows, jobs),
      hh: {
        isConnected: Boolean(hhData?.is_active),
        lastSyncedAt: hhData?.last_synced_at ?? null,
        lastSyncErrorAt: hhData?.last_sync_error_at ?? null,
        hasSyncError,
        hasOauthError: Boolean(state.hhOauthErrorAt),
        hasCompletedSync: Boolean(hhData?.last_synced_at),
      },
      billing,
    });

    return NextResponse.json({ state, progress, billingSettingsHref: FIRST_AI_BILLING_SETTINGS_HREF }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const body = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", message: "Проверьте действие и попробуйте ещё раз." }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    if (parsed.data.action === "open_result" || parsed.data.action === "acknowledge_result") {
      if (!parsed.data.candidateId) {
        return NextResponse.json({ error: "INVALID_BODY", message: "Откройте готовый анализ кандидата и попробуйте ещё раз." }, { status: 400 });
      }

      const candidateAccess = await requireCandidateAccess(admin, ctx, parsed.data.candidateId);
      if (!candidateAccess.ok) return candidateAccess.response;

      const { data: resultCandidate, error: resultErr } = await admin
        .from("candidates")
        .select("id,match_percentage,ai_analyses(candidate_id)")
        .eq("id", parsed.data.candidateId)
        .maybeSingle();
      if (resultErr) {
        return NextResponse.json({ error: "CANDIDATE_LOOKUP_FAILED", message: "Не удалось проверить результат анализа. Попробуйте ещё раз." }, { status: 500 });
      }

      const hasResult = Boolean(
        resultCandidate && (resultCandidate.match_percentage !== null || (Array.isArray(resultCandidate.ai_analyses) && resultCandidate.ai_analyses.length > 0)),
      );
      if (!hasResult) {
        return NextResponse.json({ error: "RESULT_NOT_READY", message: "AI-анализ ещё не готов. Дождитесь результата и попробуйте снова." }, { status: 400 });
      }
    }

    const result = await applyFirstAiOnboardingAction(admin, {
      userId: ctx.userId,
      action: parsed.data.action,
      nowIso,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "STATE_UPDATE_FAILED", message: "Не удалось сохранить выбор. Попробуйте ещё раз." }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
