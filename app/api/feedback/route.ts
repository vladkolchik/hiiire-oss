import { NextResponse, type NextRequest } from "next/server";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { FEEDBACK_USER_AGENT_MAX_LENGTH } from "@/lib/feedback/constants";
import { FeedbackSubmissionSchema, mapFeedbackValidationIssues, normalizeFeedbackSourceUrl } from "@/lib/feedback/validation";
import { getRequestOrigin } from "@/lib/http/request-origin-core";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FEEDBACK_ERROR_MESSAGE = "Не удалось отправить сообщение. Попробуйте ещё раз.";

export async function POST(req: NextRequest) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const supabase = await createSupabaseServerClient();

    const authRes = await getConfirmedServerUser(supabase);
    if (!authRes.ok) {
      return NextResponse.json(
        {
          error: authRes.reason === "pending_email" ? "EMAIL_NOT_CONFIRMED" : "UNAUTHORIZED",
          message:
            authRes.reason === "pending_email"
              ? "Подтвердите email, чтобы отправить сообщение."
              : "Войдите, чтобы отправить сообщение.",
        },
        { status: authRes.reason === "pending_email" ? 403 : 401 }
      );
    }

    const bodyJson = await req.json().catch(() => null);
    const parsed = FeedbackSubmissionSchema.safeParse(bodyJson);
    if (!parsed.success) {
      const issues = mapFeedbackValidationIssues(parsed.error);
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: issues[0]?.message ?? "Проверьте сообщение и попробуйте ещё раз.",
          issues,
        },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id,name,email,role")
      .eq("id", authRes.user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: "PROFILE_LOOKUP_FAILED", message: FEEDBACK_ERROR_MESSAGE }, { status: 500 });
    }

    if (!profile?.company_id) {
      return NextResponse.json(
        { error: "NO_COMPANY", message: "Не удалось определить компанию для отправки сообщения." },
        { status: 403 }
      );
    }

    const userAgent = req.headers.get("user-agent")?.slice(0, FEEDBACK_USER_AGENT_MAX_LENGTH) ?? null;
    const appOrigin = getRequestOrigin(req);
    const sourceUrl =
      normalizeFeedbackSourceUrl(parsed.data.sourceUrl, appOrigin) ??
      normalizeFeedbackSourceUrl(req.headers.get("referer"), appOrigin);

    const admin = getSupabaseAdminClient();
    const { error: insertError } = await admin.from("feedback").insert({
      company_id: profile.company_id,
      user_id: authRes.user.id,
      author_name: profile.name,
      author_email: profile.email,
      author_role: profile.role,
      type: parsed.data.type,
      sections: parsed.data.sections,
      message: parsed.data.message,
      source_url: sourceUrl,
      user_agent: userAgent,
    });

    if (insertError) {
      return NextResponse.json({ error: "FEEDBACK_INSERT_FAILED", message: FEEDBACK_ERROR_MESSAGE }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: FEEDBACK_ERROR_MESSAGE }, { status: 500 });
  }
}
