import { FeedbackAdminTable, type FeedbackAdminRow } from "../../feedback/feedback-admin-table";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type CompanyRow = {
  id: string;
  name: string;
};

type FeedbackRow = {
  id: string;
  company_id: string;
  user_id: string;
  author_name: string | null;
  author_email: string;
  author_role: "admin" | "hr" | "recruiter";
  type: "idea" | "missing_feature" | "usability" | "question" | "other";
  sections: string[];
  message: string;
  status: "new" | "reviewed" | "in_progress" | "closed" | "deferred";
  admin_class: "bug" | "feature" | "ux" | "question" | "billing" | "data" | "integration" | "other" | null;
  admin_note: string | null;
  external_url: string | null;
  source_url: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export default async function AdminFeedbackPage() {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: feedback, error } = await supabaseAdmin
    .from("feedback")
    .select("id,company_id,user_id,author_name,author_email,author_role,type,sections,message,status,admin_class,admin_note,external_url,source_url,reviewed_by,reviewed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Обратная связь</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">
          Не удалось загрузить обращения. Попробуйте обновить страницу.
        </CardContent>
      </Card>
    );
  }

  const rows = (feedback ?? []) as FeedbackRow[];
  const companyIds = Array.from(new Set(rows.map((row) => row.company_id).filter(Boolean)));
  const { data: companies } = companyIds.length
    ? await supabaseAdmin.from("companies").select("id,name").in("id", companyIds)
    : { data: [] as CompanyRow[] };

  const companyNameById = Object.fromEntries(
    ((companies ?? []) as CompanyRow[]).map((company) => [company.id, company.name])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Обратная связь</h1>
        <p className="text-muted-foreground">Последние 200 обращений из формы обратной связи по продукту.</p>
      </div>

      <FeedbackAdminTable rows={rows as FeedbackAdminRow[]} companyNameById={companyNameById} />
    </div>
  );
}
