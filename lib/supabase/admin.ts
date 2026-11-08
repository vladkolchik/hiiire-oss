import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * Supabase admin client (service_role).
 * Server-only: NEVER import this from client components.
 */
let cached: SupabaseClient<Database> | undefined;

export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  cached = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "hiiire/admin",
      },
    },
  });

  return cached;
}

