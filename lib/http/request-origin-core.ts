import type { NextRequest } from "next/server";

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstHeaderValue(value: string | null) {
  if (!value) return null;
  return value.split(",")[0]?.trim() ?? null;
}

export function getRequestOrigin(req: NextRequest) {
  const explicit = readEnv("APP_ORIGIN", "NEXT_PUBLIC_APP_ORIGIN", "NEXT_PUBLIC_SITE_URL");
  if (explicit) return explicit.replace(/\/+$/, "");

  const forwardedProto = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(req.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = forwardedProto ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
