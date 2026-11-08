import "server-only";

import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getHhDefaultHost, getHhUserAgent } from "./config";
import {
  classifyHhMessageFailureForHandling,
  classifyHhRefreshFailureForHandling,
  classifyHhRequestFailureForHandling,
  isHhTokenExpired,
  performHhRequestWithRefreshRetry,
  shouldReloadPersistedTokensAfterRefreshFailure,
} from "./auth-retry";
import { HhRefreshTokenError, refreshHhToken } from "./oauth";

const IntegrationRowSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: z.literal("hh.ru"),
  is_active: z.boolean(),
  access_token: z.string().nullable(),
  refresh_token: z.string().nullable(),
  token_expires_at: z.string().nullable(),
  settings: z.any().nullable(),
  connected_at: z.string(),
  last_synced_at: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type HhIntegrationAccount = z.infer<typeof IntegrationRowSchema>;

export type HhAuthContext = {
  integrationId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  host: string;
  employerId: string;
  managerId: string;
};

export type HhFatalAuthFailure = {
  reason: string;
  detail: string;
};

export class HhRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly oauthError: string | null;
  readonly errorValues: string[];
  readonly description: string | null;

  constructor(input: {
    code: string;
    status: number;
    oauthError: string | null;
    errorValues: string[];
    description: string | null;
  }) {
    super(input.code);
    this.name = "HhRequestError";
    this.code = input.code;
    this.status = input.status;
    this.oauthError = input.oauthError;
    this.errorValues = input.errorValues;
    this.description = input.description;
  }
}

function normalizeToken(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function parseHhApiErrorMeta(json: unknown): {
  oauthError: string | null;
  errorValues: string[];
  description: string | null;
} {
  const out: { oauthError: string | null; errorValues: string[]; description: string | null } = {
    oauthError: null,
    errorValues: [],
    description: null,
  };
  if (!json || typeof json !== "object") return out;
  const anyJson = json as any;

  if (typeof anyJson.oauth_error === "string" && anyJson.oauth_error.trim()) {
    out.oauthError = anyJson.oauth_error.trim();
  }
  if (typeof anyJson.description === "string" && anyJson.description.trim()) {
    out.description = anyJson.description.trim();
  }
  if (Array.isArray(anyJson.errors)) {
    for (const item of anyJson.errors) {
      if (!item || typeof item !== "object") continue;
      const value = typeof (item as any).value === "string" ? (item as any).value.trim() : "";
      if (!value) continue;
      out.errorValues.push(value);
    }
  }

  return out;
}

function buildAuthFailureDetail(input: {
  code: string;
  status?: number;
  oauthError?: string | null;
  errorValues?: string[];
  description?: string | null;
}): string {
  const chunks = [
    input.code,
    typeof input.status === "number" ? `status=${input.status}` : null,
    input.oauthError ? `oauth=${input.oauthError}` : null,
    input.errorValues && input.errorValues.length > 0 ? `errors=${input.errorValues.join(",")}` : null,
    input.description ? `description=${input.description}` : null,
  ].filter((x): x is string => Boolean(x));
  return chunks.join(" ");
}

export function getHhFatalAuthFailure(err: unknown): HhFatalAuthFailure | null {
  if (err instanceof HhRequestError) {
    const decision = classifyHhRequestFailureForHandling({
      code: err.code,
      status: err.status,
      oauthError: err.oauthError,
      errorValues: err.errorValues,
      description: err.description,
    });
    if (decision.kind !== "fatal_disconnect") return null;
    return { reason: decision.reason, detail: decision.detail };
  }

  if (err instanceof HhRefreshTokenError) {
    const decision = classifyHhRefreshFailureForHandling({
      status: err.status,
      errorCode: err.errorCode,
      errorDescription: err.errorDescription,
    });
    if (decision.kind !== "fatal_disconnect") return null;
    return { reason: decision.reason, detail: decision.detail };
  }

  const message = err instanceof Error ? err.message : String(err ?? "");
  const msgNorm = normalizeToken(message);
  if (!msgNorm) return null;

  const messageDecision = classifyHhMessageFailureForHandling(message);
  if (messageDecision.kind === "fatal_disconnect") {
    return {
      reason: messageDecision.reason,
      detail: messageDecision.detail,
    };
  }

  return null;
}

export async function deactivateHhIntegrationOnFatalAuth(input: {
  integrationId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  reason: string;
  detail?: string | null;
}): Promise<boolean> {
  const admin = getSupabaseAdminClient();

  let rowQuery = admin.from("integrations_accounts").select("id,settings").eq("provider", "hh.ru");
  if (input.integrationId) {
    rowQuery = rowQuery.eq("id", input.integrationId);
  } else if (input.companyId && input.userId) {
    rowQuery = rowQuery.eq("company_id", input.companyId).eq("user_id", input.userId);
  } else {
    return false;
  }

  const { data: row, error: rowErr } = await rowQuery.maybeSingle();
  if (rowErr || !row?.id) return false;

  const nowIso = new Date().toISOString();
  const currentSettings =
    row.settings && typeof row.settings === "object"
      ? ({ ...(row.settings as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const nextSettings: Record<string, unknown> = {
    ...currentSettings,
    disconnect_reason: input.reason,
    disconnect_detail: input.detail ?? null,
    disconnect_at: nowIso,
  };

  const { error: updErr } = await admin
    .from("integrations_accounts")
    .update({
      is_active: false,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      settings: nextSettings as any,
      updated_at: nowIso,
    })
    .eq("id", row.id);
  if (updErr) return false;
  return true;
}

function parseSettings(settings: unknown): { host: string; employerId: string; managerId: string } | null {
  if (!settings || typeof settings !== "object") return null;
  const s: any = settings;
  const host = typeof s.host === "string" && s.host ? s.host : getHhDefaultHost();
  const employerId = typeof s.employer_id === "string" ? s.employer_id : null;
  const managerId = typeof s.manager_id === "string" ? s.manager_id : null;
  if (!employerId || !managerId) return null;
  return { host, employerId, managerId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PERSISTED_HH_AUTH_RELOAD_ATTEMPTS = 10;
const PERSISTED_HH_AUTH_RELOAD_DELAY_MS = 200;

async function loadPersistedHhAuthState(input: {
  integrationId: string;
  currentAccessToken: string | null;
  currentRefreshToken: string | null;
}): Promise<{ accessToken: string; refreshToken: string | null; tokenExpiresAt: string | null } | null> {
  const admin = getSupabaseAdminClient();

  for (let attempt = 0; attempt < PERSISTED_HH_AUTH_RELOAD_ATTEMPTS; attempt += 1) {
    const { data, error } = await admin
      .from("integrations_accounts")
      .select("is_active,access_token,refresh_token,token_expires_at")
      .eq("id", input.integrationId)
      .maybeSingle();
    if (error) throw error;

    if (
      data?.is_active &&
      typeof data.access_token === "string" &&
      data.access_token &&
      (data.access_token !== input.currentAccessToken || data.refresh_token !== input.currentRefreshToken)
    ) {
      return {
        accessToken: data.access_token,
        refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
        tokenExpiresAt: typeof data.token_expires_at === "string" ? data.token_expires_at : null,
      };
    }

    if (attempt < PERSISTED_HH_AUTH_RELOAD_ATTEMPTS - 1) {
      await sleep(PERSISTED_HH_AUTH_RELOAD_DELAY_MS);
    }
  }

  return null;
}

async function refreshAndPersistHhAuth(input: {
  integrationId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
}): Promise<{ accessToken: string; refreshToken: string | null; tokenExpiresAt: string | null }> {
  if (!input.refreshToken) throw new Error("HH_REFRESH_TOKEN_MISSING");

  let refreshed;
  try {
    refreshed = await refreshHhToken({ refreshToken: input.refreshToken });
  } catch (err) {
    if (
      err instanceof HhRefreshTokenError &&
      shouldReloadPersistedTokensAfterRefreshFailure({
        status: err.status,
        errorCode: err.errorCode,
        errorDescription: err.errorDescription,
      })
    ) {
      const persisted = await loadPersistedHhAuthState({
        integrationId: input.integrationId,
        currentAccessToken: input.accessToken,
        currentRefreshToken: input.refreshToken,
      });
      if (persisted) return persisted;
    }
    throw err;
  }

  const accessToken = refreshed.access_token;
  const refreshToken = refreshed.refresh_token ?? input.refreshToken;
  const tokenExpiresAt =
    typeof refreshed.expires_in === "number" && Number.isFinite(refreshed.expires_in)
      ? new Date(Date.now() + Math.max(0, refreshed.expires_in) * 1000).toISOString()
      : input.tokenExpiresAt;

  const nowIso = new Date().toISOString();
  const { error } = await getSupabaseAdminClient()
    .from("integrations_accounts")
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
      updated_at: nowIso,
    })
    .eq("id", input.integrationId);
  if (error) throw error;

  return { accessToken, refreshToken, tokenExpiresAt };
}

export async function loadHhAuthContextOrThrow(input: {
  companyId: string;
  userId: string;
}): Promise<{ integrationId: string; ctx: HhAuthContext }> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("integrations_accounts")
    .select("*")
    .eq("company_id", input.companyId)
    .eq("user_id", input.userId)
    .eq("provider", "hh.ru")
    .maybeSingle();

  if (error) throw new Error("HH_INTEGRATION_LOOKUP_FAILED");
  if (!data) throw new Error("HH_NOT_CONNECTED");

  const parsed = IntegrationRowSchema.safeParse(data);
  if (!parsed.success) throw new Error("HH_INTEGRATION_ROW_INVALID");
  const row = parsed.data;

  if (!row.is_active) throw new Error("HH_NOT_CONNECTED");

  const settings = parseSettings(row.settings);
  if (!settings) throw new Error("HH_SETTINGS_MISSING");

  let accessToken = row.access_token ?? "";
  let refreshToken = row.refresh_token ?? null;
  let tokenExpiresAt = row.token_expires_at;

  if (!accessToken) throw new Error("HH_TOKEN_MISSING");

  if (isHhTokenExpired(tokenExpiresAt)) {
    const refreshed = await refreshAndPersistHhAuth({
      integrationId: row.id,
      accessToken,
      refreshToken,
      tokenExpiresAt,
    });
    accessToken = refreshed.accessToken;
    refreshToken = refreshed.refreshToken;
    tokenExpiresAt = refreshed.tokenExpiresAt;
  }

  return {
    integrationId: row.id,
    ctx: {
      integrationId: row.id,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      host: settings.host,
      employerId: settings.employerId,
      managerId: settings.managerId,
    },
  };
}

export async function hhFetchJson<T = unknown>(
  auth: HhAuthContext,
  path: string,
  options?: { method?: string; query?: Record<string, string | number | boolean | undefined>; body?: string | URLSearchParams }
): Promise<T> {
  return performHhRequestWithRefreshRetry({
    authState: auth,
    isRetryableFailure: (err) =>
      err instanceof HhRequestError &&
      classifyHhRequestFailureForHandling({
        code: err.code,
        status: err.status,
        oauthError: err.oauthError,
        errorValues: err.errorValues,
        description: err.description,
      }).kind === "retry_refresh_once",
    refreshAndPersist: async () => {
      const refreshed = await refreshAndPersistHhAuth({
        integrationId: auth.integrationId,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        tokenExpiresAt: auth.tokenExpiresAt,
      });
      auth.accessToken = refreshed.accessToken;
      auth.refreshToken = refreshed.refreshToken;
      auth.tokenExpiresAt = refreshed.tokenExpiresAt;
    },
    request: async (accessToken) => {
      const url = new URL(path, "https://api.hh.ru");
      url.searchParams.set("host", auth.host);
      if (options?.query) {
        for (const [k, v] of Object.entries(options.query)) {
          if (v === undefined) continue;
          url.searchParams.set(k, String(v));
        }
      }

      const res = await fetch(url.toString(), {
        method: options?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "HH-User-Agent": getHhUserAgent(),
        },
        body: options?.body,
        cache: "no-store",
      });

      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const meta = parseHhApiErrorMeta(json);
        throw new HhRequestError({
          code: `HH_HTTP_${res.status}`,
          status: res.status,
          oauthError: meta.oauthError,
          errorValues: meta.errorValues,
          description: meta.description,
        });
      }
      return json as T;
    },
  });
}
