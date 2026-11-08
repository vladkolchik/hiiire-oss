import { NextResponse, type NextRequest } from "next/server";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext, requireVacancyAccess } from "@/lib/access/company-guards";
import {
  deactivateHhIntegrationOnFatalAuth,
  getHhFatalAuthFailure,
  hhFetchJson,
  loadHhAuthContextOrThrow,
} from "@/lib/hh/client";
import { stripHtmlToText } from "@/lib/hh/sync-utils";
import { DEFAULT_CURRENCY_CODE, toSupportedCurrencyCode } from "@/lib/currency";
import { mapHhExperienceIdToVacancyLevel } from "@/lib/vacancies/hh-experience-level";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  let integrationId: string | null = null;
  let companyId: string | null = null;
  let userId: string | null = null;
  try {
    const params = await Promise.resolve(context.params);
    const vacancyId = String(params.id ?? "").trim();
    if (!vacancyId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;
    companyId = ctx.companyId;
    userId = ctx.userId;

    const accessRes = await requireVacancyAccess(admin, ctx, vacancyId);
    if (!accessRes.ok) return accessRes.response;

    const { data: vac, error: vacErr } = await admin.from("vacancies").select("*").eq("id", vacancyId).single();
    if (vacErr || !vac) return NextResponse.json({ error: "VACANCY_LOOKUP_FAILED" }, { status: 500 });
    if (!vac.hhru_vacancy_id) return NextResponse.json({ error: "NO_HHRU_VACANCY_ID" }, { status: 400 });

    // Important: user-level tokens. Only vacancy owner can sync for now.
    if (vac.created_by !== ctx.userId) {
      return NextResponse.json({ error: "HH_SYNC_REQUIRES_OWNER_CONNECTION" }, { status: 403 });
    }

    const loaded = await loadHhAuthContextOrThrow({ companyId: ctx.companyId, userId: ctx.userId });
    integrationId = loaded.integrationId;
    const hh = loaded.ctx;
    const hhId = String(vac.hhru_vacancy_id);
    const details = await hhFetchJson<any>(hh, `/vacancies/${encodeURIComponent(hhId)}`, { query: {} });

    const title = typeof details?.name === "string" ? details.name : vac.title;
    const descriptionHtml = typeof details?.description === "string" ? details.description : null;
    const description = descriptionHtml ? stripHtmlToText(descriptionHtml) : vac.description;

    const salaryFrom = typeof details?.salary?.from === "number" ? details.salary.from : vac.salary_min;
    const salaryTo = typeof details?.salary?.to === "number" ? details.salary.to : vac.salary_max;
    const currencyRaw = typeof details?.salary?.currency === "string" ? details.salary.currency : vac.salary_currency;
    const salaryCurrency = toSupportedCurrencyCode(currencyRaw, DEFAULT_CURRENCY_CODE) ?? DEFAULT_CURRENCY_CODE;

    const location =
      typeof details?.address?.raw === "string"
        ? details.address.raw
        : typeof details?.area?.name === "string"
          ? details.area.name
          : vac.location;

    const employmentId = typeof details?.employment?.id === "string" ? details.employment.id : undefined;
    const experienceId = typeof details?.experience?.id === "string" ? details.experience.id : undefined;
    const employment_type =
      employmentId === "part" ? "part-time" : employmentId === "project" ? "contract" : employmentId === "probation" ? "internship" : "full-time";
    const experience_level = mapHhExperienceIdToVacancyLevel(experienceId);

    const nowIso = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("vacancies")
      .update({
        title: typeof title === "string" ? title : vac.title,
        description: typeof description === "string" ? description : vac.description,
        // Keep structured arrays as-is (HH stores many formats in description).
        requirements: Array.isArray(vac.requirements) ? vac.requirements : [],
        responsibilities: Array.isArray(vac.responsibilities) ? vac.responsibilities : [],
        salary_min: salaryFrom ?? null,
        salary_max: salaryTo ?? null,
        salary_currency: salaryCurrency,
        location: typeof location === "string" ? location : vac.location,
        employment_type: employment_type as any,
        experience_level: experience_level as any,
        updated_at: nowIso,
      })
      .eq("id", vacancyId)
      .select("*")
      .single();

    if (error || !updated) return NextResponse.json({ error: "HH_SYNC_FAILED" }, { status: 500 });

    return NextResponse.json({ vacancy: updated }, { status: 200 });
  } catch (e) {
    const fatal = getHhFatalAuthFailure(e);
    if (fatal) {
      const deactivated = await deactivateHhIntegrationOnFatalAuth({
        integrationId,
        companyId,
        userId,
        reason: fatal.reason,
        detail: fatal.detail,
      });
      if (!deactivated) {
        return NextResponse.json({ error: "HH_RECONNECT_REQUIRED_DEACTIVATION_FAILED" }, { status: 500 });
      }
      return NextResponse.json({ error: "HH_RECONNECT_REQUIRED" }, { status: 409 });
    }

    const msg = e instanceof Error ? e.message : "INTERNAL_ERROR";
    const known =
      msg === "HH_NOT_CONNECTED" || msg === "HH_SETTINGS_MISSING" || msg === "HH_TOKEN_MISSING" || msg === "HH_REFRESH_TOKEN_MISSING";
    return NextResponse.json({ error: msg }, { status: known ? 400 : 500 });
  }
}
