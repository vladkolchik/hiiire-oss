import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { captureBusinessEvent } from "@/lib/analytics/business-events";
import {
  CHECKOUT_TOPUP_REUSE_WINDOW_MS,
  buildCreditTopupReceipt,
  calculateCreditTopupAmountKopecks,
  parseCreditTopupQuantity,
} from "@/lib/billing/credit-topups";
import {
  getRobokassaPaymentUrl,
  isRobokassaTestMode,
  requireRobokassaMerchantLogin,
  requireRobokassaPassword1,
} from "@/lib/billing/env";
import { formatOutSum } from "@/lib/billing/plans";
import { buildCheckoutUrl, createCheckoutSignature } from "@/lib/billing/robokassa";
import { encodeRobokassaReceipt } from "@/lib/billing/robokassa-signature";
import { isAiAllowed, loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import { loadCompanyMarketingEventProperties } from "@/lib/marketing/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  credits: z.union([z.string(), z.number().int()]),
});

function getRequestOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

function parseBodyCredits(value: string | number): number | null {
  return parseCreditTopupQuantity(typeof value === "number" ? String(value) : value);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const adminAny = admin as any;

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN", message: "Пополнить баланс может только администратор компании." }, { status: 403 });
    }

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    const credits = parsed.success ? parseBodyCredits(parsed.data.credits) : null;
    if (credits === null) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: "Введите количество кредитов цифрами, не больше 5 знаков.",
          issues: [{ message: "Введите количество кредитов цифрами, не больше 5 знаков." }],
        },
        { status: 400 },
      );
    }

    const planSnapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    if (!isAiAllowed(planSnapshot)) {
      return NextResponse.json(
        {
          error: "CREDIT_TOPUP_PLAN_INACTIVE",
          message: "Сначала активируйте тариф, затем пополните баланс кредитов.",
        },
        { status: 409 },
      );
    }

    const now = new Date();
    const amountKopecks = calculateCreditTopupAmountKopecks(credits);
    const fiscalReceipt = buildCreditTopupReceipt({ credits, amountKopecks });
    const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_TOPUP_REUSE_WINDOW_MS).toISOString();
    const origin = getRequestOrigin(req);
    const merchantLogin = requireRobokassaMerchantLogin();
    const password1 = requireRobokassaPassword1();
    if (!ctx.email) {
      return NextResponse.json(
        { error: "BILLING_EMAIL_REQUIRED", message: "Не удалось определить email для чека. Обратитесь в поддержку." },
        { status: 400 },
      );
    }

    const buildTopupResponse = async (
      payment: {
        id: string;
        company_id?: unknown;
        inv_id?: unknown;
        amount?: unknown;
        credits?: unknown;
        checkout_expires_at?: unknown;
        fiscal_receipt?: unknown;
      },
      reused: boolean,
    ) => {
      const invId = Number(payment.inv_id ?? 0);
      if (!Number.isSafeInteger(invId) || invId <= 0) {
        return NextResponse.json(
          { error: "CREDIT_TOPUP_INV_ID_INVALID", message: "Не удалось подготовить оплату. Попробуйте ещё раз." },
          { status: 500 },
        );
      }

      const paymentAmountKopecks = Number(payment.amount ?? amountKopecks);
      const paymentCredits = Number(payment.credits ?? credits);
      const receipt = payment.fiscal_receipt ?? fiscalReceipt;
      const encodedReceipt = encodeRobokassaReceipt(receipt);
      const outSum = formatOutSum(Number.isFinite(paymentAmountKopecks) ? paymentAmountKopecks : amountKopecks);
      const shp = { Shp_credit_topup_id: String(payment.id) };
      const marketingEventProperties = await loadCompanyMarketingEventProperties(ctx.companyId);
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
        description: `hiiire credit top-up: ${paymentCredits} credits`,
        signatureValue,
        resultUrl: `${origin}/api/billing/robokassa-webhook`,
        successUrl: `${origin}/dashboard/settings?tab=plan&payment=credit_topup_success`,
        failUrl: `${origin}/dashboard/settings?tab=plan&payment=credit_topup_failed`,
        isTest: isRobokassaTestMode(),
        recurring: false,
        email: ctx.email,
        expirationDate: typeof payment.checkout_expires_at === "string" ? payment.checkout_expires_at : checkoutExpiresAt,
        receipt: encodedReceipt,
        shp,
      });

      await captureBusinessEvent({
        event: "checkout_started",
        userId: ctx.userId,
        companyId: ctx.companyId,
        role: ctx.role,
        properties: {
          payment_id: String(payment.id),
          inv_id: invId,
          amount_kopecks: paymentAmountKopecks,
          credits: paymentCredits,
          currency: "RUB",
          provider: "robokassa",
          source: "credit_topup",
          reused,
          ...marketingEventProperties,
        },
      });

      return NextResponse.json(
        {
          checkoutUrl,
          paymentId: String(payment.id),
          invId,
          credits: paymentCredits,
          amount: paymentAmountKopecks,
          reused,
        },
        { status: 200 },
      );
    };

    const { data: topupRows, error: topupPaymentError } = await adminAny.rpc("create_or_reuse_credit_topup_payment", {
      p_company_id: ctx.companyId,
      p_credits: credits,
      p_amount: amountKopecks,
      p_currency: "RUB",
      p_fiscal_receipt: fiscalReceipt,
      p_checkout_expires_at: checkoutExpiresAt,
      p_now: now.toISOString(),
    });

    const topupPayment = Array.isArray(topupRows) ? topupRows[0] : null;
    if (topupPaymentError || !topupPayment) {
      return NextResponse.json(
        { error: "CREDIT_TOPUP_CREATE_FAILED", message: "Не удалось подготовить оплату. Попробуйте ещё раз." },
        { status: 500 },
      );
    }

    return buildTopupResponse(topupPayment as {
      id: string;
      company_id?: unknown;
      inv_id?: unknown;
      amount?: unknown;
      credits?: unknown;
      checkout_expires_at?: unknown;
      fiscal_receipt?: unknown;
    }, Boolean(topupPayment.reused));
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось подготовить оплату. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
