import { after, NextResponse, type NextRequest } from "next/server";

import {
  clearVerificationContext,
  createVerificationContext,
  writeVerificationContext,
} from "@/lib/auth/verification-context.server";
import { shouldNotifyForPostSignupEmailState } from "@/lib/auth/signup-notification-eligibility";
import { getSignupErrorMessage } from "@/lib/auth/user-facing-errors";
import { firstUserFacingIssueMessage, zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { captureBusinessEvent, identifyCompanyGroup } from "@/lib/analytics/business-events";
import { getClientIp } from "@/lib/http/client-ip";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { marketingEventPropertiesFromPayload, recordMarketingSignup } from "@/lib/marketing/server";
import { checkFixedWindowRateLimit } from "@/lib/security/fixed-window-rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scheduleOwnerSignupNotification } from "@/lib/telegram/owner-signup-notification";
import { SignupBodySchema } from "@/lib/validation/signup";
import type { MarketingAttributionPayload } from "@/lib/validation/marketing-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignupEmailState = {
  user_id: string;
  email: string;
  email_confirmed: boolean;
};

type SignupProfileContext = {
  companyId: string | null;
  role: string | null;
};

const SIGNUP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_RATE_LIMIT_BY_IP = 36;
const SIGNUP_RATE_LIMIT_BY_IP_AND_EMAIL = 9;
const MIN_SIGNUP_RESPONSE_MS = 350;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMinimumResponseTime(startedAt: number) {
  const elapsed = Date.now() - startedAt;
  if (elapsed >= MIN_SIGNUP_RESPONSE_MS) return;
  await sleep(MIN_SIGNUP_RESPONSE_MS - elapsed);
}

function buildEmailConfirmationResponse(
  req: NextRequest,
  email: string,
  reason: "new_signup" | "existing_unconfirmed"
) {
  const context = createVerificationContext(email);
  const res = NextResponse.json(
    {
      status: "email_confirmation_required" as const,
      email,
      reason,
    },
    { status: 200 }
  );
  writeVerificationContext(res, req, context);
  return res;
}

function buildDuplicateEmailResponse(req: NextRequest) {
  const res = NextResponse.json(
    {
      error: "EMAIL_ALREADY_REGISTERED",
      message: "Этот email уже зарегистрирован. Войдите в аккаунт или восстановите пароль.",
    },
    { status: 409 }
  );
  clearVerificationContext(res, req);
  return res;
}

function buildErrorResponse(req: NextRequest, error: string, message: string, status: number) {
  const res = NextResponse.json({ error, message }, { status });
  clearVerificationContext(res, req);
  return res;
}

function buildRateLimitResponse(req: NextRequest, retryAfterSeconds: number) {
  const res = NextResponse.json(
    {
      error: "RATE_LIMIT",
      message: "Слишком много попыток регистрации. Попробуйте позже.",
      retryAfterSeconds,
    },
    { status: 429 }
  );
  res.headers.set("Retry-After", String(retryAfterSeconds));
  clearVerificationContext(res, req);
  return res;
}

async function getSignupEmailState(email: string): Promise<SignupEmailState | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_signup_email_state", { p_email: email });
  if (error) throw error;
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

function scheduleSignupOwnerNotification({
  userId,
  companyId,
  name,
  email,
  phone,
  company,
  intendedPlan,
  marketingAttribution,
  shouldNotify,
}: {
  userId: string;
  companyId: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  intendedPlan: "starter" | "professional";
  marketingAttribution?: MarketingAttributionPayload;
  shouldNotify?: () => boolean | Promise<boolean>;
}) {
  scheduleOwnerSignupNotification(
    {
      userId,
      companyId,
      name,
      email,
      phone,
      company,
      requestedPlan: intendedPlan,
      marketingAttribution,
    },
    { shouldNotify },
  );
}

function scheduleSignupAnalyticsCapture(input: {
  userId: string;
  intendedPlan: "starter" | "professional";
  emailConfirmationRequired: boolean;
  marketingAttribution?: MarketingAttributionPayload;
}) {
  try {
    after(async () => {
      await Promise.resolve()
        .then(() => captureSignupCompleted(input))
        .catch(() => undefined);
    });
  } catch {
    // Analytics scheduling must never break signup.
  }
}

async function loadSignupProfileContext(userId: string): Promise<SignupProfileContext> {
  try {
    const admin = getSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id,role")
      .eq("id", userId)
      .maybeSingle();

    return {
      companyId: typeof profile?.company_id === "string" ? profile.company_id : null,
      role: typeof profile?.role === "string" ? profile.role : null,
    };
  } catch {
    return { companyId: null, role: null };
  }
}

async function captureSignupCompleted(input: {
  userId: string;
  intendedPlan: "starter" | "professional";
  emailConfirmationRequired: boolean;
  marketingAttribution?: MarketingAttributionPayload;
}) {
  try {
    const { companyId, role } = await loadSignupProfileContext(input.userId);

    if (companyId) {
      await identifyCompanyGroup({
        companyId,
        distinctId: input.userId,
        plan: "trial",
        billingStatus: "trial",
      });
    }

    await recordMarketingSignup({
      userId: input.userId,
      companyId,
      marketingAttribution: input.marketingAttribution,
    });

    await captureBusinessEvent({
      event: "signup_completed",
      userId: input.userId,
      companyId,
      role,
      properties: {
        requested_plan: input.intendedPlan,
        email_confirmation_required: input.emailConfirmationRequired,
        ...marketingEventPropertiesFromPayload(input.marketingAttribution),
      },
    });
  } catch {
    // Analytics must never block signup.
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => null);
    const parsed = SignupBodySchema.safeParse(body);
    if (!parsed.success) {
      const message = firstUserFacingIssueMessage(
        zodErrorToUserFacingIssues(parsed.error, "Проверьте корректность заполнения формы."),
        "Проверьте корректность заполнения формы."
      );

      await ensureMinimumResponseTime(startedAt);
      return buildErrorResponse(req, "INVALID_BODY", message, 400);
    }

    const email = normalizeEmail(parsed.data.email);
    const clientIp = getClientIp(req);
    const ipLimit = checkFixedWindowRateLimit({
      namespace: "signup-ip",
      key: clientIp,
      limit: SIGNUP_RATE_LIMIT_BY_IP,
      windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
    });
    if (!ipLimit.allowed) {
      await ensureMinimumResponseTime(startedAt);
      return buildRateLimitResponse(req, ipLimit.retryAfterSeconds);
    }

    const ipEmailLimit = checkFixedWindowRateLimit({
      namespace: "signup-ip-email",
      key: `${clientIp}:${email}`,
      limit: SIGNUP_RATE_LIMIT_BY_IP_AND_EMAIL,
      windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
    });
    if (!ipEmailLimit.allowed) {
      await ensureMinimumResponseTime(startedAt);
      return buildRateLimitResponse(req, ipEmailLimit.retryAfterSeconds);
    }

    const intendedPlan = parsed.data.intendedPlan ?? "starter";
    const existingEmailState = await getSignupEmailState(email);

    if (existingEmailState?.email_confirmed) {
      await ensureMinimumResponseTime(startedAt);
      return buildDuplicateEmailResponse(req);
    }

    if (existingEmailState && !existingEmailState.email_confirmed) {
      await ensureMinimumResponseTime(startedAt);
      return buildEmailConfirmationResponse(req, existingEmailState.email, "existing_unconfirmed");
    }

    const supabase = await createSupabaseServerClient();
    const emailRedirectTo = `${getRequestOrigin(req)}/auth/callback?next=/dashboard`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: parsed.data.password,
      options: {
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
          company_name: parsed.data.company,
          intended_plan: intendedPlan,
          role: "admin",
        },
        emailRedirectTo,
      },
    });

    if (error) {
      const raw = `${error.message} ${(error as { code?: string }).code ?? ""}`.toUpperCase();
      if (raw.includes("TRIAL_ALREADY_USED_FOR_EMAIL")) {
        await ensureMinimumResponseTime(startedAt);
        return buildErrorResponse(
          req,
          "TRIAL_ALREADY_USED_FOR_EMAIL",
          "Пробный период для этого email уже использован. Войдите в аккаунт и выберите тариф.",
          409
        );
      }

      await ensureMinimumResponseTime(startedAt);
      return buildErrorResponse(req, "SIGNUP_FAILED", getSignupErrorMessage(error), 400);
    }

    if (!data.user) {
      await ensureMinimumResponseTime(startedAt);
      return buildErrorResponse(req, "SIGNUP_FAILED", "Не удалось создать пользователя.", 502);
    }

    const createdUserId = data.user.id;

    if (!data.session) {
      scheduleSignupOwnerNotification({
        userId: createdUserId,
        companyId: null,
        name: parsed.data.name,
        email,
        phone: parsed.data.phone,
        company: parsed.data.company,
        intendedPlan,
        marketingAttribution: parsed.data.marketingAttribution,
        shouldNotify: async () => {
          const emailStateAfterSignup = await getSignupEmailState(email).catch(() => undefined);
          return shouldNotifyForPostSignupEmailState(emailStateAfterSignup, createdUserId);
        },
      });
      scheduleSignupAnalyticsCapture({
        userId: createdUserId,
        intendedPlan,
        emailConfirmationRequired: true,
        marketingAttribution: parsed.data.marketingAttribution,
      });
      await ensureMinimumResponseTime(startedAt);
      return buildEmailConfirmationResponse(req, email, "new_signup");
    }

    scheduleSignupOwnerNotification({
      userId: createdUserId,
      companyId: null,
      name: parsed.data.name,
      email,
      phone: parsed.data.phone,
      company: parsed.data.company,
      intendedPlan,
      marketingAttribution: parsed.data.marketingAttribution,
    });
    scheduleSignupAnalyticsCapture({
      userId: createdUserId,
      intendedPlan,
      emailConfirmationRequired: false,
      marketingAttribution: parsed.data.marketingAttribution,
    });
    await ensureMinimumResponseTime(startedAt);
    const res = NextResponse.json({ status: "authenticated" as const }, { status: 200 });
    clearVerificationContext(res, req);
    return res;
  } catch {
    await ensureMinimumResponseTime(startedAt);
    return buildErrorResponse(req, "INTERNAL_ERROR", "Не удалось завершить регистрацию.", 500);
  }
}
