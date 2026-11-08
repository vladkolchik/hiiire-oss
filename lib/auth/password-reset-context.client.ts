"use client";

type PasswordResetContextResponse = {
  contextId: string | null;
  email: string | null;
  maskedEmail: string | null;
  cooldownLeftSeconds: number;
};

type RequestPasswordResetResponse = {
  ok: boolean;
  maskedEmail?: string;
  cooldownLeftSeconds?: number;
  retryAfterSeconds?: number;
  error?: string;
};

export async function loadPasswordResetContext(): Promise<PasswordResetContextResponse> {
  const res = await fetch("/api/auth/password-reset", {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    return { contextId: null, email: null, maskedEmail: null, cooldownLeftSeconds: 0 };
  }

  const json = (await res.json().catch(() => null)) as Partial<PasswordResetContextResponse> | null;
  return {
    contextId: typeof json?.contextId === "string" ? json.contextId : null,
    email: typeof json?.email === "string" ? json.email : null,
    maskedEmail: typeof json?.maskedEmail === "string" ? json.maskedEmail : null,
    cooldownLeftSeconds: typeof json?.cooldownLeftSeconds === "number" ? Math.max(0, Math.floor(json.cooldownLeftSeconds)) : 0,
  };
}

export async function requestPasswordReset(email: string): Promise<RequestPasswordResetResponse> {
  const res = await fetch("/api/auth/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const json = (await res.json().catch(() => null)) as Partial<RequestPasswordResetResponse> | null;
  if (res.ok) {
    return {
      ok: true,
      maskedEmail: typeof json?.maskedEmail === "string" ? json.maskedEmail : undefined,
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

export async function clearPasswordResetContext() {
  await fetch("/api/auth/password-reset", { method: "DELETE" });
}
