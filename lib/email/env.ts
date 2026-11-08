import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getResendApiKey(): string {
  return requireEnv("RESEND_API_KEY");
}

export function getEmailFrom(): string {
  return requireEnv("EMAIL_FROM");
}

export function getEmailOwnerRecipients(): string[] {
  const raw = String(process.env.EMAIL_OWNER_RECIPIENTS ?? "");
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // Keep only basic-looking emails; avoid throwing to keep owners notify best-effort.
  const emails: string[] = [];
  for (const p of parts) {
    if (p.includes("@") && !/\s/.test(p)) emails.push(p);
  }
  return emails;
}

