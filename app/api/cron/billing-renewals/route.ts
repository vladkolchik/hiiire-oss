import { NextResponse, type NextRequest } from "next/server";

import {
  getRobokassaRecurringUrl,
  isRobokassaRecurringEnabled,
  isRobokassaTestMode,
  requireRobokassaMerchantLogin,
  requireRobokassaPassword1,
} from "@/lib/billing/env";
import { buildSubscriptionReceipt } from "@/lib/billing/fiscal-receipts";
import { addCalendarMonth, formatOutSum, getBillingPlan, isBillablePlan } from "@/lib/billing/plans";
import {
  ACTIVE_RECURRING_RENEWAL_STATUSES,
  isCompletedRecurringMandatePayment,
  resolveRecurringMandateInvId,
  selectRecurringRenewalAttemptAction,
} from "@/lib/billing/recurring-renewals";
import { buildRecurringBody, createRecurringSignature } from "@/lib/billing/robokassa";
import { encodeRobokassaReceipt } from "@/lib/billing/robokassa-signature";
import { activateDueScheduledPlanPayments, BILLING_GRACE_DAYS } from "@/lib/billing/subscription";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RECURRING_RENEWAL_ATTEMPTS = 3;

function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

function normalizeBillingEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  return email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

async function resolveCompanyBillingEmail(admin: any, companyId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("email")
    .eq("company_id", companyId)
    .eq("role", "admin")
    .not("email", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return normalizeBillingEmail((data as { email?: unknown } | null)?.email);
}

export async function POST(req: NextRequest) {
  const expected = String(process.env.CRON_SECRET ?? "");
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const now = new Date();

    let expiredImmediateCheckouts = 0;
    try {
      const { data, error } = await admin.rpc("expire_pending_immediate_checkouts", {
        p_now: now.toISOString(),
      });
      if (error) {
        return NextResponse.json({ error: "IMMEDIATE_CHECKOUT_EXPIRY_FAILED" }, { status: 500 });
      }
      expiredImmediateCheckouts = Number(data ?? 0);
    } catch {
      return NextResponse.json({ error: "IMMEDIATE_CHECKOUT_EXPIRY_FAILED" }, { status: 500 });
    }

    let activatedScheduledPlanCount = 0;
    try {
      activatedScheduledPlanCount = await activateDueScheduledPlanPayments(admin);
    } catch {
      return NextResponse.json({ error: "SCHEDULED_PLAN_ACTIVATION_FAILED" }, { status: 500 });
    }

    if (!isRobokassaRecurringEnabled()) {
      return NextResponse.json(
        {
          ok: true,
          expiredImmediateCheckouts,
          activatedScheduledPlans: activatedScheduledPlanCount,
          processed: 0,
          created: 0,
          submitted: 0,
          failed: 0,
          disabledAutoRenew: 0,
          skipped: 0,
          reason: "RECURRING_DISABLED",
        },
        { status: 200 }
      );
    }

    const { data: rows, error: rowsError } = await admin
      .from("company_plans")
      .select("company_id,current_plan,period_end,auto_renew,robokassa_inv_id,recurring_mandate_inv_id,scheduled_plan,scheduled_plan_effective_at")
      .eq("auto_renew", true)
      .not("period_end", "is", null);

    if (rowsError) {
      return NextResponse.json({ error: "PLANS_LOOKUP_FAILED" }, { status: 500 });
    }

    let processed = 0;
    let created = 0;
    let submitted = 0;
    let failed = 0;
    let disabledAutoRenew = 0;
    let skipped = 0;

    const merchantLogin = requireRobokassaMerchantLogin();
    const password1 = requireRobokassaPassword1();
    const recurringUrl = getRobokassaRecurringUrl();
    const isTest = isRobokassaTestMode();

    const disableAutoRenewWithScheduleClear = async (companyId: string) => {
      const { error } = await admin
        .from("company_plans")
        .update({
          auto_renew: false,
          scheduled_plan: null,
          scheduled_plan_effective_at: null,
          scheduled_payment_id: null,
        })
        .eq("company_id", companyId);
      return error;
    };

    for (const row of rows ?? []) {
      processed += 1;

      const currentPlan = String((row as { current_plan?: unknown }).current_plan ?? "");
      const scheduledPlanRaw = String((row as { scheduled_plan?: unknown }).scheduled_plan ?? "");
      const scheduledPlanEffectiveAtRaw = (row as { scheduled_plan_effective_at?: unknown }).scheduled_plan_effective_at;
      const scheduledPlanEffectiveAt = typeof scheduledPlanEffectiveAtRaw === "string" ? new Date(scheduledPlanEffectiveAtRaw) : null;
      const scheduledPlanIsDue = Boolean(
        scheduledPlanRaw
        && scheduledPlanEffectiveAt
        && Number.isFinite(scheduledPlanEffectiveAt.getTime())
        && now.getTime() >= scheduledPlanEffectiveAt.getTime()
      );

      const targetPlan = scheduledPlanIsDue ? scheduledPlanRaw : currentPlan;
      if (!isBillablePlan(targetPlan)) {
        skipped += 1;
        continue;
      }

      const periodEndIso = String((row as { period_end?: unknown }).period_end ?? "");
      const periodEnd = new Date(periodEndIso);
      if (!Number.isFinite(periodEnd.getTime())) {
        skipped += 1;
        continue;
      }

      if (now.getTime() <= periodEnd.getTime()) {
        skipped += 1;
        continue;
      }

      const graceEnd = new Date(periodEnd.getTime() + BILLING_GRACE_DAYS * DAY_MS);
      if (now.getTime() > graceEnd.getTime()) {
        const disableError = await disableAutoRenewWithScheduleClear(row.company_id);
        if (!disableError) disabledAutoRenew += 1;
        skipped += 1;
        continue;
      }

      const parentInvId = resolveRecurringMandateInvId(row as { robokassa_inv_id?: unknown; recurring_mandate_inv_id?: unknown });
      if (parentInvId === null) {
        const disableError = await disableAutoRenewWithScheduleClear(row.company_id);
        if (!disableError) disabledAutoRenew += 1;
        skipped += 1;
        continue;
      }

      const { data: parentPayment, error: parentPaymentError } = await admin
        .from("payments")
        .select("id,status,recurring_mandate_activated")
        .eq("company_id", row.company_id)
        .eq("inv_id", parentInvId)
        .maybeSingle();

      if (parentPaymentError) {
        failed += 1;
        continue;
      }

      if (!isCompletedRecurringMandatePayment(parentPayment)) {
        const disableError = await disableAutoRenewWithScheduleClear(row.company_id);
        if (!disableError) disabledAutoRenew += 1;
        skipped += 1;
        continue;
      }

      const plan = getBillingPlan(targetPlan);
      const outSum = formatOutSum(plan.amountKopecks);
      const billingEmail = await resolveCompanyBillingEmail(admin, row.company_id);
      if (!billingEmail) {
        failed += 1;
        continue;
      }
      const encodedReceipt = encodeRobokassaReceipt(
        buildSubscriptionReceipt({
          planLabel: plan.label,
          amountKopecks: plan.amountKopecks,
        }),
      );
      const nextPeriodStart = periodEnd;
      const nextPeriodEnd = addCalendarMonth(periodEnd);
      const nextPeriodStartIso = nextPeriodStart.toISOString();

      const { data: attempts, error: attemptsError } = await admin
        .from("payments")
        .select("id,status,created_at")
        .eq("company_id", row.company_id)
        .eq("is_recurring", true)
        .eq("parent_inv_id", parentInvId)
        .eq("period_start", nextPeriodStartIso)
        .order("created_at", { ascending: false })
        .limit(30);

      if (attemptsError) {
        failed += 1;
        continue;
      }

      const attemptRows = (attempts ?? []) as Array<{ id: string; status: string; created_at: string }>;
      const attemptDecision = selectRecurringRenewalAttemptAction({
        attempts: attemptRows,
        now,
        graceEnd,
        maxAttempts: MAX_RECURRING_RENEWAL_ATTEMPTS,
      });
      if (attemptDecision.action === "disable_auto_renew") {
        const disableError = await disableAutoRenewWithScheduleClear(row.company_id);
        if (!disableError) disabledAutoRenew += 1;
        skipped += 1;
        continue;
      }
      if (attemptDecision.action === "skip") {
        skipped += 1;
        continue;
      }

      const { data: payment, error: paymentError } = await admin
        .from("payments")
        .insert({
          company_id: row.company_id,
          plan: targetPlan,
          amount: plan.amountKopecks,
          currency: "RUB",
          status: "pending",
          provider: "robokassa",
          period_start: nextPeriodStart.toISOString(),
          period_end: nextPeriodEnd.toISOString(),
          is_recurring: true,
          parent_inv_id: parentInvId,
          recurring_mandate_activated: true,
        })
        .select("id,inv_id")
        .single();

      if (paymentError || !payment) {
        if (isUniqueViolation(paymentError)) {
          const { data: activeAttempt } = await admin
            .from("payments")
            .select("id,status")
            .eq("company_id", row.company_id)
            .eq("is_recurring", true)
            .eq("parent_inv_id", parentInvId)
            .eq("period_start", nextPeriodStartIso)
            .in("status", [...ACTIVE_RECURRING_RENEWAL_STATUSES])
            .limit(1)
            .maybeSingle();

          if (activeAttempt) {
            skipped += 1;
            continue;
          }
        }
        failed += 1;
        continue;
      }
      created += 1;

      const invId = Number((payment as { inv_id?: unknown }).inv_id ?? NaN);
      if (!Number.isSafeInteger(invId) || invId <= 0) {
        await admin
          .from("payments")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            fail_reason: "INVALID_INV_ID",
          })
          .eq("id", payment.id);
        failed += 1;
        continue;
      }

      const signatureValue = createRecurringSignature({
        merchantLogin,
        outSum,
        invoiceId: invId,
        password1,
        receipt: encodedReceipt,
      });

      const body = buildRecurringBody({
        merchantLogin,
        invoiceId: invId,
        previousInvoiceId: parentInvId,
        outSum,
        description: `hiiire ${plan.label} recurring`,
        signatureValue,
        isTest,
        email: billingEmail,
        receipt: encodedReceipt,
      });

      const response = await fetch(recurringUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }).catch(() => null);

      if (!response) {
        await admin
          .from("payments")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            fail_reason: "RECURRING_REQUEST_FAILED",
          })
          .eq("id", payment.id);
        failed += 1;
        continue;
      }

      const responseText = (await response.text().catch(() => "")).trim();
      const accepted = response.ok && /^OK/i.test(responseText);
      if (!accepted) {
        await admin
          .from("payments")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            fail_reason: `${response.status}:${responseText.slice(0, 300)}`,
          })
          .eq("id", payment.id);
        failed += 1;
        continue;
      }

      submitted += 1;
    }

    return NextResponse.json(
      { ok: true, expiredImmediateCheckouts, activatedScheduledPlans: activatedScheduledPlanCount, processed, created, submitted, failed, disabledAutoRenew, skipped },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
