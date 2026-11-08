import { redirect } from "next/navigation";

import { HrAssistantClient } from "@/components/dashboard/hr-assistant/hr-assistant-client";
import { HrAssistantPlanAccessPlaceholder } from "@/components/dashboard/hr-assistant/plan-access-placeholder";
import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { loadHrAssistantPlanAccess } from "@/lib/hr-assistant/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClientReadonly } from "@/lib/supabase/server-readonly";

export const metadata = {
  title: "HR-ассистент",
};

export default async function HrAssistantPage() {
  const supabase = await createSupabaseServerClientReadonly();
  const authRes = await getConfirmedServerUser(supabase);
  if (!authRes.ok) {
    redirect(authRes.reason === "pending_email" ? "/verify-email" : "/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", authRes.user.id)
    .maybeSingle();

  if (profileError || !profile?.company_id) {
    redirect("/dashboard/settings");
  }

  const access = await loadHrAssistantPlanAccess(getSupabaseAdminClient(), profile.company_id);
  if (!access.allowed) {
    return <HrAssistantPlanAccessPlaceholder access={access} />;
  }

  return <HrAssistantClient />;
}
