import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { captureBusinessEvent } from "@/lib/analytics/business-events";
import {
  isAnalyticsPeriodOrderValid,
  normalizeAnalyticsFilters,
} from "@/lib/analytics/filters";
import { loadAnalyticsDashboard } from "@/lib/analytics/server";
import type { AnalyticsFilters } from "@/lib/analytics/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function activeAnalyticsFilterKeys(filters: AnalyticsFilters) {
  const keys = ["periodStart", "periodEnd", "periodMode"];
  if (filters.periodMode === "as_of_snapshot") keys.push("asOfDate");
  if (filters.vacancyId) keys.push("vacancyId");
  if (filters.vacancyStatus !== "all") keys.push("vacancyStatus");
  if (filters.ownerId) keys.push("ownerId");
  if (filters.department) keys.push("department");
  if (filters.location) keys.push("location");
  if (filters.source) keys.push("source");
  if (filters.candidateStatus) keys.push("candidateStatus");
  if (filters.aiScoreMin !== null) keys.push("aiScoreMin");
  if (filters.riskyOnly) keys.push("riskyOnly");
  if (filters.staleOnly) keys.push("staleOnly");
  if (filters.savedViewId) keys.push("savedViewId");
  return keys;
}

async function loadAnalyticsEventContext(admin: any, companyId: string) {
  const { data } = await admin.from("company_plans").select("current_plan").eq("company_id", companyId).maybeSingle();
  const planTier = typeof data?.current_plan === "string" ? data.current_plan : null;

  return {
    feature: "analytics_v1",
    feature_available: true,
    entitlement_state: planTier ? "available" : null,
    plan_tier: planTier,
  };
}

async function captureAnalyticsDashboardEvents(input: {
  admin: any;
  ctx: { userId: string; companyId: string; role: string };
  filters: AnalyticsFilters;
}) {
  try {
    const { filters } = input;
    const filterKeys = activeAnalyticsFilterKeys(filters);
    const eventContext = await loadAnalyticsEventContext(input.admin, input.ctx.companyId);
    const properties = {
      ...eventContext,
      analytics_view: "dashboard",
      period_mode: filters.periodMode,
      filter_count: filterKeys.length,
      filter_keys: filterKeys.join(","),
    };

    await captureBusinessEvent({
      event: "analytics_dashboard_viewed",
      userId: input.ctx.userId,
      companyId: input.ctx.companyId,
      role: input.ctx.role,
      properties,
    });

    if (filterKeys.length > 0) {
      await captureBusinessEvent({
        event: "analytics_filter_applied",
        userId: input.ctx.userId,
        companyId: input.ctx.companyId,
        role: input.ctx.role,
        properties,
      });
    }
  } catch {
    // Product analytics must never block dashboard loading.
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;

    const filters = normalizeAnalyticsFilters(req.nextUrl.searchParams, { role: ctxRes.data.role });
    if (!isAnalyticsPeriodOrderValid(filters.periodStart, filters.periodEnd)) {
      return NextResponse.json(
        {
          error: "INVALID_FILTERS",
          message: "Проверьте период: дата начала должна быть раньше даты окончания.",
        },
        { status: 400 },
      );
    }

    const dashboard = await loadAnalyticsDashboard({
      admin,
      ctx: ctxRes.data,
      filters,
    });

    void captureAnalyticsDashboardEvents({ admin, ctx: ctxRes.data, filters });

    return NextResponse.json(dashboard, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[analytics] dashboard load failed", error instanceof Error ? error.message : String(error));
    }

    return NextResponse.json(
      {
        error: "ANALYTICS_LOAD_FAILED",
        message: "Не удалось загрузить аналитику. Проверьте период и попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }
}
