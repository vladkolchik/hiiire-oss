import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyCompanyAdmins } from "@/lib/telegram/notify";
import { formatClientPlanExpiryMessage } from "@/lib/telegram/format";
import { notifyCompanyAdminsByEmail } from "@/lib/email/notify";
import { formatClientPlanExpiryEmail } from "@/lib/email/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

export async function POST(req: NextRequest) {
  const expected = String(process.env.CRON_SECRET ?? "");
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();

  const { data: plans, error: plansErr } = await admin
    .from("company_plans")
    .select("company_id,expires_at")
    .not("expires_at", "is", null);
  if (plansErr) return NextResponse.json({ error: "PLANS_LOOKUP_FAILED" }, { status: 500 });

  const now = new Date();
  const todayKey = dateKeyUTC(now);
  const key7 = dateKeyUTC(addDaysUTC(now, 7));
  const key1 = dateKeyUTC(addDaysUTC(now, 1));

  const byCompanyId = new Map<string, { expiresAtIso: string; kind: "expires_7d" | "expires_1d" | "expired" }>();
  for (const row of plans ?? []) {
    const expiresIso = row.expires_at as string | null;
    if (!expiresIso) continue;
    const expiresAt = new Date(expiresIso);
    if (!Number.isFinite(expiresAt.getTime())) continue;

    const expKey = dateKeyUTC(expiresAt);
    if (expKey === key7) byCompanyId.set(row.company_id as string, { expiresAtIso: expiresIso, kind: "expires_7d" });
    else if (expKey === key1) byCompanyId.set(row.company_id as string, { expiresAtIso: expiresIso, kind: "expires_1d" });
    else if (expKey <= todayKey && expiresAt.getTime() < now.getTime()) byCompanyId.set(row.company_id as string, { expiresAtIso: expiresIso, kind: "expired" });
  }

  const companyIds = Array.from(byCompanyId.keys());
  if (!companyIds.length) return NextResponse.json({ ok: true, processed: 0, notifiedCompanies: 0 }, { status: 200 });

  const { data: companies, error: companiesErr } = await admin.from("companies").select("id,name").in("id", companyIds);
  if (companiesErr) return NextResponse.json({ error: "COMPANIES_LOOKUP_FAILED" }, { status: 500 });
  const nameById = new Map((companies ?? []).map((c) => [c.id as string, String(c.name ?? "Компания")]));

  let notifiedCompanies = 0;
  for (const companyId of companyIds) {
    const item = byCompanyId.get(companyId);
    if (!item) continue;
    const companyName = nameById.get(companyId) ?? "Компания";
    const text = formatClientPlanExpiryMessage({ companyName, kind: item.kind, expiresAtIso: item.expiresAtIso });
    const res = await notifyCompanyAdmins(companyId, text).catch(() => null);
    if (res && res.sent > 0) notifiedCompanies += 1;

    // Best-effort: email notifications for the same event.
    try {
      const content = formatClientPlanExpiryEmail({ companyName, kind: item.kind, expiresAtIso: item.expiresAtIso });
      await notifyCompanyAdminsByEmail(companyId, content);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, processed: companyIds.length, notifiedCompanies }, { status: 200 });
}

