import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadAllSupabaseRows } from "@/lib/supabase/pagination";
import { requireCompanyContext } from "@/lib/access/company-guards";
import { extractCandidateContactsFromText } from "@/lib/contacts/extract-candidate-contacts";
import { buildDesiredSalaryDbPatchFromHhResume } from "@/lib/candidates/desired-salary";
import type { HhAuthContext } from "@/lib/hh/client";
import {
  deactivateHhIntegrationOnFatalAuth,
  getHhFatalAuthFailure,
  hhFetchJson,
  loadHhAuthContextOrThrow,
} from "@/lib/hh/client";
import { pMap } from "@/lib/hh/sync-utils";
import { hhResumeName, hhResumePosition, hhResumeToText } from "@/lib/hh/resume-to-text";

const HH_AUTO_SURVEY_MAX_CHARS = 4000;

const VacRowSchema = z.object({
  id: z.string().uuid(),
  hhru_vacancy_id: z.string().nullable(),
  title: z.string(),
});

const NegotiationsCollectionsSchema = z
  .object({
    collections: z.array(z.object({ id: z.string() }).passthrough()).default([]),
  })
  .passthrough();

const CollectionItemsSchema = z
  .object({
    items: z.array(z.any()).default([]),
    page: z.number().optional(),
    pages: z.number().optional(),
  })
  .passthrough();

const SyncBodySchema = z.object({
  mode: z.enum(["new_only", "new_and_update"]).optional().default("new_only"),
});

const NegotiationItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    created_at: z.string().optional(),
    resume: z.object({ id: z.string() }).passthrough(),
    chat_bot: z.any().optional(),
  })
  .passthrough();

function toIsoOrNow(v: string | undefined): string {
  if (!v) return new Date().toISOString();
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return new Date().toISOString();
  return new Date(t).toISOString();
}

function normalizeHhAutoSurveyText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.replace(/\r\n?/g, "\n");
  // HH can return bot Q&A in a single line separated by "\".
  text = text.replace(/[ \t]*\\+[ \t]*/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();
  if (!text) return null;
  if (text.length > HH_AUTO_SURVEY_MAX_CHARS) text = text.slice(0, HH_AUTO_SURVEY_MAX_CHARS);
  return text;
}

function toHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function pickHhResumePhotoUrl(resume: unknown): string | null {
  if (!resume || typeof resume !== "object") return null;
  const photo = (resume as any).photo;
  if (!photo || typeof photo !== "object") return null;

  const p = photo as Record<string, unknown>;
  const candidates = [p.small, p.medium, p["100"], p["40"], p["500"]];
  for (const candidate of candidates) {
    const url = toHttpUrl(candidate);
    if (url) return url;
  }
  return null;
}

async function loadFullResumeBestEffort(hh: HhAuthContext, resumeId: string): Promise<any | null> {
  try {
    const full = await hhFetchJson(hh, `/resumes/${encodeURIComponent(resumeId)}`, {
      query: {
        with_negotiations_history: true,
        with_creds: true,
        with_job_search_status: true,
      },
    });
    return full && typeof full === "object" ? full : null;
  } catch (err) {
    if (getHhFatalAuthFailure(err)) throw err;
    return null;
  }
}

async function replaceCandidateContacts(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    candidateId: string;
    contacts: Array<{ type: string; value: string; label?: string }>;
    nowIso: string;
  }
) {
  const { error: delErr } = await admin.from("candidate_contacts").delete().eq("candidate_id", input.candidateId);
  if (delErr) throw new Error("CANDIDATE_CONTACTS_CLEAR_FAILED");
  if (input.contacts.length === 0) return;

  const payload = input.contacts.map((c) => ({
    candidate_id: input.candidateId,
    type: String(c.type),
    value: String(c.value),
    label: c.label ? String(c.label) : null,
    created_at: input.nowIso,
    updated_at: input.nowIso,
  }));
  const { error: insErr } = await admin.from("candidate_contacts").insert(payload);
  if (insErr) throw new Error("CANDIDATE_CONTACTS_INSERT_FAILED");
}

export async function POST(req: NextRequest) {
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
    const bodyJson = await req.json().catch(() => null);
    const bodyParsed = SyncBodySchema.safeParse(bodyJson ?? {});
    if (!bodyParsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    const mode = bodyParsed.data.mode;

    const loaded = await loadHhAuthContextOrThrow({ companyId: ctx.companyId, userId: ctx.userId });
    integrationId = loaded.integrationId;
    const hh = loaded.ctx;

    await captureBusinessEvent({
      event: "hh_sync_started",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: {
        sync_type: "candidates",
        mode,
      },
    });

    // Only sync vacancies owned by current user (keeps recruiter isolation).
    let vacsRaw: unknown[];
    try {
      vacsRaw = await loadAllSupabaseRows({
        runPageQuery: (from, to) =>
          admin
            .from("vacancies")
            .select("id,hhru_vacancy_id,title")
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

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    for (const vac of vacs) {
      const hhVacId = String(vac.hhru_vacancy_id);

      // 1) Collections for this vacancy.
      const collectionsJson = await hhFetchJson(hh, "/negotiations", {
        query: { vacancy_id: hhVacId, status: "active", page: 0, per_page: 20 },
      });
      const collectionsParsed = NegotiationsCollectionsSchema.safeParse(collectionsJson);
      if (!collectionsParsed.success) continue;

      const collectionIds = collectionsParsed.data.collections.map((c) => c.id).filter(Boolean);
      if (collectionIds.length === 0) continue;

      // 2) Fetch all items for each collection.
      const itemsPerCollection = await pMap(
        collectionIds,
        async (collectionId) => {
          const items: z.infer<typeof NegotiationItemSchema>[] = [];
          let page = 0;
          let pages = 1;
          while (page < pages) {
            const urlPath = `/negotiations/${encodeURIComponent(collectionId)}`;
            const json = await hhFetchJson(hh, urlPath, { query: { vacancy_id: hhVacId, page, per_page: 50 } });
            const parsed = CollectionItemsSchema.safeParse(json);
            if (!parsed.success) break;
            for (const it of parsed.data.items) {
              const p = NegotiationItemSchema.safeParse(it);
              if (p.success) items.push(p.data);
            }
            const nextPages = typeof parsed.data.pages === "number" ? parsed.data.pages : undefined;
            pages = typeof nextPages === "number" && Number.isFinite(nextPages) ? Math.max(1, Math.trunc(nextPages)) : pages;
            page++;
            if (parsed.data.items.length === 0) break;
          }
          return items;
        },
        { concurrency: 3 }
      );

      const allItems = itemsPerCollection.flat();

      for (const it of allItems) {
        const resumeId = String(it.resume.id);
        const appliedAt = toIsoOrNow(it.created_at);
        const previewResume = it.resume;
        const hhAutoSurveyText = normalizeHhAutoSurveyText((it as any)?.chat_bot?.auto_survey?.text);
        const fullResume = await loadFullResumeBestEffort(hh, resumeId);
        const resume = fullResume ?? previewResume;

        const name = hhResumeName(resume);
        const position = hhResumePosition(resume) || vac.title;
        const resumeText = hhResumeToText(resume, { includeRawJson: false });
        const desiredSalaryPatch = buildDesiredSalaryDbPatchFromHhResume(resume);
        const desiredSalaryWritePatch = desiredSalaryPatch ?? {};
        const avatarUrl = pickHhResumePhotoUrl(resume);
        const extractedContacts = extractCandidateContactsFromText(resumeText).slice(0, 30);
        const candidateUpdatePatch: {
          name: string;
          position: string;
          resume_text: string | null;
          desired_salary_text?: string | null;
          desired_salary_amount?: number | null;
          desired_salary_currency?: string | null;
          desired_salary_source?: "hh" | "ai_parser" | "regex" | null;
          hh_auto_survey_text: string | null;
          applied_at: string;
          updated_at: string;
          avatar_url?: string;
        } = {
          name,
          position,
          resume_text: resumeText || null,
          ...desiredSalaryWritePatch,
          hh_auto_survey_text: hhAutoSurveyText,
          applied_at: appliedAt,
          updated_at: nowIso,
        };
        if (avatarUrl) candidateUpdatePatch.avatar_url = avatarUrl;

        if (mode === "new_and_update") {
          const { data: existingCandidate, error: existingErr } = await admin
            .from("candidates")
            .select("id")
            .eq("vacancy_id", vac.id)
            .eq("hhru_resume_id", resumeId)
            .maybeSingle();
          if (existingErr) return NextResponse.json({ error: "CANDIDATE_LOOKUP_FAILED" }, { status: 500 });

          if (existingCandidate?.id) {
            const { error: updErr } = await admin
              .from("candidates")
              .update(candidateUpdatePatch)
              .eq("id", existingCandidate.id);
            if (updErr) return NextResponse.json({ error: "CANDIDATE_UPDATE_FAILED" }, { status: 500 });

            try {
              await replaceCandidateContacts(admin, {
                candidateId: existingCandidate.id,
                contacts: extractedContacts,
                nowIso,
              });
            } catch {
              return NextResponse.json(
                { error: "CANDIDATE_CONTACTS_UPDATE_FAILED", message: "Не удалось обновить контакты кандидата. Попробуйте синхронизацию ещё раз." },
                { status: 500 },
              );
            }
            updated++;
            continue;
          }
        }

        const { data: createdCandidate, error: insErr } = await admin
          .from("candidates")
          .insert({
            ...candidateUpdatePatch,
            vacancy_id: vac.id,
            created_by: ctx.userId,
            source: "hh.ru",
            status: "new",
            hhru_resume_id: resumeId,
            created_at: nowIso,
          })
          .select("id")
          .single();

        if (insErr) {
          const code = (insErr as any)?.code;
          // 23505 = unique_violation (we created partial unique index on (vacancy_id, hhru_resume_id))
          if (code === "23505") {
            const { data: existingCandidate, error: existingErr } = await admin
              .from("candidates")
              .select("id")
              .eq("vacancy_id", vac.id)
              .eq("hhru_resume_id", resumeId)
              .maybeSingle();
            if (existingErr) return NextResponse.json({ error: "CANDIDATE_LOOKUP_FAILED" }, { status: 500 });
            if (existingCandidate?.id) {
              if (mode === "new_and_update") {
                const { error: updErr } = await admin
                  .from("candidates")
                  .update(candidateUpdatePatch)
                  .eq("id", existingCandidate.id);
                if (updErr) return NextResponse.json({ error: "CANDIDATE_UPDATE_FAILED" }, { status: 500 });
                try {
                  await replaceCandidateContacts(admin, {
                    candidateId: existingCandidate.id,
                    contacts: extractedContacts,
                    nowIso,
                  });
                } catch {
                  return NextResponse.json(
                    { error: "CANDIDATE_CONTACTS_UPDATE_FAILED", message: "Не удалось обновить контакты кандидата. Попробуйте синхронизацию ещё раз." },
                    { status: 500 },
                  );
                }
                updated++;
                continue;
              }

              const candidateNewOnlyDuplicatePatch = {
                hh_auto_survey_text: hhAutoSurveyText,
                updated_at: nowIso,
                ...desiredSalaryWritePatch,
              };
              const { error: updErr } = await admin
                .from("candidates")
                .update(candidateNewOnlyDuplicatePatch)
                .eq("id", existingCandidate.id);
              if (updErr) return NextResponse.json({ error: "CANDIDATE_UPDATE_FAILED" }, { status: 500 });
              updated++;
              continue;
            }
            skipped++;
            continue;
          }
          return NextResponse.json({ error: "CANDIDATE_INSERT_FAILED" }, { status: 500 });
        }

        if (createdCandidate?.id && extractedContacts.length > 0) {
          try {
            await replaceCandidateContacts(admin, {
              candidateId: createdCandidate.id,
              contacts: extractedContacts,
              nowIso,
            });
          } catch (e) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[hh-sync] candidate_contacts insert failed", {
                candidateId: createdCandidate.id,
                count: extractedContacts.length,
                error: e instanceof Error ? e.message : "unknown",
              });
            }
            return NextResponse.json(
              { error: "CANDIDATE_CONTACTS_INSERT_FAILED", message: "Не удалось сохранить контакты кандидата. Попробуйте синхронизацию ещё раз." },
              { status: 500 },
            );
          }
        }

        if (createdCandidate?.id) {
          const { error: pipelineEventErr } = await (admin as any).from("pipeline_events").insert({
            company_id: ctx.companyId,
            candidate_id: createdCandidate.id,
            vacancy_id: vac.id,
            actor_id: ctx.userId,
            from_status: null,
            to_status: "new",
            event_type: "candidate_created",
            occurred_at: appliedAt,
            metadata: {
              source: "hh.ru",
              route: "hh_candidate_sync",
              hhru_resume_id: resumeId,
            },
          });
          if (pipelineEventErr) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[hh-sync] pipeline event insert failed", {
                candidateId: createdCandidate.id,
                code: (pipelineEventErr as { code?: unknown })?.code,
              });
            }
            return NextResponse.json({ error: "PIPELINE_EVENT_CREATE_FAILED" }, { status: 500 });
          }
        }

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
        sync_type: "candidates",
        vacancies_processed: vacs.length,
        candidates_created: created,
        candidates_updated: updated,
        skipped,
        mode,
      },
    });

    if (created > 0) {
      await captureBusinessEvent({
        event: "candidate_imported_hh",
        userId: ctx.userId,
        companyId: ctx.companyId,
        role: ctx.role,
        properties: {
          source: "hh.ru",
          candidates_created: created,
          candidates_updated: updated,
          skipped,
        },
      });
    }

    return NextResponse.json({ ok: true, created, updated, skipped, mode }, { status: 200 });
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

    const msg = e instanceof Error ? e.message : null;
    const knownMessages: Record<string, string> = {
      HH_NOT_CONNECTED: "Подключите hh.ru и попробуйте снова.",
      HH_SETTINGS_MISSING: "Проверьте настройки интеграции hh.ru.",
      HH_TOKEN_MISSING: "Подключите hh.ru заново и попробуйте снова.",
      HH_REFRESH_TOKEN_MISSING: "Подключите hh.ru заново и попробуйте снова.",
    };
    if (msg && knownMessages[msg]) {
      return NextResponse.json({ error: msg, message: knownMessages[msg] }, { status: 400 });
    }
    return NextResponse.json(
      { error: "HH_SYNC_FAILED", message: "Не удалось синхронизировать кандидатов. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
