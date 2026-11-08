import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext } from "@/lib/access/company-guards";

const RowSchema = z
  .object({
    id: z.string().uuid(),
    is_active: z.boolean(),
    connected_at: z.string(),
    last_synced_at: z.string().nullable(),
    sync_started_at: z.string().nullable(),
    sync_lock_expires_at: z.string().nullable(),
    last_sync_error: z.string().nullable(),
    last_sync_error_at: z.string().nullable(),
    token_expires_at: z.string().nullable(),
    settings: z.any().nullable(),
  })
  .passthrough();

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const { data, error } = await admin
      .from("integrations_accounts")
      .select("id,is_active,connected_at,last_synced_at,sync_started_at,sync_lock_expires_at,last_sync_error,last_sync_error_at,token_expires_at,settings")
      .eq("company_id", ctx.companyId)
      .eq("user_id", ctx.userId)
      .eq("provider", "hh.ru")
      .maybeSingle();

    if (error) return NextResponse.json({ error: "LOOKUP_FAILED" }, { status: 500 });
    if (!data) return NextResponse.json({ isConnected: false }, { status: 200 });

    const parsed = RowSchema.safeParse(data);
    if (!parsed.success) return NextResponse.json({ error: "ROW_INVALID" }, { status: 500 });

    const settings = parsed.data.settings && typeof parsed.data.settings === "object" ? (parsed.data.settings as any) : {};
    const employerName = typeof settings.employer_name === "string" ? settings.employer_name : undefined;
    const host = typeof settings.host === "string" ? settings.host : undefined;
    const disconnectReason = typeof settings.disconnect_reason === "string" ? settings.disconnect_reason : undefined;
    const disconnectAt = typeof settings.disconnect_at === "string" ? settings.disconnect_at : undefined;

    return NextResponse.json(
      {
        isConnected: Boolean(parsed.data.is_active),
        connectedAt: parsed.data.connected_at,
        lastSyncedAt: parsed.data.last_synced_at ?? null,
        syncStartedAt: parsed.data.sync_started_at ?? null,
        syncLockExpiresAt: parsed.data.sync_lock_expires_at ?? null,
        lastSyncErrorAt: parsed.data.last_sync_error_at ?? null,
        hasLastSyncError: Boolean(parsed.data.last_sync_error),
        tokenExpiresAt: parsed.data.token_expires_at ?? null,
        employerName,
        host,
        disconnectReason,
        disconnectAt,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
