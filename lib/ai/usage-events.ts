import "server-only";

import type { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdminClient>;

export type AiUsageEventInput = {
  companyId: string;
  userId: string;
  candidateId?: string | null;
  requestId: string;
  task: "candidate_profile_parse";
  provider: "deepseek";
  model: string;
  status: "success" | "fallback" | "failed";
  fallbackReason?: string | null;
  attempts: number;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number;
};

function safeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function safeNullableText(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function safeNonNegativeInteger(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function safeRequiredNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export async function recordAiUsageEventBestEffort(admin: SupabaseAdmin, input: AiUsageEventInput): Promise<void> {
  try {
    const { error } = await admin.from("ai_usage_events").insert({
      company_id: input.companyId,
      user_id: input.userId,
      candidate_id: input.candidateId ?? null,
      request_id: safeText(input.requestId, 120),
      task: input.task,
      provider: input.provider,
      model: safeText(input.model, 120),
      status: input.status,
      fallback_reason: safeNullableText(input.fallbackReason, 120),
      attempts: safeRequiredNonNegativeInteger(input.attempts),
      tokens_in: safeNonNegativeInteger(input.tokensIn),
      tokens_out: safeNonNegativeInteger(input.tokensOut),
      duration_ms: safeRequiredNonNegativeInteger(input.durationMs),
    });

    if (error && process.env.NODE_ENV !== "production") {
      console.warn("[ai_usage_events] insert failed", { code: (error as { code?: unknown }).code });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ai_usage_events] insert threw", { name: error instanceof Error ? error.name : "unknown" });
    }
  }
}
