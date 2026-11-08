import { NextResponse } from "next/server";

import { hasPendingEmailConfirmation } from "@/lib/auth/email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "hr" | "recruiter";

function validRole(value: unknown): Role {
  return value === "admin" || value === "hr" || value === "recruiter" ? value : "recruiter";
}

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || hasPendingEmailConfirmation(data.user)) {
      return NextResponse.json({ user: null }, { status: 200, headers: noStoreHeaders });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,name,role,company_id,created_at")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) {
      return NextResponse.json(
        { error: "PROFILE_LOOKUP_FAILED", message: "Не удалось загрузить профиль. Обновите страницу." },
        { status: 500, headers: noStoreHeaders }
      );
    }

    let companyName: string | null = null;
    if (profile?.company_id) {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("name")
        .eq("id", profile.company_id)
        .maybeSingle();
      if (companyError) {
        return NextResponse.json(
          { error: "COMPANY_LOOKUP_FAILED", message: "Не удалось загрузить компанию. Обновите страницу." },
          { status: 500, headers: noStoreHeaders }
        );
      }
      companyName = company?.name ?? null;
    }

    const userMetadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const metadataCompany = typeof userMetadata.company_name === "string" ? userMetadata.company_name : null;
    const email = profile?.email ?? data.user.email ?? "";

    return NextResponse.json(
      {
        user: {
          id: data.user.id,
          email,
          name:
            profile?.name ??
            (typeof userMetadata.name === "string" ? userMetadata.name : null) ??
            data.user.email ??
            "Пользователь",
          phone: typeof userMetadata.phone === "string" ? userMetadata.phone : undefined,
          company: companyName ?? metadataCompany ?? "Компания",
          companyId: profile?.company_id ?? undefined,
          role: validRole(profile?.role),
          avatar: undefined,
          createdAt: profile?.created_at ?? new Date().toISOString(),
        },
      },
      { status: 200, headers: noStoreHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось загрузить сессию. Обновите страницу." },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
