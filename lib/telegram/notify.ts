import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { getTelegramOwnerChatIds } from "@/lib/telegram/env";

export async function notifyOwners(text: string): Promise<{ attempted: number; sent: number; failed: number }> {
  const chatIds = getTelegramOwnerChatIds();
  if (!chatIds.length) return { attempted: 0, sent: 0, failed: 0 };

  const results = await Promise.allSettled(chatIds.map((chatId) => sendTelegramMessage({ chatId, text })));
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { attempted: chatIds.length, sent, failed: chatIds.length - sent };
}

export async function getCompanyAdminChatIds(companyId: string): Promise<number[]> {
  const admin = getSupabaseAdminClient();

  const { data: admins, error: adminsErr } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "admin");
  if (adminsErr) throw new Error(`TELEGRAM_RECIPIENTS_LOOKUP_FAILED profiles: ${adminsErr.message}`);

  const userIds = (admins ?? []).map((a) => a.id);
  if (!userIds.length) return [];

  const { data: prefs, error: prefsErr } = await admin
    .from("telegram_notification_settings")
    .select("user_id,telegram_enabled")
    .in("user_id", userIds);
  if (prefsErr) throw new Error(`TELEGRAM_RECIPIENTS_LOOKUP_FAILED telegram_notification_settings: ${prefsErr.message}`);

  const enabledByUserId = new Map<string, boolean>((prefs ?? []).map((p) => [p.user_id as string, Boolean((p as any).telegram_enabled)]));
  const enabledUserIds = userIds.filter((id) => enabledByUserId.get(id) !== false); // missing row => enabled by default
  if (!enabledUserIds.length) return [];

  const { data: links, error: linksErr } = await admin
    .from("telegram_user_links")
    .select("chat_id,user_id")
    .in("user_id", enabledUserIds);
  if (linksErr) throw new Error(`TELEGRAM_RECIPIENTS_LOOKUP_FAILED telegram_user_links: ${linksErr.message}`);

  const chatIds: number[] = [];
  for (const row of links ?? []) {
    if (typeof row.chat_id === "number" && Number.isSafeInteger(row.chat_id)) chatIds.push(row.chat_id);
  }
  return chatIds;
}

export async function notifyCompanyAdmins(companyId: string, text: string): Promise<{ attempted: number; sent: number; failed: number }> {
  const chatIds = await getCompanyAdminChatIds(companyId);
  if (!chatIds.length) return { attempted: 0, sent: 0, failed: 0 };

  const results = await Promise.allSettled(chatIds.map((chatId) => sendTelegramMessage({ chatId, text })));
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { attempted: chatIds.length, sent, failed: chatIds.length - sent };
}

export async function listAllTelegramChatIds(): Promise<number[]> {
  const admin = getSupabaseAdminClient();
  const chatIds: number[] = [];

  // Simple pagination: ranges of 1000.
  const pageSize = 1000;
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await admin.from("telegram_user_links").select("chat_id").range(offset, offset + pageSize - 1);
    if (error) throw new Error(`TELEGRAM_LIST_CHAT_IDS_FAILED: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (typeof row.chat_id === "number" && Number.isSafeInteger(row.chat_id)) chatIds.push(row.chat_id);
    }
  }

  // Deduplicate
  return Array.from(new Set(chatIds));
}

