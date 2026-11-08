const BLOCKED_ATTRIBUTION_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/auth",
  "/dashboard",
  "/forgot-password",
  "/login",
  "/reset-password",
  "/verify-email",
];

export function isMarketingAttributionRoute(pathname: string | null | undefined) {
  if (!pathname) return false;

  return !BLOCKED_ATTRIBUTION_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
