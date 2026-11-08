import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext, requireVacancyAccess } from "@/lib/access/company-guards";

const INVALID_STATUS_MESSAGE = "Выберите корректный статус вакансии.";
const VACANCY_LOOKUP_FAILED_MESSAGE = "Не удалось проверить вакансию. Попробуйте ещё раз.";
const VACANCY_STATUS_UPDATE_FAILED_MESSAGE = "Не удалось обновить статус вакансии. Попробуйте ещё раз.";
const VACANCY_CHANGED_MESSAGE = "Вакансия уже изменилась. Обновите страницу и попробуйте ещё раз.";

const BodySchema = z.object({
  status: z.enum(["draft", "active", "paused", "closed"]),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const params = await Promise.resolve(context.params);
    const vacancyId = String(params.id ?? "").trim();
    if (!vacancyId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireVacancyAccess(admin, ctx, vacancyId);
    if (!accessRes.ok) return accessRes.response;

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", message: INVALID_STATUS_MESSAGE }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const { data: existingVacancy, error: existingVacancyError } = await admin
      .from("vacancies")
      .select("status,closed_at,updated_at")
      .eq("id", vacancyId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();

    if (existingVacancyError || !existingVacancy) {
      return NextResponse.json(
        { error: "VACANCY_LOOKUP_FAILED", message: VACANCY_LOOKUP_FAILED_MESSAGE },
        { status: 500 }
      );
    }

    const { data: updated, error } = await admin
      .from("vacancies")
      .update({
        status: parsed.data.status,
        closed_at:
          parsed.data.status === "closed"
            ? existingVacancy.status === "closed" ? existingVacancy.closed_at : nowIso
            : null,
        updated_at: nowIso,
      })
      .eq("id", vacancyId)
      .eq("company_id", ctx.companyId)
      .eq("updated_at", existingVacancy.updated_at)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "VACANCY_STATUS_UPDATE_FAILED", message: VACANCY_STATUS_UPDATE_FAILED_MESSAGE },
        { status: 500 }
      );
    }
    if (!updated) {
      return NextResponse.json({ error: "VACANCY_CHANGED", message: VACANCY_CHANGED_MESSAGE }, { status: 409 });
    }

    await captureBusinessEvent({
      event: "vacancy_status_changed",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: {
        vacancy_id: vacancyId,
        status: String(updated.status),
      },
    });

    return NextResponse.json({ vacancy: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: VACANCY_STATUS_UPDATE_FAILED_MESSAGE }, { status: 500 });
  }
}
