import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { loadVisibleCalendarSnapshot } from "@/lib/interviews/calendar-snapshot";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function parseDateBound(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function parseRequiredRange(req: NextRequest): { from: string; to: string } | NextResponse {
  const url = new URL(req.url);
  const from = parseDateBound(url.searchParams.get("from"));
  const to = parseDateBound(url.searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json(
      { error: "INVALID_RANGE", message: "Выберите период календаря." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (days <= 0 || days > 45) {
    return NextResponse.json(
      { error: "INVALID_RANGE", message: "Выберите период календаря до 45 дней." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  return { from, to };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }

    const range = parseRequiredRange(req);
    if (range instanceof NextResponse) return range;

    const { version } = await loadVisibleCalendarSnapshot(admin, ctxRes.data, range);
    const checkedAt = new Date().toISOString();
    return NextResponse.json({ version, checkedAt }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "INTERVIEW_LOOKUP_FAILED", message: "Не удалось проверить изменения календаря." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
