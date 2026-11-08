import { BillingAdminTabs } from "../../billing/billing-admin-tabs";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { toEnterpriseAgreementResponse, type EnterpriseAgreementRow } from "@/lib/billing/enterprise-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type EnterpriseLeadRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "company"
  | "company_size"
  | "message"
  | "requested_plan"
  | "status"
  | "created_at"
  | "handled_at"
  | "handled_by"
  | "decision_note"
>;

type PlanChangeRequestRow = Database["public"]["Tables"]["billing_plan_change_requests"]["Row"] & {
  companyName?: string | null;
};

type ManualInvoiceRow = Database["public"]["Tables"]["billing_manual_invoices"]["Row"] & {
  companyName?: string | null;
};

type CompanyJoin = { companies?: { name?: string | null } | null };

function getLoadError(errors: unknown[]) {
  return errors.some(Boolean) ? "Не удалось загрузить часть данных биллинга. Обновите страницу или попробуйте позже." : null;
}

export default async function AdminBillingPage() {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const supabaseAdmin = getSupabaseAdminClient();
  const [leadsResult, requestsResult, agreementsResult, activeAgreementsResult, invoicesResult] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id,full_name,email,phone,company,company_size,message,requested_plan,status,created_at,handled_at,handled_by,decision_note")
      .eq("requested_plan", "enterprise")
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("billing_plan_change_requests")
      .select("*,companies(name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("enterprise_agreements")
      .select("*,companies(name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("enterprise_agreements")
      .select("*,companies(name)")
      .eq("status", "active"),
    supabaseAdmin
      .from("billing_manual_invoices")
      .select("*,companies(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const enterpriseAgreements = (
    (agreementsResult.data ?? []) as Array<EnterpriseAgreementRow & { companies?: { name?: string | null } | null }>
  ).map((row) => toEnterpriseAgreementResponse(row, row.companies?.name ?? null));
  const activeEnterpriseAgreements = (
    (activeAgreementsResult.data ?? []) as Array<EnterpriseAgreementRow & { companies?: { name?: string | null } | null }>
  ).map((row) => toEnterpriseAgreementResponse(row, row.companies?.name ?? null));
  const planChangeRequests = (
    (requestsResult.data ?? []) as Array<Database["public"]["Tables"]["billing_plan_change_requests"]["Row"] & CompanyJoin>
  ).map(({ companies, ...row }) => ({ ...row, companyName: companies?.name ?? null }));
  const manualInvoices = (
    (invoicesResult.data ?? []) as Array<Database["public"]["Tables"]["billing_manual_invoices"]["Row"] & CompanyJoin>
  ).map(({ companies, ...row }) => ({ ...row, companyName: companies?.name ?? null }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Enterprise Billing</h1>
        <p className="text-sm text-muted-foreground">Заявки, условия Enterprise и ручные счета.</p>
      </div>

      <BillingAdminTabs
        enterpriseLeads={(leadsResult.data ?? []) as EnterpriseLeadRow[]}
        planChangeRequests={planChangeRequests as PlanChangeRequestRow[]}
        enterpriseAgreements={enterpriseAgreements}
        activeEnterpriseAgreements={activeEnterpriseAgreements}
        manualInvoices={manualInvoices as ManualInvoiceRow[]}
        loadError={getLoadError([
          leadsResult.error,
          requestsResult.error,
          agreementsResult.error,
          activeAgreementsResult.error,
          invoicesResult.error,
        ])}
      />
    </div>
  );
}
