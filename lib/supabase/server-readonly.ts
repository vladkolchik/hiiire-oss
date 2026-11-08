import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * Server client for Server Components (cookies are read-only there).
 * This client should be used for auth checks / reads only.
 */
export async function createSupabaseServerClientReadonly() {
  const cookieStore = await cookies();

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // No-op in Server Components (cookies read-only). Supabase may call setAll
      // on session refresh; we ignore to avoid "Cookies can only be modified..."
      setAll() {},
    },
  });
}

