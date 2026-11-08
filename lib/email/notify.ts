import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/client";
import { getEmailOwnerRecipients } from "@/lib/email/env";
import type { EmailContent } from "@/lib/email/format";

type SendStats = { attempted: number; sent: number; failed: number };

function isReasonableEmail(value: unknown): value is string {
  return typeof value === "string" && value.includes("@") && !/\s/.test(value) && value.length <= 320;
}

export async function notifyOwnersByEmail(content: EmailContent): Promise<SendStats> {
  const recipients = getEmailOwnerRecipients();
  if (!recipients.length) return { attempted: 0, sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    recipients.map((to) => sendEmail({ to, subject: content.subject, text: content.text, html: content.html }))
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { attempted: recipients.length, sent, failed: recipients.length - sent };
}

export async function getCompanyAdminEmails(companyId: string): Promise<string[]> {
  const admin = getSupabaseAdminClient();

  const { data: admins, error: adminsErr } = await admin
    .from("profiles")
    .select("id,email")
    .eq("company_id", companyId)
    .eq("role", "admin");
  if (adminsErr) throw new Error(`EMAIL_RECIPIENTS_LOOKUP_FAILED profiles: ${adminsErr.message}`);

  const userIds = (admins ?? []).map((a) => a.id);
  if (!userIds.length) return [];

  const { data: prefs, error: prefsErr } = await admin
    .from("email_notification_settings")
    .select("user_id,email_enabled")
    .in("user_id", userIds);
  if (prefsErr) throw new Error(`EMAIL_RECIPIENTS_LOOKUP_FAILED email_notification_settings: ${prefsErr.message}`);

  const enabledByUserId = new Map<string, boolean>((prefs ?? []).map((p) => [p.user_id as string, Boolean((p as any).email_enabled)]));
  const enabledUserIds = userIds.filter((id) => enabledByUserId.get(id) !== false); // missing row => enabled by default
  if (!enabledUserIds.length) return [];

  const emails: string[] = [];
  for (const row of admins ?? []) {
    if (!enabledUserIds.includes(row.id)) continue;
    if (isReasonableEmail((row as any).email)) emails.push(String((row as any).email));
  }

  // Deduplicate
  return Array.from(new Set(emails));
}

export async function notifyCompanyAdminsByEmail(companyId: string, content: EmailContent): Promise<SendStats> {
  const emails = await getCompanyAdminEmails(companyId);
  if (!emails.length) return { attempted: 0, sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    emails.map((to) => sendEmail({ to, subject: content.subject, text: content.text, html: content.html }))
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { attempted: emails.length, sent, failed: emails.length - sent };
}

export async function listAllEnabledEmails(): Promise<string[]> {
  const admin = getSupabaseAdminClient();

  const pageSize = 1000;
  const all: string[] = [];

  for (let offset = 0; offset < 200_000; offset += pageSize) {
    const { data: page, error } = await admin.from("profiles").select("id,email").range(offset, offset + pageSize - 1);
    if (error) throw new Error(`EMAIL_LIST_RECIPIENTS_FAILED profiles: ${error.message}`);
    if (!page || page.length === 0) break;

    const userIds = page.map((p) => p.id);

    const { data: prefs, error: prefsErr } = await admin
      .from("email_notification_settings")
      .select("user_id,email_enabled")
      .in("user_id", userIds);
    if (prefsErr) throw new Error(`EMAIL_LIST_RECIPIENTS_FAILED email_notification_settings: ${prefsErr.message}`);

    const enabledByUserId = new Map<string, boolean>((prefs ?? []).map((p) => [p.user_id as string, Boolean((p as any).email_enabled)]));

    for (const row of page) {
      const enabled = enabledByUserId.get(row.id) !== false; // missing row => enabled by default
      if (!enabled) continue;
      if (isReasonableEmail((row as any).email)) all.push(String((row as any).email));
    }
  }

  return Array.from(new Set(all));
}

