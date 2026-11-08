import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { captureBusinessEvent } from "@/lib/analytics/business-events";
import {
  CHECKOUT_REUSE_WINDOW_MS,
  resolveCheckoutLifecycle,
  shouldReuseImmediateCheckout,
} from "@/lib/billing/checkout-schedule";
import {
  requireRobokassaMerchantLogin,
  requireRobokassaPassword1,
  getRobokassaPaymentUrl,
  isRobokassaRecurringEnabled,
  isRobokassaTestMode,
} from "@/lib/billing/env";
import { buildSubscriptionReceipt } from "@/lib/billing/fiscal-receipts";
import { addCalendarMonth, formatOutSum, getBillingPlan, type BillablePlan } from "@/lib/billing/plans";
import { buildCheckoutUrl, createCheckoutSignature } from "@/lib/billing/robokassa";
import { encodeRobokassaReceipt } from "@/lib/billing/robokassa-signature";
import { loadCompanyPlanSnapshot, resolveBillingStatus } from "@/lib/billing/subscription";
import { loadCompanyMarketingEventProperties } from "@/lib/marketing/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  plan: z.string().trim().toLowerCase(),
});

type CheckoutErrorCode =
  | "FORBIDDEN"
  | "INVALID_BODY"
  | "PLAN_NOT_SUPPORTED"
  | "PAID_SCHEDULE_EXISTS"
  | "SCHEDULE_DOWNGRADE_REQUIRED"
  | "PLAN_PERIOD_END_REQUIRED"
  | "ENTERPRISE_CHANGE_REQUIRES_SUPPORT"
  | "BILLING_EMAIL_REQUIRED"
  | "PAYMENT_INV_ID_INVALID"
  | "PAYMENT_LOOKUP_FAILED"
  | "PAYMENT_ALREADY_EXISTS"
  | "PAYMENT_EXPIRY_FAILED"
  | "PAYMENT_CREATE_FAILED"
  | "INTERNAL_ERROR";

const CHECKOUT_ERROR_MESSAGES: Record<CheckoutErrorCode, string> = {
  FORBIDDEN: "У вас нет прав на оплату тарифа.",
  INVALID_BODY: "Выберите тариф и попробуйте ещё раз.",
  PLAN_NOT_SUPPORTED: "Enterprise оформляется через заявку.",
  PAID_SCHEDULE_EXISTS: "У вас уже есть запланированное изменение тарифа.",
  SCHEDULE_DOWNGRADE_REQUIRED: "Starter можно включить после окончания текущего периода.",
  PLAN_PERIOD_END_REQUIRED: "Нужно уточнить дату окончания текущего тарифа.",
  ENTERPRISE_CHANGE_REQUIRES_SUPPORT: "Мы проверим условия Enterprise и свяжемся с вами.",
  BILLING_EMAIL_REQUIRED: "Добавьте email компании перед оплатой.",
  PAYMENT_INV_ID_INVALID: "Не удалось подготовить оплату. Попробуйте ещё раз.",
  PAYMENT_LOOKUP_FAILED: "Не удалось проверить текущую оплату. Попробуйте ещё раз.",
  PAYMENT_ALREADY_EXISTS: "Оплата для этого тарифа уже создана.",
  PAYMENT_EXPIRY_FAILED: "Не удалось обновить предыдущие оплаты. Попробуйте ещё раз.",
  PAYMENT_CREATE_FAILED: "Не удалось подготовить оплату. Попробуйте ещё раз.",
  INTERNAL_ERROR: "Не удалось подготовить оплату. Попробуйте ещё раз.",
};

function checkoutError(error: CheckoutErrorCode, status: number) {
  return NextResponse.json({ error, message: CHECKOUT_ERROR_MESSAGES[error] }, { status });
}

function getRequestOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    if (ctx.role !== "admin") {
      return checkoutError("FORBIDDEN", 403);
    }

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return checkoutError("INVALID_BODY", 400);
    }

    const rawPlan = parsed.data.plan;
    if (rawPlan === "enterprise") {
      return checkoutError("PLAN_NOT_SUPPORTED", 400);
    }
    if (rawPlan !== "starter" && rawPlan !== "professional") {
      return checkoutError("INVALID_BODY", 400);
    }

    const plan = rawPlan as BillablePlan;
    const planConfig = getBillingPlan(plan);
    const now = new Date();
    const recurringEnabled = isRobokassaRecurringEnabled();
    const planSnapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    if (planSnapshot.scheduledPaymentId) {
      return checkoutError("PAID_SCHEDULE_EXISTS", 409);
    }
    const checkoutPeriod = resolveCheckoutLifecycle({
      targetPlan: plan,
      currentPlan: planSnapshot.currentPlan,
      billingStatus: resolveBillingStatus(planSnapshot, now.getTime()),
      autoRenew: planSnapshot.autoRenew,
      periodEnd: planSnapshot.periodEnd,
      now,
    });
    if (checkoutPeriod.kind === "unpaid_scheduled_downgrade") {
      return checkoutError("SCHEDULE_DOWNGRADE_REQUIRED", 409);
    }
    if (checkoutPeriod.kind === "blocked_active_downgrade_missing_period_end") {
      return checkoutError("PLAN_PERIOD_END_REQUIRED", 409);
    }
    if (checkoutPeriod.kind === "enterprise_change_requires_support") {
      return checkoutError("ENTERPRISE_CHANGE_REQUIRES_SUPPORT", 409);
    }
    const periodStartDate = checkoutPeriod.periodStart;
    const periodStart = periodStartDate.toISOString();
    const periodEnd = addCalendarMonth(periodStartDate).toISOString();
    const activateAutoRenew = checkoutPeriod.isScheduledChange ? false : recurringEnabled;
    const checkoutExpiresAt = checkoutPeriod.kind === "immediate"
      ? new Date(now.getTime() + CHECKOUT_REUSE_WINDOW_MS).toISOString()
      : null;
    const scheduledSourcePlan = checkoutPeriod.isScheduledChange && planSnapshot.currentPlan !== "trial"
      ? planSnapshot.currentPlan
      : null;
    const origin = getRequestOrigin(req);
    const merchantLogin = requireRobokassaMerchantLogin();
    const password1 = requireRobokassaPassword1();
    if (!ctx.email) {
      return checkoutError("BILLING_EMAIL_REQUIRED", 400);
    }

    const buildPaymentResponse = (payment: {
      id: string;
      inv_id?: unknown;
      amount?: unknown;
      activate_auto_renew?: unknown;
      checkout_expires_at?: unknown;
    }) => {
      const invId = Number(payment.inv_id ?? 0);
      if (!Number.isSafeInteger(invId) || invId <= 0) {
        return checkoutError("PAYMENT_INV_ID_INVALID", 500);
      }

      const amountKopecks = Number(payment.amount ?? planConfig.amountKopecks);
      const receiptAmountKopecks = Number.isFinite(amountKopecks) ? amountKopecks : planConfig.amountKopecks;
      const outSum = formatOutSum(receiptAmountKopecks);
      const encodedReceipt = encodeRobokassaReceipt(
        buildSubscriptionReceipt({
          planLabel: planConfig.label,
          amountKopecks: receiptAmountKopecks,
        }),
      );
      const shp = { Shp_payment_id: String(payment.id) };
      const signatureValue = createCheckoutSignature({
        merchantLogin,
        outSum,
        invId,
        password1,
        receipt: encodedReceipt,
        shp,
      });

      const checkoutUrl = buildCheckoutUrl({
        paymentUrl: getRobokassaPaymentUrl(),
        merchantLogin,
        outSum,
        invId,
        description: `hiiire ${planConfig.label} subscription`,
        signatureValue,
        resultUrl: `${origin}/api/billing/robokassa-webhook`,
        successUrl: `${origin}/dashboard/settings?tab=plan&payment=success`,
        failUrl: `${origin}/dashboard/settings?tab=plan&payment=failed`,
        isTest: isRobokassaTestMode(),
        recurring: recurringEnabled && payment.activate_auto_renew === true,
        email: ctx.email,
        expirationDate: typeof payment.checkout_expires_at === "string" ? payment.checkout_expires_at : null,
        receipt: encodedReceipt,
        shp,
      });

      return NextResponse.json(
        {
          checkoutUrl,
          paymentId: String(payment.id),
          invId,
        },
        { status: 200 }
      );
    };

    const captureCheckoutStarted = async (payment: { id: string; inv_id?: unknown; amount?: unknown }, reused: boolean) => {
      const marketingProperties = await loadCompanyMarketingEventProperties(ctx.companyId);
      await captureBusinessEvent({
        event: "checkout_started",
        userId: ctx.userId,
        companyId: ctx.companyId,
        role: ctx.role,
        properties: {
          payment_id: String(payment.id),
          inv_id: Number(payment.inv_id ?? 0),
          plan,
          amount_kopecks: Number(payment.amount ?? planConfig.amountKopecks),
          currency: "RUB",
          scheduled_change: checkoutPeriod.isScheduledChange,
          auto_renew: activateAutoRenew,
          reused,
          ...marketingProperties,
        },
      });
    };

    if (checkoutPeriod.isScheduledChange) {
      const { data: existingPayment, error: existingPaymentError } = await admin
        .from("payments")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("plan", plan)
        .eq("period_start", periodStart)
        .eq("is_recurring", false)
        .in("status", ["pending", "completed", "requires_review"])
        .maybeSingle();
      if (existingPaymentError) {
        return checkoutError("PAYMENT_LOOKUP_FAILED", 500);
      }
      if (existingPayment) {
        return checkoutError("PAYMENT_ALREADY_EXISTS", 409);
      }
    } else {
      const { error: expireError } = await admin.rpc("expire_pending_immediate_checkouts", {
        p_now: now.toISOString(),
      });
      if (expireError) {
        return checkoutError("PAYMENT_EXPIRY_FAILED", 500);
      }

      const { data: existingPayment, error: existingPaymentError } = await admin
        .from("payments")
        .select("id,company_id,plan,inv_id,amount,currency,status,is_recurring,activate_auto_renew,scheduled_change_kind,checkout_expires_at,created_at")
        .eq("company_id", ctx.companyId)
        .eq("plan", plan)
        .eq("amount", planConfig.amountKopecks)
        .eq("currency", "RUB")
        .eq("activate_auto_renew", activateAutoRenew)
        .eq("is_recurring", false)
        .eq("status", "pending")
        .is("scheduled_change_kind", null)
        .gt("checkout_expires_at", now.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingPaymentError) {
        return checkoutError("PAYMENT_LOOKUP_FAILED", 500);
      }
      if (shouldReuseImmediateCheckout(existingPayment, {
        companyId: ctx.companyId,
        plan,
        amount: planConfig.amountKopecks,
        currency: "RUB",
        activateAutoRenew,
        now,
      })) {
        const reusedPayment = existingPayment as { id: string; inv_id?: unknown; amount?: unknown };
        await captureCheckoutStarted(reusedPayment, true);
        return buildPaymentResponse(reusedPayment);
      }
    }

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .insert({
        company_id: ctx.companyId,
        plan,
        amount: planConfig.amountKopecks,
        currency: "RUB",
        status: "pending",
        provider: "robokassa",
        period_start: periodStart,
        period_end: periodEnd,
        is_recurring: false,
        parent_inv_id: null,
        activate_auto_renew: activateAutoRenew,
        recurring_mandate_activated: activateAutoRenew,
        checkout_expires_at: checkoutExpiresAt,
        scheduled_change_kind: checkoutPeriod.isScheduledChange ? "paid_downgrade" : null,
        scheduled_source_plan: scheduledSourcePlan,
        scheduled_source_period_end: checkoutPeriod.isScheduledChange ? planSnapshot.periodEnd : null,
        scheduled_activation_at: checkoutPeriod.isScheduledChange ? periodStart : null,
      })
      .select("id,inv_id,amount,currency,activate_auto_renew,checkout_expires_at")
      .single();

    if (paymentError || !payment) {
      if (isUniqueViolation(paymentError)) {
        const { data: existingPayment } = await admin
          .from("payments")
          .select("id,company_id,plan,inv_id,amount,currency,status,is_recurring,activate_auto_renew,scheduled_change_kind,checkout_expires_at,created_at")
          .eq("company_id", ctx.companyId)
          .eq("plan", plan)
          .eq("amount", planConfig.amountKopecks)
          .eq("currency", "RUB")
          .eq("activate_auto_renew", activateAutoRenew)
          .eq("is_recurring", false)
          .eq("status", "pending")
          .is("scheduled_change_kind", null)
          .gt("checkout_expires_at", now.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (shouldReuseImmediateCheckout(existingPayment, {
          companyId: ctx.companyId,
          plan,
          amount: planConfig.amountKopecks,
          currency: "RUB",
          activateAutoRenew,
          now,
        })) {
          const reusedPayment = existingPayment as { id: string; inv_id?: unknown; amount?: unknown };
          await captureCheckoutStarted(reusedPayment, true);
          return buildPaymentResponse(reusedPayment);
        }
        return checkoutError("PAYMENT_ALREADY_EXISTS", 409);
      }
      return checkoutError("PAYMENT_CREATE_FAILED", 500);
    }

    await captureCheckoutStarted(payment, false);

    return buildPaymentResponse(payment as { id: string; inv_id?: unknown; amount?: unknown });
  } catch {
    return checkoutError("INTERNAL_ERROR", 500);
  }
}
