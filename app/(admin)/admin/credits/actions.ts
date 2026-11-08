"use server";

import { revalidatePath } from "next/cache";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyCompanyAdmins } from "@/lib/telegram/notify";
import { formatClientCreditsGrantedMessage } from "@/lib/telegram/format";
import { notifyCompanyAdminsByEmail } from "@/lib/email/notify";
import { formatClientCreditsGrantedEmail } from "@/lib/email/format";

type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function adjustCreditsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const supabaseAdmin = getSupabaseAdminClient();

  const companyId = asString(formData, "companyId");
  const deltaRaw = asString(formData, "delta");
  const reasonRaw = asString(formData, "reason");
  const notes = asString(formData, "notes");

  const delta = Number(deltaRaw);
  if (!companyId) return { status: "error", message: "Выбери компанию" };
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    return { status: "error", message: "Delta должна быть целым числом (не 0)" };
  }
  if (!["grant", "manual_adjustment", "refund"].includes(reasonRaw)) {
    return { status: "error", message: "Некорректная причина" };
  }
  const reason = reasonRaw as "grant" | "manual_adjustment" | "refund";

  const { error } = await supabaseAdmin.from("credit_ledger").insert({
    company_id: companyId,
    delta,
    reason,
    created_by: user.id,
    notes: notes || null,
  });

  if (error) return { status: "error", message: error.message };

  // Best-effort: notify company admins about credits grant (only for positive delta).
  if (delta > 0) {
    await captureBusinessEvent({
      event: "credits_granted",
      userId: user.id,
      companyId,
      role: "platform_admin",
      properties: {
        credits: delta,
        reason,
        source: "manual_admin",
      },
    });

    try {
      const { data: companyRow } = await supabaseAdmin.from("companies").select("name").eq("id", companyId).maybeSingle();
      const text = formatClientCreditsGrantedMessage({
        companyName: String(companyRow?.name ?? "Компания"),
        delta,
        reason,
      });
      await notifyCompanyAdmins(companyId, text);
    } catch {
      // ignore
    }

    try {
      const { data: companyRow } = await supabaseAdmin.from("companies").select("name").eq("id", companyId).maybeSingle();
      const content = formatClientCreditsGrantedEmail({
        companyName: String(companyRow?.name ?? "Компания"),
        delta,
        reason,
      });
      await notifyCompanyAdminsByEmail(companyId, content);
    } catch {
      // ignore
    }
  }

  revalidatePath("/admin/credits");
  revalidatePath("/admin/companies");
  revalidatePath("/admin");
  return { status: "success", message: "Credits обновлены" };
}
