const PROTECTED_PREFIX = "/dashboard";
const AUTH_ROUTES = new Set(["/login", "/signup", "/verify-email", "/forgot-password"]);

export type SupabaseEmailConfirmationUserLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

function hasTimestamp(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0;
}

export function isSupabaseEmailConfirmed(user: SupabaseEmailConfirmationUserLike | null | undefined) {
  if (!user) return false;
  return hasTimestamp(user.email_confirmed_at) || hasTimestamp(user.confirmed_at);
}

export function hasPendingEmailConfirmation(user: SupabaseEmailConfirmationUserLike | null | undefined) {
  if (!user) return false;
  if (typeof user.email !== "string" || user.email.length === 0) return false;
  return !isSupabaseEmailConfirmed(user);
}

export function getAuthRedirectPath(pathname: string, user: SupabaseEmailConfirmationUserLike | null | undefined) {
  const isProtectedRoute = pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`);
  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const pendingEmailConfirmation = hasPendingEmailConfirmation(user);

  if (isProtectedRoute && !user) {
    return "/login";
  }

  if (isProtectedRoute && pendingEmailConfirmation) {
    return "/verify-email";
  }

  if (!isAuthRoute || !user) {
    return null;
  }

  if (pendingEmailConfirmation) {
    return pathname === "/verify-email" ? null : "/verify-email";
  }

  return "/dashboard";
}
