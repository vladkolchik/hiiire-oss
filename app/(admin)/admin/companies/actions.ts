"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; userId: string; companyId: string };

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asInt(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export async function createCompanyWithAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const supabaseAdmin = getSupabaseAdminClient();

  const companyName = asString(formData, "companyName");
  const adminName = asString(formData, "adminName");
  const adminEmail = asString(formData, "adminEmail").toLowerCase();
  const password = asString(formData, "password");
  const initialCredits = asInt(formData, "initialCredits") ?? 0;

  if (!companyName) return { status: "error", message: "Укажи название компании" };
  if (!adminEmail) return { status: "error", message: "Укажи email администратора" };
  if (!password || password.length < 8) return { status: "error", message: "Пароль должен быть не короче 8 символов" };

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: {
      name: adminName || adminEmail,
      company_name: companyName,
    },
  });

  if (createError || !created.user) {
    return { status: "error", message: createError?.message ?? "Не удалось создать пользователя" };
  }

  const userId = created.user.id;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  const companyId = (profile as unknown as { company_id: string | null } | null)?.company_id ?? null;

  if (profileError || !companyId) {
    return { status: "error", message: "Пользователь создан, но не найден профиль/компания (проверь trigger handle_new_user)" };
  }

  if (initialCredits > 0) {
    const { error: ledgerError } = await supabaseAdmin.from("credit_ledger").insert({
      company_id: companyId,
      delta: initialCredits,
      reason: "grant",
      created_by: user.id,
      notes: "Initial grant (platform admin)",
    });

    if (ledgerError) {
      return { status: "error", message: `Компания создана, но не удалось начислить credits: ${ledgerError.message}` };
    }
  }

  revalidatePath("/admin/companies");
  revalidatePath("/admin/users");
  revalidatePath("/admin/credits");
  revalidatePath("/admin");

  return { status: "success", message: "Компания и админ-пользователь созданы", userId, companyId };
}

