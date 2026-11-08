import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import { isAiAllowed, loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyContext, type CompanyContext } from "@/lib/access/company-guards";
import { buildCandidateNameIlikePatterns } from "@/lib/candidates/name-search";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_MAX_BULK = 2_000;
const ENQUEUE_CONCURRENCY = 10;

const IdsBodySchema = z.object({
  mode: z.literal("ids"),
  candidateIds: z.array(z.string().min(1)).min(1),
  limit: z.number().int().positive().optional(),
});

const ScopeBodySchema = z.object({
  mode: z.literal("scope"),
  filters: z.object({
    vacancyId: z.union([z.literal("all"), z.string().min(1)]),
    scoreFilter: z.literal("unscored"),
    statusFilter: z.enum(["all", "new", "reviewing", "security-check", "interview-scheduled", "interviewed", "offer", "hired", "rejected"]).optional(),
    nameQuery: z.string().max(120).optional(),
    sort: z.enum(["date_desc", "date_asc"]).optional(),
  }),
  limit: z.number().int().positive(),
});

const BodySchema = z.discriminatedUnion("mode", [IdsBodySchema, ScopeBodySchema]);

type CandidateLite = {
  id: string;
  vacancy_id: string;
  created_by: string;
  applied_at: string;
  match_percentage: number | null;
};

function chunk<T>(arr: T[], size: number): T[][];
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clampPositiveInt(v: number, fallback: number): number {
  const n = Number.isFinite(v) ? Math.trunc(v) : fallback;
  if (n <= 0) return fallback;
  return n;
}

async function getAvailableCredits(admin: any, companyId: string): Promise<number> {
  const { data, error } = await admin
    .from("company_credits")
    .select("balance,reserved")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return 0;
  const balance = typeof data?.balance === "number" ? data.balance : 0;
  const reserved = typeof data?.reserved === "number" ? data.reserved : 0;
  return Math.max(0, balance - reserved);
}

async function listAccessibleVacancyIds(
  admin: any,
  ctx: CompanyContext,
  vacancyIdFilter: "all" | string
): Promise<{ ids: string[]; forbiddenVacancy: boolean }> {
  let query = admin.from("vacancies").select("id").eq("company_id", ctx.companyId);
  if (ctx.role !== "admin") query = query.eq("created_by", ctx.userId);
  if (vacancyIdFilter !== "all") query = query.eq("id", vacancyIdFilter);

  const { data, error } = await query;
  if (error) return { ids: [], forbiddenVacancy: vacancyIdFilter !== "all" };

  const ids = ((data ?? []) as Array<{ id: string }>).map((x) => x.id);
  return {
    ids,
    forbiddenVacancy: vacancyIdFilter !== "all" && ids.length === 0,
  };
}

async function listCandidatesByIds(admin: any, ids: string[]): Promise<CandidateLite[]> {
  const out: CandidateLite[] = [];
  for (const c of chunk(ids, 300)) {
    const { data, error } = await admin
      .from("candidates")
      .select("id,vacancy_id,created_by,applied_at,match_percentage")
      .in("id", c);
    if (error) continue;
    out.push(...((data ?? []) as CandidateLite[]));
  }
  return out;
}

async function listLatestJobsByCandidateIds(
  admin: any,
  candidateIds: string[]
): Promise<Map<string, "queued" | "processing" | "done" | "failed">> {
  const latest = new Map<string, "queued" | "processing" | "done" | "failed">();
  for (const c of chunk(candidateIds, 400)) {
    const { data, error } = await admin
      .from("jobs_ai")
      .select("candidate_id,status,updated_at")
      .in("candidate_id", c)
      .in("status", ["queued", "processing", "done", "failed"])
      .order("updated_at", { ascending: false });
    if (error) continue;

    for (const row of (data ?? []) as Array<{ candidate_id: string; status: "queued" | "processing" | "done" | "failed" }>) {
      if (!latest.has(row.candidate_id)) latest.set(row.candidate_id, row.status);
    }
  }
  return latest;
}

async function enqueueCandidatesWithConcurrency(
  admin: any,
  companyId: string,
  userId: string,
  candidateIds: string[]
): Promise<{ started: number; failed: number }> {
  if (candidateIds.length === 0) return { started: 0, failed: 0 };
  let started = 0;
  let failed = 0;
  let idx = 0;

  async function worker() {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= candidateIds.length) break;

      const candidateId = candidateIds[current]!;
      try {
        const { data: job, error } = await admin.rpc("enqueue_ai_job_with_credit_reserve", {
          p_company_id: companyId,
          p_candidate_id: candidateId,
          p_requested_by: userId,
          p_credits_to_reserve: 1,
        });

        if (error || !job) {
          failed += 1;
          continue;
        }

        const status = (job as { status?: unknown }).status;
        if (status === "failed") {
          failed += 1;
          continue;
        }
        started += 1;
      } catch {
        failed += 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(ENQUEUE_CONCURRENCY, candidateIds.length) }, () => worker());
  await Promise.all(workers);
  return { started, failed };
}

/**
 * Bulk create (or retry) AI analysis jobs for candidates in page/scope modes.
 */
export async function POST(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
    const body = parsed.data;

    const planSnapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    if (!isAiAllowed(planSnapshot)) {
      return NextResponse.json({ error: "SUBSCRIPTION_INACTIVE" }, { status: 402 });
    }

    const creditsAvailable = await getAvailableCredits(admin, ctx.companyId);

    const requestedRaw =
      body.mode === "ids"
        ? clampPositiveInt(body.limit ?? body.candidateIds.length, body.candidateIds.length)
        : clampPositiveInt(body.limit, 1);
    const requestedCapped = Math.min(requestedRaw, SYSTEM_MAX_BULK);

    let poolOrderedIds: string[] = [];

    if (body.mode === "ids") {
      const inputIds = Array.from(new Set(body.candidateIds.map((x) => String(x).trim()).filter(Boolean)));
      const candidates = await listCandidatesByIds(admin, inputIds);

      const vacancyIds = Array.from(new Set(candidates.map((c) => c.vacancy_id)));
      const vacancyById = new Map<string, { id: string; company_id: string }>();
      for (const c of chunk(vacancyIds, 300)) {
        const { data } = await admin.from("vacancies").select("id,company_id").in("id", c);
        for (const v of (data ?? []) as Array<{ id: string; company_id: string }>) vacancyById.set(v.id, v);
      }

      const accessible = new Set<string>();
      for (const cand of candidates) {
        const vac = vacancyById.get(cand.vacancy_id);
        if (!vac || vac.company_id !== ctx.companyId) continue;
        if (ctx.role !== "admin" && cand.created_by !== ctx.userId) continue;
        if (cand.match_percentage !== null) continue;
        accessible.add(cand.id);
      }

      for (const id of inputIds) {
        if (accessible.has(id)) poolOrderedIds.push(id);
        if (poolOrderedIds.length >= requestedCapped) break;
      }
    } else {
      const filter = body.filters;
      if (filter.scoreFilter !== "unscored") {
        return NextResponse.json({ error: "UNSUPPORTED_SCOPE" }, { status: 400 });
      }
      const sort = filter.sort ?? "date_desc";
      const namePatterns = buildCandidateNameIlikePatterns(filter.nameQuery);

      const vacancies = await listAccessibleVacancyIds(admin, ctx, filter.vacancyId);
      if (vacancies.forbiddenVacancy) {
        return NextResponse.json({ error: "FORBIDDEN_SCOPE_VACANCY" }, { status: 403 });
      }
      if (vacancies.ids.length === 0) {
        return NextResponse.json({
          requested: requestedRaw,
          selectedInScope: 0,
          effectiveLimit: 0,
          creditsAvailable,
          started: 0,
          skipped: 0,
          failed: 0,
          clampedByCredits: false,
          message: "Кандидаты в выбранном скоупе не найдены",
        });
      }

      let query = admin
        .from("candidates")
        .select("id,vacancy_id,created_by,applied_at,match_percentage")
        .in("vacancy_id", vacancies.ids)
        .is("match_percentage", null)
        .order("applied_at", { ascending: sort === "date_asc" })
        .limit(requestedCapped);

      if (ctx.role !== "admin") query = query.eq("created_by", ctx.userId);
      if (filter.vacancyId !== "all") query = query.eq("vacancy_id", filter.vacancyId);
      if (filter.statusFilter && filter.statusFilter !== "all") query = query.eq("status", filter.statusFilter);
      for (const namePattern of namePatterns) query = query.ilike("name", namePattern);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: "CANDIDATES_LOOKUP_FAILED" }, { status: 500 });
      poolOrderedIds = ((data ?? []) as CandidateLite[]).map((c) => c.id);
    }

    const selectedInScope = poolOrderedIds.length;
    if (selectedInScope === 0) {
      return NextResponse.json({
        requested: requestedRaw,
        selectedInScope,
        effectiveLimit: 0,
        creditsAvailable,
        started: 0,
        skipped: 0,
        failed: 0,
        clampedByCredits: false,
        message: "Нет доступных кандидатов для запуска AI анализа",
      });
    }

    const latestByCandidateId = await listLatestJobsByCandidateIds(admin, poolOrderedIds);
    const eligibleIds: string[] = [];
    let skipped = 0;
    for (const id of poolOrderedIds) {
      const status = latestByCandidateId.get(id);
      if (status === "queued" || status === "processing" || status === "done") {
        skipped += 1;
        continue;
      }
      eligibleIds.push(id);
    }

    const eligibleLimit = Math.min(requestedCapped, eligibleIds.length);
    const effectiveLimit = Math.min(eligibleLimit, creditsAvailable);
    const clampedByCredits = effectiveLimit < eligibleLimit && creditsAvailable < eligibleLimit;

    const toEnqueue = eligibleIds.slice(0, effectiveLimit);
    const { started, failed } = await enqueueCandidatesWithConcurrency(admin, ctx.companyId, ctx.userId, toEnqueue);

    return NextResponse.json({
      requested: requestedRaw,
      selectedInScope,
      effectiveLimit,
      creditsAvailable,
      started,
      skipped,
      failed,
      clampedByCredits,
      ...(clampedByCredits
        ? { message: `Недостаточно кредитов: запущено ${effectiveLimit} из ${eligibleLimit}` }
        : {}),
    });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
