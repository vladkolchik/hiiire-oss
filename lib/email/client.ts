import "server-only";

import { getEmailFrom, getResendApiKey } from "@/lib/email/env";

type ResendSendOk = { id: string };
type ResendSendErr = { message?: string; name?: string; statusCode?: number };

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const apiKey = getResendApiKey();
  const from = getEmailFrom();

  const to = String(params.to ?? "").trim();
  const subject = String(params.subject ?? "").trim();

  if (!to || !to.includes("@")) throw new Error("EMAIL_SEND_INVALID_TO");
  if (!subject) throw new Error("EMAIL_SEND_INVALID_SUBJECT");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: params.text,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });

  const json = (await res.json().catch(() => null)) as ResendSendOk | ResendSendErr | null;

  if (!res.ok) {
    const details =
      json && typeof json === "object"
        ? "message" in json && typeof (json as any).message === "string"
          ? String((json as any).message)
          : JSON.stringify(json)
        : "";
    throw new Error(`EMAIL_SEND_FAILED status=${res.status}${details ? ` details=${details}` : ""}`);
  }

  if (!json || typeof json !== "object" || !("id" in json)) {
    // Resend may change response shape; treat as ok if HTTP is ok.
    return;
  }
}

