import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };
const MAX_PROFILE_IDS = 200;
const ProfileIdSchema = z.string().uuid();

type ProfileLiteRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "hr" | "recruiter" | null;
};

function parseProfileIds(value: string | null): { ok: true; ids: string[] } | { ok: false; message: string } {
  const ids = Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) return { ok: false, message: "Выберите сотрудников и попробуйте ещё раз." };
  if (ids.length > MAX_PROFILE_IDS) return { ok: false, message: "Выберите не больше 200 сотрудников за один запрос." };
  if (ids.some((id) => !ProfileIdSchema.safeParse(id).success)) {
    return { ok: false, message: "Проверьте выбранных сотрудников и попробуйте ещё раз." };
  }

  return { ok: true, ids };
}

function mapProfile(row: ProfileLiteRow) {
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    role: row.role ?? "recruiter",
  };
}

export async function GET(req: NextRequest) {
  try {
    const parsedIds = parseProfileIds(req.nextUrl.searchParams.get("ids"));
    if (!parsedIds.ok) {
      return NextResponse.json(
        { error: "INVALID_IDS", message: parsedIds.message },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }

    const visibleIds = ctxRes.data.role === "admin" ? parsedIds.ids : parsedIds.ids.filter((id) => id === ctxRes.data.userId);
    if (visibleIds.length === 0) {
      return NextResponse.json({ profiles: [] }, { status: 200, headers: noStoreHeaders });
    }

    const { data, error } = await admin
      .from("profiles")
      .select("id,name,email,role")
      .eq("company_id", ctxRes.data.companyId)
      .in("id", visibleIds);

    if (error) {
      return NextResponse.json(
        { error: "PROFILES_LOOKUP_FAILED", message: "Не удалось загрузить сотрудников. Обновите страницу." },
        { status: 500, headers: noStoreHeaders }
      );
    }

    return NextResponse.json(
      { profiles: ((data ?? []) as ProfileLiteRow[]).map(mapProfile) },
      { status: 200, headers: noStoreHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось загрузить сотрудников. Обновите страницу." },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
