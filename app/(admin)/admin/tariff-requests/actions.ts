"use server";

import { revalidatePath } from "next/cache";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

type LeadStatus = "new" | "contacted" | "qualified" | "rejected";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isLeadStatus(value: string): value is LeadStatus {
  return value === "new" || value === "contacted" || value === "qualified" || value === "rejected";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function updateEnterpriseLeadStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const leadId = asString(formData, "leadId");
  const nextStatusRaw = asString(formData, "nextStatus");
  const decisionNote = asString(formData, "decisionNote");

  if (!leadId) return { status: "error", message: "Не указан leadId" };
  if (!isLeadStatus(nextStatusRaw) || nextStatusRaw === "new") {
    return { status: "error", message: "Некорректный статус" };
  }

  const admin = getSupabaseAdminClient();

  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .select("id,status,requested_plan,email")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) return { status: "error", message: "Не удалось загрузить заявку. Попробуйте ещё раз." };
  if (!lead) return { status: "error", message: "Заявка не найдена" };
  if (lead.requested_plan !== "enterprise") {
    return { status: "error", message: "Можно обрабатывать только enterprise-заявки" };
  }

  const nextStatus = nextStatusRaw as Exclude<LeadStatus, "new">;
  if (lead.status === nextStatus) return { status: "success", message: "Статус уже установлен" };

  let matchedCompanyId: string | null = null;

  if (nextStatus === "qualified") {
    const { data: profiles, error: profileErr } = await admin
      .from("profiles")
      .select("id,email,company_id")
      .ilike("email", lead.email)
      .limit(20);

    if (profileErr) {
      return { status: "error", message: "Не удалось проверить компанию по email заявки. Попробуйте ещё раз." };
    }

    const matchedProfile =
      ((profiles ?? []) as Array<{ id: string; email: string; company_id: string | null }>).find(
        (profile) => normalizeEmail(profile.email) === normalizeEmail(lead.email) && profile.company_id
      ) ?? null;

    if (matchedProfile?.company_id) {
      matchedCompanyId = matchedProfile.company_id;
    }
  }

  const { error: updateErr } = await admin
    .from("leads")
    .update({
      status: nextStatus,
      decision_note: decisionNote || null,
      handled_by: user.id,
      handled_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (updateErr) return { status: "error", message: "Не удалось обновить заявку. Попробуйте ещё раз." };

  await captureBusinessEvent({
    event: "enterprise_request_status_changed",
    userId: user.id,
    companyId: matchedCompanyId,
    role: "platform_admin",
    properties: {
      lead_id: leadId,
      status: nextStatus,
      requested_plan: String(lead.requested_plan ?? ""),
    },
  });

  revalidatePath("/admin/tariff-requests");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");

  return {
    status: "success",
    message:
      nextStatus === "contacted"
        ? "Заявка переведена в работу"
        : nextStatus === "qualified"
        ? "Заявка квалифицирована. Подключение Enterprise оформляется в Billing через заявку и договорённость."
        : "Заявка отклонена",
  };
}
