import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadAllSupabaseRows } from "@/lib/supabase/pagination";
import { requireCompanyContext } from "@/lib/access/company-guards";
import {
  deactivateHhIntegrationOnFatalAuth,
  getHhFatalAuthFailure,
  hhFetchJson,
  loadHhAuthContextOrThrow,
} from "@/lib/hh/client";
import { pMap } from "@/lib/hh/sync-utils";

const VacRowSchema = z.object({
  id: z.string().uuid(),
  hhru_vacancy_id: z.string().nullable(),
});

const NegotiationsCollectionsSchema = z
  .object({
    collections: z.array(z.object({ id: z.string() }).passthrough()).default([]),
  })
  .passthrough();

const CollectionItemsSchema = z
  .object({
    items: z.array(z.any()).default([]),
    pages: z.number().optional(),
  })
  .passthrough();

const NegotiationItemSchema = z
  .object({
    resume: z.object({ id: z.string() }).passthrough(),
  })
  .passthrough();

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(_req: NextRequest) {
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

    let vacsRaw: unknown[];
    try {
      vacsRaw = await loadAllSupabaseRows({
        runPageQuery: (from, to) =>
          admin
            .from("vacancies")
            .select("id,hhru_vacancy_id")
            .eq("company_id", ctx.companyId)
            .eq("created_by", ctx.userId)
            .not("hhru_vacancy_id", "is", null)
            .order("id", { ascending: true })
            .range(from, to),
      });
    } catch {
      return NextResponse.json({ error: "VACANCIES_LOOKUP_FAILED" }, { status: 500 });
    }

    const vacs = vacsRaw
      .map((v) => VacRowSchema.safeParse(v))
      .filter((p) => p.success)
      .map((p) => p.data)
      .filter((v) => Boolean(v.hhru_vacancy_id));

    const pairsByVacancy = new Map<string, Set<string>>();

    for (const vac of vacs) {
      const vacId = String(vac.id);
      const hhVacId = String(vac.hhru_vacancy_id);

      const collectionsJson = await hhFetchJson(hh, "/negotiations", {
        query: { vacancy_id: hhVacId, status: "active", page: 0, per_page: 20 },
      });
      const collectionsParsed = NegotiationsCollectionsSchema.safeParse(collectionsJson);
      if (!collectionsParsed.success) continue;

      const collectionIds = collectionsParsed.data.collections.map((c) => c.id).filter(Boolean);
      if (collectionIds.length === 0) continue;

      const resumeIdsNested = await pMap(
        collectionIds,
        async (collectionId) => {
          const ids: string[] = [];
          let page = 0;
          let pages = 1;

          while (page < pages) {
            const urlPath = `/negotiations/${encodeURIComponent(collectionId)}`;
            const json = await hhFetchJson(hh, urlPath, { query: { vacancy_id: hhVacId, page, per_page: 50 } });
            const parsed = CollectionItemsSchema.safeParse(json);
            if (!parsed.success) break;

            for (const it of parsed.data.items) {
              const p = NegotiationItemSchema.safeParse(it);
              if (p.success) ids.push(String(p.data.resume.id));
            }

            const nextPages = typeof parsed.data.pages === "number" ? parsed.data.pages : undefined;
            pages = typeof nextPages === "number" && Number.isFinite(nextPages) ? Math.max(1, Math.trunc(nextPages)) : pages;
            page++;
            if (parsed.data.items.length === 0) break;
          }

          return ids;
        },
        { concurrency: 3 }
      );

      const resumeIds = resumeIdsNested.flat().filter(Boolean);
      if (resumeIds.length === 0) continue;

      const set = pairsByVacancy.get(vacId) ?? new Set<string>();
      for (const id of resumeIds) set.add(id);
      pairsByVacancy.set(vacId, set);
    }

    const totalCandidatesSeen = Array.from(pairsByVacancy.values()).reduce((sum, set) => sum + set.size, 0);
    let existingCount = 0;

    for (const [vacancyId, resumeIdSet] of pairsByVacancy) {
      const resumeIds = Array.from(resumeIdSet);
      for (const idsChunk of chunk(resumeIds, 500)) {
        const { data: existingRows, error: existingErr } = await admin
          .from("candidates")
          .select("id")
          .eq("vacancy_id", vacancyId)
          .in("hhru_resume_id", idsChunk);
        if (existingErr) return NextResponse.json({ error: "CANDIDATES_LOOKUP_FAILED" }, { status: 500 });
        existingCount += (existingRows ?? []).length;
      }
    }

    const updatableCount = existingCount;
    const newCount = Math.max(0, totalCandidatesSeen - existingCount);

    return NextResponse.json(
      {
        ok: true,
        vacanciesChecked: vacs.length,
        totalCandidatesSeen,
        newCount,
        updatableCount,
      },
      { status: 200 }
    );
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
