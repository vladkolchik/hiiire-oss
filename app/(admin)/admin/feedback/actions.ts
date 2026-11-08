"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { mapFeedbackValidationIssues, FeedbackAdminUpdateSchema } from "@/lib/feedback/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type FeedbackAdminActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function nullableFormString(formData: FormData, key: string) {
  const value = formString(formData, key);
  return value.length ? value : null;
}

function adminClassValue(formData: FormData) {
  const value = formString(formData, "adminClass");
  if (!value || value === "__none") return null;
  return value;
}

export async function updateFeedbackStatusAction(
  _prev: FeedbackAdminActionState,
  formData: FormData
): Promise<FeedbackAdminActionState> {
  const { user, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const parsed = FeedbackAdminUpdateSchema.safeParse({
    feedbackId: formString(formData, "feedbackId"),
    status: formString(formData, "status"),
    adminClass: adminClassValue(formData),
    adminNote: nullableFormString(formData, "adminNote"),
    externalUrl: nullableFormString(formData, "externalUrl"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: mapFeedbackValidationIssues(parsed.error)[0]?.message ?? "Проверьте поля и попробуйте ещё раз.",
    };
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("feedback")
    .update({
      status: parsed.data.status,
      admin_class: parsed.data.adminClass ?? null,
      admin_note: parsed.data.adminNote ?? null,
      external_url: parsed.data.externalUrl ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.feedbackId);

  if (error) {
    return { status: "error", message: "Не удалось обновить обращение. Попробуйте ещё раз." };
  }

  revalidatePath("/admin/feedback");
  return { status: "success", message: "Обращение обновлено" };
}
