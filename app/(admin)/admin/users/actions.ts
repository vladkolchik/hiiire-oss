"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

type MutationResult = Exclude<ActionState, { status: "idle" }>;

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createUserInCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const supabaseAdmin = getSupabaseAdminClient();

  const companyId = asString(formData, "companyId");
  const role = asString(formData, "role");
  const name = asString(formData, "name");
  const email = asString(formData, "email").toLowerCase();
  const password = asString(formData, "password");

  if (!companyId) return { status: "error", message: "Выбери компанию" };
  if (!email) return { status: "error", message: "Укажи email" };
  if (!password || password.length < 8) return { status: "error", message: "Пароль должен быть не короче 8 символов" };
  if (!["admin", "hr", "recruiter"].includes(role)) return { status: "error", message: "Некорректная роль" };

  // NOTE: provisioning_mode and provisioning_source MUST be in user_metadata, not
  // app_metadata. Supabase does not populate raw_app_meta_data during INSERT;
  // it's set in a separate UPDATE. The handle_new_user trigger runs on INSERT
  // and only sees raw_user_meta_data. See: https://github.com/supabase/auth/issues/975
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: name || email,
      company_id: companyId,
      role,
      provisioning_source: "platform_admin",
      provisioning_mode: "company_member",
    },
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/admin/companies");

  return { status: "success", message: "Пользователь создан" };
}

export async function updateUserRoleAction(userId: string, role: "admin" | "hr" | "recruiter"): Promise<MutationResult> {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const supabaseAdmin = getSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("profiles").update({ role }).eq("id", userId);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/users");
  return { status: "success", message: "Роль обновлена" };
}

export async function deleteUserAction(userId: string): Promise<MutationResult> {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const supabaseAdmin = getSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/users");
  return { status: "success", message: "Пользователь удалён" };
}
