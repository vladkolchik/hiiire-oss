import "server-only";

import { z } from "zod";

import {
  getHhDefaultHost,
  getHhRedirectUri,
  getHhUserAgent,
  requireHhClientId,
  requireHhClientSecret,
} from "./config";

export async function buildHhAuthorizeUrl(params?: { state?: string; redirectUri?: string; host?: string }): Promise<string> {
  const clientId = requireHhClientId();
  const redirectUri = params?.redirectUri ?? (await getHhRedirectUri());
  const state = params?.state;

  const url = new URL("https://hh.ru/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (state) url.searchParams.set("state", state);

  // Ensure employer auth (important for negotiations/vacancies).
  url.searchParams.set("role", "employer");
  url.searchParams.set("force_role", "true");
  url.searchParams.set("skip_choose_account", "true");

  // `host` is validated against redirect rules in HH docs; keep it stable.
  // Some endpoints use `host` as query param (e.g. /vacancies/{id}?host=hh.ru).
  url.searchParams.set("host", params?.host ?? getHhDefaultHost());
  return url.toString();
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
});

export type HhTokenResponse = z.infer<typeof TokenResponseSchema>;

export class HhRefreshTokenError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly errorDescription: string | null;

  constructor(input: { status: number; errorCode: string | null; errorDescription: string | null }) {
    super(input.errorDescription || input.errorCode || `HH_TOKEN_REFRESH_HTTP_${input.status}`);
    this.name = "HhRefreshTokenError";
    this.status = input.status;
    this.errorCode = input.errorCode;
    this.errorDescription = input.errorDescription;
  }
}

export async function exchangeHhCodeForToken(input: { code: string; redirectUri?: string }): Promise<HhTokenResponse> {
  const redirectUri = input.redirectUri ?? (await getHhRedirectUri());

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", requireHhClientId());
  body.set("client_secret", requireHhClientSecret());
  body.set("redirect_uri", redirectUri);
  body.set("code", input.code);

  const res = await fetch("https://api.hh.ru/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "HH-User-Agent": getHhUserAgent(),
    },
    body,
    cache: "no-store",
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json && typeof json === "object" && "error_description" in json ? String((json as any).error_description) : "HH_TOKEN_EXCHANGE_FAILED";
    throw new Error(msg);
  }

  const parsed = TokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("HH_TOKEN_RESPONSE_INVALID");
  return parsed.data;
}

export async function refreshHhToken(input: { refreshToken: string }): Promise<HhTokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", input.refreshToken);

  const res = await fetch("https://api.hh.ru/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "HH-User-Agent": getHhUserAgent(),
    },
    body,
    cache: "no-store",
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errorDescription =
      json && typeof json === "object" && "error_description" in json && typeof (json as any).error_description === "string"
        ? String((json as any).error_description).trim()
        : null;
    const errorCode =
      json && typeof json === "object" && "error" in json && typeof (json as any).error === "string"
        ? String((json as any).error).trim()
        : null;
    throw new HhRefreshTokenError({
      status: res.status,
      errorCode,
      errorDescription,
    });
  }

  const parsed = TokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("HH_TOKEN_RESPONSE_INVALID");
  return parsed.data;
}
