import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext } from "@/lib/access/company-guards";
import {
  deactivateHhIntegrationOnFatalAuth,
  getHhFatalAuthFailure,
  hhFetchJson,
  loadHhAuthContextOrThrow,
} from "@/lib/hh/client";
import { pMap, stripHtmlToText } from "@/lib/hh/sync-utils";
import { DEFAULT_CURRENCY_CODE, toSupportedCurrencyCode } from "@/lib/currency";
import { mapHhExperienceIdToVacancyLevel } from "@/lib/vacancies/hh-experience-level";

const ActiveVacancyListSchema = z
  .object({
    items: z.array(z.any()).default([]),
    page: z.number().optional(),
    pages: z.number().optional(),
    per_page: z.number().optional(),
  })
  .passthrough();

const ActiveVacancyItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string().optional(),
    area: z.object({ name: z.string().optional() }).optional(),
    address: z.object({ raw: z.string().optional() }).optional(),
    salary: z
      .object({
        from: z.number().nullable().optional(),
        to: z.number().nullable().optional(),
        currency: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const VacancyDetailsSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string().optional(),
    description: z.string().optional(),
    employment: z.object({ id: z.string().optional() }).optional(),
    experience: z.object({ id: z.string().optional() }).optional(),
    salary: z
      .object({
        from: z.number().nullable().optional(),
        to: z.number().nullable().optional(),
        currency: z.string().optional(),
      })
      .nullable()
      .optional(),
    area: z.object({ name: z.string().optional() }).optional(),
    address: z.object({ raw: z.string().optional() }).optional(),
  })
  .passthrough();

function mapCurrency(code: string | undefined): string {
  return toSupportedCurrencyCode(code, DEFAULT_CURRENCY_CODE) ?? DEFAULT_CURRENCY_CODE;
}

function mapEmploymentType(hhEmploymentId: string | undefined): "full-time" | "part-time" | "contract" | "internship" {
  const id = (hhEmploymentId ?? "").toLowerCase();
  if (id === "part") return "part-time";
  if (id === "project") return "contract";
  if (id === "probation") return "internship";
  return "full-time";
}

export async function POST(_req: NextRequest) {
  let integrationId: string | null = null;
  let companyId: string | null = null;
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;
    companyId = ctx.companyId;
    userId = ctx.userId;

    const loaded = await loadHhAuthContextOrThrow({ companyId: ctx.companyId, userId: ctx.userId });
    integrationId = loaded.integrationId;
    const hh = loaded.ctx;

    await captureBusinessEvent({
      event: "hh_sync_started",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: {
        sync_type: "vacancies",
      },
    });

    // 1) Fetch active vacancies list for this employer/manager (paginate).
    const items: Array<z.infer<typeof ActiveVacancyItemSchema>> = [];
    let page = 0;
    let pages = 1;
    const perPage = 50;
    while (page < pages) {
      const list = await hhFetchJson(hh, `/employers/${encodeURIComponent(hh.employerId)}/vacancies/active`, {
        query: { manager_id: hh.managerId, page, per_page: perPage },
      });
      const listParsed = ActiveVacancyListSchema.safeParse(list);
      if (!listParsed.success) return NextResponse.json({ error: "HH_ACTIVE_VACANCIES_INVALID" }, { status: 502 });

      const itemsRaw = listParsed.data.items;
      for (const x of itemsRaw) {
        const p = ActiveVacancyItemSchema.safeParse(x);
        if (p.success) items.push(p.data);
      }

      const nextPages = typeof listParsed.data.pages === "number" ? listParsed.data.pages : undefined;
      pages = typeof nextPages === "number" && Number.isFinite(nextPages) ? Math.max(1, Math.trunc(nextPages)) : pages;
      page++;
      if (itemsRaw.length === 0) break;
    }

    const nowIso = new Date().toISOString();

    // 2) For each vacancy, fetch details (for better description + metadata).
    const detailed = await pMap(
      items,
      async (v) => {
        const hhId = String(v.id);
        let details: z.infer<typeof VacancyDetailsSchema> | null = null;
        try {
          const det = await hhFetchJson(hh, `/vacancies/${encodeURIComponent(hhId)}`, { query: {} });
          const detParsed = VacancyDetailsSchema.safeParse(det);
          if (detParsed.success) details = detParsed.data;
        } catch (err) {
          if (getHhFatalAuthFailure(err)) throw err;
          // best-effort; fall back to list item.
        }
        return { hhId, listItem: v, details };
      },
      { concurrency: 4 }
    );

    let created = 0;
    let updated = 0;

    for (const row of detailed) {
      const hhId = row.hhId;
      const d = row.details;
      const title = (d?.name ?? row.listItem.name ?? `HH.ru #${hhId}`).trim();

      const salaryFrom = d?.salary?.from ?? row.listItem.salary?.from ?? null;
      const salaryTo = d?.salary?.to ?? row.listItem.salary?.to ?? null;
      const salaryCurrency = mapCurrency(d?.salary?.currency ?? row.listItem.salary?.currency);

      const location = (d?.address?.raw ?? row.listItem.address?.raw ?? d?.area?.name ?? row.listItem.area?.name ?? "").trim() || "—";
      const descriptionText = d?.description ? stripHtmlToText(d.description) : `Импортировано из HH.ru (vacancy_id=${hhId}).`;

      const employmentType = mapEmploymentType(d?.employment?.id);
      const experienceLevel = mapHhExperienceIdToVacancyLevel(d?.experience?.id);

      // Find existing vacancy for this user (ownership) and HH id.
      const { data: existing, error: exErr } = await admin
        .from("vacancies")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("created_by", ctx.userId)
        .eq("hhru_vacancy_id", hhId)
        .maybeSingle();
      if (exErr) return NextResponse.json({ error: "VACANCY_LOOKUP_FAILED" }, { status: 500 });

      if (existing?.id) {
        const { error: upErr } = await admin
          .from("vacancies")
          .update({
            title,
            description: descriptionText,
            salary_min: typeof salaryFrom === "number" ? salaryFrom : null,
            salary_max: typeof salaryTo === "number" ? salaryTo : null,
            salary_currency: salaryCurrency,
            location,
            employment_type: employmentType,
            experience_level: experienceLevel,
            updated_at: nowIso,
          })
          .eq("id", existing.id);
        if (upErr) return NextResponse.json({ error: "VACANCY_UPDATE_FAILED" }, { status: 500 });
        updated++;
      } else {
        const { error: insErr } = await admin.from("vacancies").insert({
          title,
          description: descriptionText,
          requirements: [],
          responsibilities: [],
          salary_min: typeof salaryFrom === "number" ? salaryFrom : null,
          salary_max: typeof salaryTo === "number" ? salaryTo : null,
          salary_currency: salaryCurrency,
          location,
          employment_type: employmentType,
          experience_level: experienceLevel,
          status: "active",
          company_id: ctx.companyId,
          created_by: ctx.userId,
          hhru_vacancy_id: hhId,
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (insErr) return NextResponse.json({ error: "VACANCY_INSERT_FAILED" }, { status: 500 });
        created++;
      }
    }

    await admin
      .from("integrations_accounts")
      .update({ last_synced_at: nowIso, updated_at: nowIso })
      .eq("id", integrationId as string);

    await captureBusinessEvent({
      event: "hh_sync_completed",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: {
        sync_type: "vacancies",
        vacancies_processed: items.length,
        candidates_created: created,
        candidates_updated: updated,
      },
    });

    return NextResponse.json({ ok: true, created, updated, total: items.length }, { status: 200 });
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
