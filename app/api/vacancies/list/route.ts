import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext, type CompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { loadAllSupabaseRows, loadPagedSupabaseRows } from "@/lib/supabase/pagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };
const MAX_PAGE_SIZE = 200;
const MAX_ALL_VACANCIES = 20_000;

type VacancyRow = Database["public"]["Tables"]["vacancies"]["Row"];
type VacancyStatus = VacancyRow["status"];

const VacancyStatusSchema = z.enum(["draft", "active", "paused", "closed", "all"]);
const VacancyIdSchema = z.string().uuid();

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function emptyVacancyList() {
  return NextResponse.json({ items: [], total: 0, totalAllStatuses: 0 }, { status: 200, headers: noStoreHeaders });
}

function applyVisibleVacancyScope(query: any, ctx: CompanyContext) {
  query = query.eq("company_id", ctx.companyId);
  return ctx.role === "admin" ? query : query.eq("created_by", ctx.userId);
}

function applyVacancyFilters(query: any, input: { status: VacancyStatus | "all"; vacancyId: string | null }) {
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.vacancyId) query = query.eq("id", input.vacancyId);
  return query;
}

function buildVacancyRowsQuery(admin: any, ctx: CompanyContext, input: { status: VacancyStatus | "all"; vacancyId: string | null }) {
  let query = admin
    .from("vacancies")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  query = applyVisibleVacancyScope(query, ctx);
  return applyVacancyFilters(query, input);
}

function buildVacancyCountQuery(admin: any, ctx: CompanyContext, input: { status: VacancyStatus | "all"; vacancyId: string | null }) {
  let query = admin.from("vacancies").select("*", { count: "exact", head: true });
  query = applyVisibleVacancyScope(query, ctx);
  return applyVacancyFilters(query, input);
}

async function runTotalAllStatusesCount(admin: any, ctx: CompanyContext): Promise<number> {
  const { count, error } = await applyVisibleVacancyScope(
    admin.from("vacancies").select("*", { count: "exact", head: true }),
    ctx
  );
  if (error) throw error;
  return typeof count === "number" ? count : 0;
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const statusParam = url.searchParams.get("status") ?? "all";
    const parsedStatus = VacancyStatusSchema.safeParse(statusParam);
    if (!parsedStatus.success) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Проверьте фильтр статуса и попробуйте ещё раз." },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const rawVacancyId = url.searchParams.get("vacancyId")?.trim() ?? "";
    if (rawVacancyId && !VacancyIdSchema.safeParse(rawVacancyId).success) return emptyVacancyList();
    const vacancyId = rawVacancyId || null;

    const page = clampInt(url.searchParams.get("page"), 1, 1, 10_000);
    const pageSize = clampInt(url.searchParams.get("pageSize"), 25, 1, MAX_PAGE_SIZE);
    const all = url.searchParams.get("all") === "true" || url.searchParams.get("mode") === "all";

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }
    const ctx = ctxRes.data;

    const filters = { status: parsedStatus.data, vacancyId };
    const totalAllStatusesPromise = runTotalAllStatusesCount(admin, ctx);

    if (all) {
      const items = await loadAllSupabaseRows<VacancyRow>({
        maxRows: MAX_ALL_VACANCIES,
        runPageQuery: (from, to) => buildVacancyRowsQuery(admin, ctx, filters).range(from, to),
      });
      const totalAllStatuses = await totalAllStatusesPromise;
      return NextResponse.json(
        { items, total: items.length, totalAllStatuses },
        { status: 200, headers: noStoreHeaders }
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const [{ rows, total }, totalAllStatuses] = await Promise.all([
      loadPagedSupabaseRows<VacancyRow>({
        runPageQuery: async () => buildVacancyRowsQuery(admin, ctx, filters).range(from, to),
        runCountQuery: async () => buildVacancyCountQuery(admin, ctx, filters),
      }),
      totalAllStatusesPromise,
    ]);

    return NextResponse.json({ items: rows, total, totalAllStatuses }, { status: 200, headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { error: "VACANCIES_LOOKUP_FAILED", message: "Не удалось загрузить вакансии. Обновите страницу." },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
