import { sanitizePostHogUrl } from "./posthog-sanitize.ts";

export function buildPostHogCurrentUrl(origin: string, pathname: string, query: string) {
  const normalizedQuery = query.startsWith("?") ? query.slice(1) : query;
  const currentUrl = `${origin}${pathname}${normalizedQuery ? `?${normalizedQuery}` : ""}`;
  return sanitizePostHogUrl(currentUrl);
}
