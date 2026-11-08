import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsPage = readFileSync(
  new URL("../app/(dashboard)/dashboard/settings/page.tsx", import.meta.url),
  "utf8",
);
const checkoutRoute = readFileSync(
  new URL("../app/api/billing/checkout/route.ts", import.meta.url),
  "utf8",
);
const billingHandlers = settingsPage.slice(
  settingsPage.indexOf("const startCheckout"),
  settingsPage.indexOf("const handlePlanAction"),
);

test("maps checkout guard errors to user-facing copy", () => {
  assert.match(settingsPage, /PLAN_PERIOD_END_REQUIRED/);
  assert.match(settingsPage, /SCHEDULE_DOWNGRADE_REQUIRED/);
  assert.match(settingsPage, /Нужно уточнить дату окончания текущего тарифа/);
  assert.match(settingsPage, /Starter можно включить после окончания текущего периода/);
});

test("maps Enterprise checkout guard to request-oriented user copy", () => {
  assert.match(settingsPage, /ENTERPRISE_CHANGE_REQUIRES_SUPPORT/);
  assert.match(settingsPage, /Оставить заявку/);
  assert.match(settingsPage, /Мы проверим условия Enterprise и свяжемся с вами/);
  assert.match(settingsPage, /Заявка на смену тарифа:/);
  assert.match(settingsPage, /Заявка отправлена/);
  assert.doesNotMatch(settingsPage, /напишите в поддержку/);
});

test("does not show raw billing error codes in visible descriptions", () => {
  assert.doesNotMatch(billingHandlers, /description:\s*String\(json\?\.error/);
  assert.doesNotMatch(billingHandlers, /code\s*\|\|\s*"Действие сейчас недоступно"/);
  assert.match(settingsPage, /PAYMENT_CREATE_FAILED/);
  assert.match(settingsPage, /Не удалось подготовить оплату\. Попробуйте ещё раз\./);
  assert.match(settingsPage, /Не удалось сохранить изменение\. Попробуйте ещё раз\./);
});

test("plan checkout consent guard stays clickable and explains the checkbox", () => {
  assert.match(settingsPage, /isBlockedByBillingConsent/);
  assert.match(settingsPage, /showBillingConsentRequiredToast/);
  assert.match(settingsPage, /aria-disabled=\{isStarterPlanButtonDisabled\}/);
  assert.match(settingsPage, /aria-disabled=\{isProfessionalPlanButtonDisabled\}/);
  assert.match(settingsPage, /isStarterBlockedByBillingConsent \? \(/);
  assert.match(settingsPage, /isProfessionalBlockedByBillingConsent \? \(/);
  assert.match(settingsPage, /absolute inset-0 z-10/);
  assert.doesNotMatch(settingsPage, /disabled=\{[\s\S]*!billingConsent[\s\S]*?\}/);
  assert.match(settingsPage, /Для оплаты нужно согласие/);
  assert.match(settingsPage, /поставьте галочку внизу страницы/);
});

test("plan checkout loading label is scoped to the clicked paid plan", () => {
  assert.match(settingsPage, /checkoutLoadingPlan === targetPlan/);
  assert.doesNotMatch(settingsPage, /isCheckoutLoading \|\| isPlanActionLoading\) return "Переход к оплате…"/);
});

test("checkout API rejects Enterprise as a self-service target", () => {
  assert.match(checkoutRoute, /rawPlan === "enterprise"[\s\S]*PLAN_NOT_SUPPORTED/);
});

test("checkout API error responses include safe user-facing messages", () => {
  assert.match(checkoutRoute, /function checkoutError/);
  assert.match(checkoutRoute, /message:/);
  assert.doesNotMatch(checkoutRoute, /NextResponse\.json\(\{\s*error:\s*"[A-Z_]+"/);
});
