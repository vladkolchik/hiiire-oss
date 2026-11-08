import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type PlatformSummary = {
  companies: number;
  users: number;
  vacancies: number;
  candidates: number;
  aiRequests: number;
};

type SummaryMetric = keyof PlatformSummary;
type CountClient = {
  from(table: string): {
    select(columns: "*", options: { count: "exact"; head: true }): PromiseLike<{ count: number | null; error: unknown }>;
  };
};

const SUMMARY_TABLES: Array<{ key: SummaryMetric; table: string }> = [
  { key: "companies", table: "companies" },
  { key: "users", table: "profiles" },
  { key: "vacancies", table: "vacancies" },
  { key: "candidates", table: "candidates" },
  { key: "aiRequests", table: "ai_analyses" },
];

async function countTable(supabaseAdmin: CountClient, table: string) {
  const { count, error } = await supabaseAdmin.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function loadPlatformSummaryFromClient(supabaseAdmin: CountClient): Promise<PlatformSummary> {
  const entries = await Promise.all(SUMMARY_TABLES.map(async ({ key, table }) => [key, await countTable(supabaseAdmin, table)] as const));
  return Object.fromEntries(entries) as PlatformSummary;
}

export async function loadPlatformSummary(): Promise<PlatformSummary> {
  return loadPlatformSummaryFromClient(getSupabaseAdminClient());
}
