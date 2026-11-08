import { redirect } from "next/navigation";

import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClientReadonly } from "@/lib/supabase/server-readonly";

export async function requirePlatformAdmin() {
  const supabase = await createSupabaseServerClientReadonly();
  const authRes = await getConfirmedServerUser(supabase);

  if (!authRes.ok) {
    if (authRes.reason === "pending_email") {
      redirect("/verify-email");
    }
    redirect("/admin/login");
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: row, error: adminError } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", authRes.user.id)
    .maybeSingle();

  if (adminError || !row) {
    return { user: authRes.user, isPlatformAdmin: false as const };
  }

  return { user: authRes.user, isPlatformAdmin: true as const };
}
