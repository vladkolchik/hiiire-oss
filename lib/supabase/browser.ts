"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

export function createSupabaseBrowserClient() {
  /**
   * IMPORTANT:
   * In Next.js client bundles, env vars are only inlined for direct access like
   * `process.env.NEXT_PUBLIC_*`. Dynamic access `process.env[name]` won't work.
   */
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

