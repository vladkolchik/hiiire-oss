import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthRedirectPath } from "@/lib/auth/email-confirmation";

function getSupabaseHost(supabaseUrl: string): string | null {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
}

function pickErrorMeta(error: unknown) {
  if (!(error instanceof Error)) {
    return { errorType: typeof error };
  }

  const err = error as Error & {
    code?: string;
    status?: number;
    cause?: unknown;
  };

  const cause =
    err.cause && typeof err.cause === "object"
      ? (err.cause as { name?: string; code?: string; message?: string })
      : null;

  return {
    errorName: err.name,
    errorMessage: err.message,
    errorCode: err.code,
    errorStatus: err.status,
    causeName: cause?.name,
    causeCode: cause?.code,
    causeMessage: cause?.message,
    isConnectTimeout: err.message.includes("Connect Timeout Error") || cause?.code === "UND_ERR_CONNECT_TIMEOUT",
  };
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const supabaseHost = getSupabaseHost(supabaseUrl);
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null = null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn("[supabase-proxy] auth.getUser returned error", {
        pathname,
        method: request.method,
        protectedRoute: isDashboardRoute,
        supabaseHost,
        status: (error as { status?: number }).status,
        code: (error as { code?: string }).code,
        name: (error as { name?: string }).name,
        message: error.message,
      });
    } else {
      user = data.user;
    }
  } catch (error) {
    console.error("[supabase-proxy] auth.getUser threw", {
      pathname,
      method: request.method,
      protectedRoute: isDashboardRoute,
      supabaseHost,
      ...pickErrorMeta(error),
    });

    // Network/transient auth server failure. Keep public routes accessible;
    // for protected routes, fail closed to login.
    if (isDashboardRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  const redirectPath = getAuthRedirectPath(pathname, user);
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password"],
};
