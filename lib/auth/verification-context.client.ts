"use client";

type VerificationContextResponse = {
  status: "pending" | "confirmed" | "missing";
  contextId: string | null;
  email: string | null;
  maskedEmail: string | null;
  cooldownLeftSeconds: number;
};

type ResendResponse = {
  ok: boolean;
  cooldownLeftSeconds?: number;
  retryAfterSeconds?: number;
  error?: string;
};

const expectedContextIdSessionKey = "hiiire_expected_verification_context_id";

function isBrowser() {
  return typeof window !== "undefined";
}

function setExpectedContextId(contextId: string | null) {
  if (!isBrowser()) return;
  if (!contextId) {
    window.sessionStorage.removeItem(expectedContextIdSessionKey);
    return;
  }
  window.sessionStorage.setItem(expectedContextIdSessionKey, contextId);
}

export function getExpectedVerificationContextId() {
  if (!isBrowser()) return null;
  return window.sessionStorage.getItem(expectedContextIdSessionKey);
}

export async function loadVerificationContext(): Promise<VerificationContextResponse> {
  const res = await fetch("/api/auth/verification-context", {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    return { status: "missing", contextId: null, email: null, maskedEmail: null, cooldownLeftSeconds: 0 };
  }
  const json = (await res.json().catch(() => null)) as Partial<VerificationContextResponse> | null;
  const status = json?.status === "pending" || json?.status === "confirmed" ? json.status : "missing";
  return {
    status,
    contextId: typeof json?.contextId === "string" ? json.contextId : null,
    email: typeof json?.email === "string" ? json.email : null,
    maskedEmail: typeof json?.maskedEmail === "string" ? json.maskedEmail : null,
    cooldownLeftSeconds: typeof json?.cooldownLeftSeconds === "number" ? Math.max(0, Math.floor(json.cooldownLeftSeconds)) : 0,
  };
}

export async function primeVerificationContext(_email?: string) {
  const context = await loadVerificationContext();
  setExpectedContextId(context.contextId);
}

export async function clearVerificationContext() {
  setExpectedContextId(null);
  await fetch("/api/auth/verification-context", { method: "DELETE" });
}

export function syncExpectedVerificationContextId(contextId: string | null) {
  setExpectedContextId(contextId);
}

export async function resendVerificationEmail(): Promise<ResendResponse> {
  const res = await fetch("/api/auth/resend-verification", { method: "POST" });
  const json = (await res.json().catch(() => null)) as Partial<ResendResponse> | null;

  if (res.ok) {
    return {
      ok: true,
      cooldownLeftSeconds: typeof json?.cooldownLeftSeconds === "number" ? Math.max(0, Math.floor(json.cooldownLeftSeconds)) : 0,
    };
  }

  return {
    ok: false,
    cooldownLeftSeconds: typeof json?.cooldownLeftSeconds === "number" ? Math.max(0, Math.floor(json.cooldownLeftSeconds)) : undefined,
    retryAfterSeconds: typeof json?.retryAfterSeconds === "number" ? Math.max(0, Math.floor(json.retryAfterSeconds)) : undefined,
    error: typeof json?.error === "string" ? json.error : "REQUEST_FAILED",
  };
}
