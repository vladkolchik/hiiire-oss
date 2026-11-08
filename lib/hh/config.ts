import "server-only";

import { headers } from "next/headers";

function readEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function requireHhClientId(): string {
  const v = readEnv("HH_ru_client_id", "HH_RU_CLIENT_ID", "HH_CLIENT_ID");
  if (!v) throw new Error("Missing HH client id env (HH_ru_client_id)");
  return v;
}

export function requireHhClientSecret(): string {
  const v = readEnv("HH_ru_client_secret", "HH_RU_CLIENT_SECRET", "HH_CLIENT_SECRET");
  if (!v) throw new Error("Missing HH client secret env (HH_ru_client_secret)");
  return v;
}

export function getHhDefaultHost(): string {
  // HH API uses `host` to select site; default to hh.ru.
  return readEnv("HH_RU_HOST", "HH_HOST") ?? "hh.ru";
}

export function getHhUserAgent(): string {
  // HH recommends `HH-User-Agent` header. Keep overrideable.
  return readEnv("HH_USER_AGENT") ?? "hiiire.com (hhru integration)";
}

export async function getHhRedirectUri(): Promise<string> {
  const explicit = readEnv("HH_RU_REDIRECT_URI", "HH_REDIRECT_URI");
  if (explicit) return explicit;

  // Best-effort: infer current origin in route handlers.
  // Note: this relies on the incoming request headers.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/integrations/hh/callback`;
}

