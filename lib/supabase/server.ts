import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function isReadonlyCookiesError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Cookies can only be modified");
}

/**
 * Server client that can READ + WRITE auth cookies.
 *
 * Use this ONLY in Route Handlers and Server Actions.
 * In Server Components where cookies are read-only, use `createSupabaseServerClientReadonly()`.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options);
          } catch (error) {
            if (isReadonlyCookiesError(error)) {
              return;
            }
            throw error;
          }
        }
      },
    },
  });
}
