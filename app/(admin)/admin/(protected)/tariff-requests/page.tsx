import { TariffRequestsTable } from "../../tariff-requests/tariff-requests-table";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";

const TARIFF_REQUESTS_LOAD_ERROR = "Не удалось загрузить заявки. Обновите страницу или попробуйте позже.";

type LeadRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  company: string;
  company_size: string | null;
  message: string | null;
  requested_plan: "starter" | "professional" | "enterprise";
  status: "new" | "contacted" | "qualified" | "rejected";
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
  decision_note: string | null;
};

export default async function AdminTariffRequestsPage() {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const supabaseAdmin = getSupabaseAdminClient();

  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id,full_name,email,phone,company,company_size,message,requested_plan,status,created_at,handled_at,handled_by,decision_note")
    .eq("requested_plan", "enterprise")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (leads ?? []) as LeadRow[];

  const handlerIds = Array.from(new Set(rows.map((r) => r.handled_by).filter((id): id is string => Boolean(id))));
  const { data: handlers } = handlerIds.length
    ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", handlerIds)
    : { data: [] as Array<{ id: string; name: string | null; email: string | null }> };

  const handlerById = new Map<string, { name: string | null; email: string | null }>(
    ((handlers ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((p) => [p.id, { name: p.name, email: p.email }])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Enterprise заявки</h1>
        <p className="text-muted-foreground">
          Заявки на Enterprise с лендинга: CTA Enterprise открывают /request-access, здесь отображаются отправленные
          контакты.
        </p>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ошибка</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive">{TARIFF_REQUESTS_LOAD_ERROR}</CardContent>
        </Card>
      ) : (
        <TariffRequestsTable rows={rows} handlerById={Object.fromEntries(handlerById)} />
      )}
    </div>
  );
}
