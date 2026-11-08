import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { createSupabaseServerClientReadonly } from "@/lib/supabase/server-readonly";
import { DashboardShell } from "./dashboard-shell";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClientReadonly();
  const authRes = await getConfirmedServerUser(supabase);

  if (!authRes.ok) {
    redirect(authRes.reason === "pending_email" ? "/verify-email" : "/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
