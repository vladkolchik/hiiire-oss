import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const requestAccessPage = readFileSync(
  new URL("../app/(marketing)/request-access/page.tsx", import.meta.url),
  "utf8",
);

const adminBillingPage = readFileSync(
  new URL("../app/(admin)/admin/(protected)/billing/page.tsx", import.meta.url),
  "utf8",
);

const adminTariffRequestsPage = readFileSync(
  new URL("../app/(admin)/admin/(protected)/tariff-requests/page.tsx", import.meta.url),
  "utf8",
);

const juniorQaGuide = readFileSync(
  new URL("../docs/For_juniors/hiiire_for_junior.md", import.meta.url),
  "utf8",
);

const adminBillingTabs = readFileSync(
  new URL("../app/(admin)/admin/billing/billing-admin-tabs.tsx", import.meta.url),
  "utf8",
);

const planChangeRequestsTable = readFileSync(
  new URL("../app/(admin)/admin/billing/plan-change-requests-table.tsx", import.meta.url),
  "utf8",
);

const planChangeRequestFlow = readFileSync(
  new URL("../app/(admin)/admin/billing/plan-change-request-flow.ts", import.meta.url),
  "utf8",
);

const manualInvoicesTable = readFileSync(
  new URL("../app/(admin)/admin/billing/manual-invoices-table.tsx", import.meta.url),
  "utf8",
);

const enterpriseAgreementsTable = readFileSync(
  new URL("../app/(admin)/admin/billing/enterprise-agreements-table.tsx", import.meta.url),
  "utf8",
);

const enterpriseAgreementsRoute = readFileSync(
  new URL("../app/api/admin/billing/enterprise-agreements/route.ts", import.meta.url),
  "utf8",
);

const enterpriseAgreementDetailRoute = readFileSync(
  new URL("../app/api/admin/billing/enterprise-agreements/[id]/route.ts", import.meta.url),
  "utf8",
);

const enterpriseAgreementRestoreDraftRoute = readFileSync(
  new URL("../app/api/admin/billing/enterprise-agreements/[id]/restore-draft/route.ts", import.meta.url),
  "utf8",
);

const enterpriseAgreementEndRoute = readFileSync(
  new URL("../app/api/admin/billing/enterprise-agreements/[id]/end/route.ts", import.meta.url),
  "utf8",
);

const tariffRequestsActions = readFileSync(
  new URL("../app/(admin)/admin/tariff-requests/actions.ts", import.meta.url),
  "utf8",
);

const planChangeStatusRoute = readFileSync(
  new URL("../app/api/admin/billing/plan-change-requests/[id]/status/route.ts", import.meta.url),
  "utf8",
);

const adminPlanChangeRequestsRoute = readFileSync(
  new URL("../app/api/admin/billing/plan-change-requests/route.ts", import.meta.url),
  "utf8",
);

const adminSidebar = readFileSync(
  new URL("../components/admin/admin-sidebar.tsx", import.meta.url),
  "utf8",
);

const enterpriseRequestAgreementLifecycleGuardMigration = readFileSync(
  new URL("../supabase/sql/enterprise_request_agreement_lifecycle_guard_v1.sql", import.meta.url),
  "utf8",
);

const enterpriseRequestFlowDrawerGuardsMigration = readFileSync(
  new URL("../supabase/sql/enterprise_request_flow_drawer_guards_v1.sql", import.meta.url),
  "utf8",
);

test("request-access has user-facing copy for authenticated billing requests", () => {
  assert.match(requestAccessPage, /Заявка на изменение тарифа отправлена/);
  assert.match(requestAccessPage, /Enterprise уже подключён/);
  assert.match(requestAccessPage, /Заявку на изменение тарифа может отправить администратор компании/);
  assert.doesNotMatch(requestAccessPage, /description:\s*String\(json\?\.error/);
  assert.doesNotMatch(requestAccessPage, /throw new Error\(String\(json\?\.error/);
});

test("admin billing shell exposes enterprise billing management tabs", () => {
  for (const label of ["Enterprise Leads", "Plan Change Requests", "Enterprise Agreements", "Manual Invoices"]) {
    assert.match(adminBillingTabs, new RegExp(label));
  }

  assert.match(adminBillingPage, /billing_plan_change_requests/);
  assert.match(adminBillingPage, /enterprise_agreements/);
  assert.match(adminBillingPage, /billing_manual_invoices/);
  assert.match(adminBillingPage, /<BillingAdminTabs/);
  assert.match(adminBillingPage, /условия Enterprise/);
  assert.doesNotMatch(adminBillingPage, /договорённости/);
});

test("admin billing request actions use a complete active agreement source", () => {
  assert.match(adminBillingPage, /activeAgreementsResult/);
  assert.match(adminBillingPage, /\.from\("enterprise_agreements"\)[\s\S]*?\.eq\("status", "active"\)/);
  assert.match(adminBillingPage, /activeEnterpriseAgreements=/);
  assert.match(adminBillingPage, /enterpriseAgreements=/);
  assert.match(adminBillingTabs, /activeEnterpriseAgreements/);
  assert.match(adminBillingTabs, /<PlanChangeRequestsTable[\s\S]*enterpriseAgreements=\{enterpriseAgreements\}/);
  assert.match(adminBillingTabs, /<PlanChangeRequestsTable[\s\S]*activeEnterpriseAgreements=\{activeEnterpriseAgreements\}/);
  assert.match(planChangeRequestsTable, /enterpriseAgreements/);
  assert.match(planChangeRequestsTable, /activeEnterpriseAgreements/);
  assert.match(planChangeRequestsTable, /agreementBySourceRequest/);
});

test("admin sidebar links to the billing workspace", () => {
  assert.match(adminSidebar, /href: "\/admin\/billing"/);
  assert.match(adminSidebar, /title: "Enterprise Billing"/);
});

test("admin enterprise lead page names landing source clearly", () => {
  assert.match(adminTariffRequestsPage, /Заявки на Enterprise с лендинга/);
  assert.match(adminTariffRequestsPage, /\/request-access/);
  assert.doesNotMatch(adminTariffRequestsPage, /из формы \/request-access/);
  assert.match(adminTariffRequestsPage, /Не удалось загрузить заявки\. Обновите страницу или попробуйте позже\./);
  assert.doesNotMatch(adminTariffRequestsPage, /error\.message/);
});

test("admin enterprise billing tables expose company context and search controls", () => {
  assert.match(adminBillingPage, /\.from\("billing_plan_change_requests"\)[\s\S]*\.select\("\*,companies\(name\)"/);
  assert.match(adminBillingPage, /\.from\("billing_manual_invoices"\)[\s\S]*\.select\("\*,companies\(name\)"/);
  assert.match(adminBillingPage, /companyName/);

  for (const source of [adminBillingTabs, planChangeRequestsTable, manualInvoicesTable, enterpriseAgreementsTable]) {
    assert.match(source, /Search/);
    assert.match(source, /placeholder="Поиск/);
  }

  assert.match(planChangeRequestsTable, /CommandInput[\s\S]*Поиск по компании/);
  assert.match(planChangeRequestsTable, /companyName/);
  assert.match(planChangeRequestsTable, /filteredRows/);
  assert.match(planChangeRequestsTable, /companyName:\s*updatedRequest\.companyName \?\? row\.companyName/);
  assert.match(planChangeRequestsTable, /selectedActiveAgreement\?\.companyName/);
  assert.match(manualInvoicesTable, /companyName/);
  assert.match(manualInvoicesTable, /filteredRows/);
  assert.match(adminBillingTabs, /filteredEnterpriseLeads\.length === 0 && enterpriseLeads\.length > 0/);
  assert.doesNotMatch(adminBillingTabs, /filteredEnterpriseAgreements/);
  assert.match(adminBillingTabs, /Поиск ничего не нашёл/);
  assert.match(enterpriseAgreementsTable, /const \[searchQuery, setSearchQuery\]/);
  assert.match(enterpriseAgreementsTable, /filteredItems/);
  assert.match(enterpriseAgreementsTable, /companyName:\s*next\.companyName \?\? row\.companyName/);
  assert.match(enterpriseAgreementsTable, /Поиск ничего не нашёл/);
});

test("junior QA guide reflects enterprise admin billing labels", () => {
  assert.match(juniorQaGuide, /Enterprise заявки[\s\S]*Заявки на Enterprise с лендинга/);
  assert.match(juniorQaGuide, /Enterprise Billing[\s\S]*Enterprise-переходы/);
  assert.match(juniorQaGuide, /\/admin\/billing[\s\S]*поиск по вкладкам/i);
  assert.match(juniorQaGuide, /Активная Enterprise-компания[\s\S]*поиск/i);
  assert.match(juniorQaGuide, /Manual Invoices[\s\S]*название компании/i);
  assert.doesNotMatch(juniorQaGuide, /\| Billing \| `\/admin\/billing`/);
});

test("admin plan-change requests table uses drawer-based Enterprise request flow copy", () => {
  const visiblePlanChangeFlowCopy = `${planChangeRequestsTable}\n${planChangeRequestFlow}`;

  for (const copy of [
    "Управлять",
    "В работе",
    "Решение",
    "Условия Enterprise",
    "Подключение",
    "Отключение Enterprise",
    "Обновление условий",
    "Решение отвечает на вопрос: продолжаем по этой заявке или нет.",
    "После одобрения можно будет заполнить условия Enterprise. Enterprise ещё не включится.",
    "Это условия, по которым клиенту должен предоставляться тариф: срок, кредиты и дополнительные опции.",
    "Сохранить комментарии",
    "Одобрить и перейти к условиям",
    "Одобрить выход из Enterprise",
    "Одобрить изменение тарифа",
    "Создать условия Enterprise",
    "Отметить как применено",
    "Закрыть без решения",
    "Отклонить",
    "Не удалось обновить заявку. Попробуйте ещё раз.",
    "Проверьте комментарий к заявке на выход.",
    "Активные условия Enterprise не найдены. Обновите таблицу перед продолжением.",
    "Активные условия Enterprise не найдены. Обновите таблицу перед созданием новых условий.",
    "Переход на Enterprise",
    "Выход из Enterprise",
    "Изменение условий Enterprise",
    "Ручное изменение тарифа",
    "Лендинг",
    "Настройки",
    "Админка",
    "Новые условия Enterprise нужно создавать из одобренной заявки.",
    "Условия Enterprise нужно создавать из одобренной заявки.",
    "По этой заявке условия Enterprise уже созданы.",
    "Условия Enterprise можно создать только из заявки на переход на Enterprise.",
    "Сначала одобрите заявку на изменение условий Enterprise.",
  ]) {
    assert.match(visiblePlanChangeFlowCopy, new RegExp(copy));
  }

  assert.match(planChangeRequestsTable, /Sheet/);
  assert.match(planChangeRequestsTable, /adminNote/);
  assert.match(planChangeRequestsTable, /publicResponse/);
  assert.match(planChangeRequestsTable, /RequestNoteDraft/);
  assert.match(planChangeRequestsTable, /sourceUpdatedAt/);
  assert.match(planChangeRequestsTable, /function updateRow[\s\S]*setRequestNoteDraft\(\{[\s\S]*sourceUpdatedAt: updatedRequest\.updated_at/);
  assert.match(planChangeRequestsTable, /async function saveRequestNotes[\s\S]*updateRow\(json\.request\)/);
  assert.match(planChangeRequestsTable, /async function updateStatus[\s\S]*updateRow\(json\.request\)/);
  assert.match(planChangeRequestsTable, /activeAgreementByCompany\.get\(row\.company_id\)/);
  assert.match(planChangeRequestsTable, /sourceRequestUpdatedAt: requestNoteDraft\.sourceUpdatedAt/);
  assert.match(planChangeRequestsTable, /EXIT_REASON_MAX_LENGTH = 2000/);
  assert.match(planChangeRequestsTable, /exitReasonFromDraft/);
  assert.match(planChangeRequestsTable, /\.slice\(0, EXIT_REASON_MAX_LENGTH\)/);
  assert.match(planChangeRequestsTable, /EXIT_REQUEST_CREATE_ERROR_COPY/);
  assert.match(planChangeRequestsTable, /maxLength=\{4000\}/);
  assert.match(planChangeRequestsTable, /status: "applied"/);
  assert.match(planChangeRequestsTable, /pendingId === `manual:\$\{selectedRequest\.id\}`/);
  assert.match(planChangeRequestsTable, /CLIENT_RESPONSE_PLACEHOLDER\[row\.request_kind\]/);
  assert.match(planChangeRequestFlow, /enterprise_exit: "Например: заявка одобрена, отключим Enterprise и сменим тариф"/);
  assert.match(planChangeRequestFlow, /manual_plan_change: "Например: заявка одобрена, тариф изменим вручную"/);
  assert.match(planChangeRequestsTable, /selectedActiveAgreementId/);
  assert.match(planChangeRequestsTable, /selectedTermsChangeMissingActiveAgreement/);
  assert.match(planChangeRequestsTable, /selectedRequest\.request_kind !== "enterprise_terms_change" \|\| selectedActiveAgreementId/);
  assert.match(planChangeRequestsTable, /hasActiveAgreement=\{Boolean\(selectedActiveAgreementId\)\}/);
  assert.match(planChangeRequestsTable, /disabled=\{pending \|\| !hasActiveAgreement\}/);
  assert.doesNotMatch(planChangeRequestsTable, /sourceRequestUpdatedAt: row\.updated_at/);
  assert.doesNotMatch(planChangeRequestsTable, /Клиенту отправлен ответ/);
  assert.doesNotMatch(planChangeRequestsTable, /Заявка отменена/);
  assert.doesNotMatch(planChangeRequestsTable, /type="hidden" name="adminNote"/);
  assert.doesNotMatch(planChangeRequestsTable, /defaultValue=\{row\.admin_note/);
  assert.doesNotMatch(planChangeRequestsTable, /defaultValue=\{row\.public_response/);
  assert.doesNotMatch(planChangeRequestsTable, /current_enterprise_agreement_id/);
  assert.match(planChangeStatusRoute, /NOTE_ONLY_UPDATE/);
  assert.match(planChangeStatusRoute, /updatedAt/);
  assert.match(planChangeStatusRoute, /updatedAt:\s*z\.string\(\)\.datetime\(\{ offset: true \}\)/);
  assert.match(planChangeStatusRoute, /\.eq\("updated_at", parsed\.data\.updatedAt\)/);
  assert.match(planChangeStatusRoute, /if \(!parsed\.data\.status\)/);
  assert.match(enterpriseAgreementsRoute, /sourceRequestUpdatedAt/);
  assert.match(enterpriseAgreementsRoute, /rpc\("create_enterprise_agreement_from_request"/);
  assert.match(enterpriseAgreementsRoute, /REQUEST_STATUS_CHANGED/);
  assert.match(enterpriseAgreementEndRoute, /sourceRequestUpdatedAt/);
  assert.match(enterpriseAgreementEndRoute, /p_source_request_updated_at/);
  assert.match(enterpriseAgreementEndRoute, /REQUEST_STATUS_CHANGED/);
  assert.match(enterpriseRequestFlowDrawerGuardsMigration, /create_enterprise_agreement_from_request/);
  assert.match(enterpriseRequestFlowDrawerGuardsMigration, /p_source_request_updated_at/);
  assert.match(enterpriseRequestFlowDrawerGuardsMigration, /REQUEST_STATUS_CHANGED/);
  assert.match(enterpriseRequestFlowDrawerGuardsMigration, /update public\.billing_plan_change_requests[\s\S]*updated_at = v_now/);
  assert.match(enterpriseRequestFlowDrawerGuardsMigration, /end_enterprise_agreement/);
  assert.doesNotMatch(planChangeRequestsTable, /toast\.error\(String\(json\?\.error/);
  assert.doesNotMatch(planChangeRequestsTable, /description:\s*String\(json\?\.error/);

  const visiblePlanChangeRequestCopy = planChangeRequestsTable
    .replace(/agreementBySourceRequest/g, "")
    .replace(/EnterpriseAgreement/g, "")
    .replace(/AGREEMENT_[A-Z_]+/g, "");
  assert.doesNotMatch(visiblePlanChangeRequestCopy, /договорённ|договоренн|договоренность|договорённость/i);
});

test("admin billing workspace can create agreements and issue manual invoices from UI", () => {
  assert.match(planChangeRequestsTable, /\/api\/admin\/billing\/enterprise-agreements/);
  assert.match(planChangeRequestsTable, /sourceRequestId/);
  assert.match(planChangeRequestsTable, /enterprise_terms_change/);
  assert.match(planChangeRequestsTable, /replacesAgreementId/);
  assert.match(planChangeRequestsTable, /Создать условия Enterprise/);
  assert.match(planChangeRequestsTable, /Создать новые условия Enterprise/);
  assert.doesNotMatch(planChangeRequestsTable, /Создать договорённость/);
  assert.doesNotMatch(planChangeRequestsTable, /Создать изменение условий/);

  assert.match(enterpriseAgreementsTable, /\/issue-invoice/);
  assert.match(enterpriseAgreementsTable, /amountKopecks/);
  assert.match(enterpriseAgreementsTable, /Выставить счёт/);
  assert.match(enterpriseAgreementsTable, /Email для счёта/);
  assert.match(enterpriseAgreementsTable, /Укажите email для чека/);
  assert.match(enterpriseAgreementsTable, /PAYER_EMAIL_REQUIRED/);
  assert.match(enterpriseAgreementsTable, /MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH/);
  assert.match(enterpriseAgreementsTable, /AGREEMENT_NOT_INVOICEABLE/);
  assert.match(enterpriseAgreementsTable, /SOURCE_REQUEST_REQUIRED/);
  assert.match(enterpriseAgreementsTable, /Статус договорённости изменился/);
  assert.match(enterpriseAgreementsTable, /INVOICE_STATE_REPAIR_FAILED/);
  assert.match(enterpriseAgreementsTable, /INVOICE_REVIEW_MARK_FAILED/);
  assert.match(enterpriseAgreementsTable, /INVOICE_STATUS_CHANGED/);
  assert.match(enterpriseAgreementsTable, /PAID_INVOICE_REQUIRED/);
  assert.match(enterpriseAgreementsTable, /SOURCE_REQUEST_CURRENT_PLAN_INVALID/);
  assert.match(enterpriseAgreementsTable, /SOURCE_REQUEST_APPLY_FAILED/);
  assert.match(enterpriseAgreementsTable, /Текущий тариф в заявке не подходит/);
  assert.match(enterpriseAgreementsTable, /Не удалось активировать Enterprise и закрыть заявку/);
  assert.doesNotMatch(enterpriseAgreementsTable, /Enterprise активирован, но заявку/);
  assert.match(enterpriseAgreementsTable, /AGREEMENT_HAS_PAYABLE_INVOICE/);
  assert.match(enterpriseAgreementsTable, /const canEdit = row\.status === "draft"/);
  assert.match(enterpriseAgreementsTable, /const canActivate = row\.status === "pending_payment"/);
  assert.match(enterpriseAgreementsTable, /const canRestoreDraft = row\.status === "pending_payment"/);
  assert.doesNotMatch(enterpriseAgreementsTable, /const canEdit = row\.status === "draft" \|\| row\.status === "pending_payment"/);
  assert.doesNotMatch(enterpriseAgreementsTable, /const canActivate = row\.status === "draft" \|\| row\.status === "pending_payment"/);
  assert.match(enterpriseAgreementsTable, /\/restore-draft/);
  assert.match(enterpriseAgreementsTable, /Вернуть в черновик/);
  const editBlock = enterpriseAgreementsTable.match(/\{canEdit \? \([\s\S]*?\n\s*\) : null\}/)?.[0] ?? "";
  assert.doesNotMatch(editBlock, /activate\(row\)/);
  assert.doesNotMatch(editBlock, /Активировать/);
  assert.match(enterpriseAgreementsTable, /value=\{draft\.termsSummary\}[\s\S]*maxLength=\{5000\}/);
  assert.match(enterpriseAgreementsTable, /value=\{draft\.internalNote\}[\s\S]*maxLength=\{5000\}/);
  assert.match(enterpriseAgreementsTable, /value=\{invoiceForm\.description\}[\s\S]*maxLength=\{MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH\}/);
  assert.doesNotMatch(enterpriseAgreementsTable, /toast\.error\(String\(json\?\.error/);
});

test("admin enterprise agreements tab explains the manual subscription flow", () => {
  for (const copy of [
    "Как подключить или отключить Enterprise",
    "Чтобы подключить Enterprise",
    "Создать условия Enterprise",
    "Сохранить",
    "Отменить договорённость",
    "Активировать",
    "Выставить счёт",
    "когда счёт оплачен",
    "верните условия Enterprise в черновик",
    "Чтобы отключить Enterprise",
    "Завершить Enterprise по заявке",
  ]) {
    assert.match(adminBillingTabs, new RegExp(copy));
  }

  assert.match(adminBillingTabs, /Выставить счёт[\s\S]*Активировать/);
});

test("platform admins can record Enterprise exit requests before applying them", () => {
  assert.match(adminPlanChangeRequestsRoute, /requirePlatformAdmin/);
  assert.match(adminPlanChangeRequestsRoute, /targetPlan:\s*z\.enum\(\["starter", "professional"\]\)/);
  assert.match(adminPlanChangeRequestsRoute, /\.from\("enterprise_agreements"\)[\s\S]*\.eq\("status", "active"\)/);
  assert.match(adminPlanChangeRequestsRoute, /\.from\("company_plans"\)[\s\S]*\.eq\("current_plan", "enterprise"\)/);
  assert.match(adminPlanChangeRequestsRoute, /COMPANY_PLAN_ENTERPRISE_REQUIRED/);
  assert.match(adminPlanChangeRequestsRoute, /\.from\("billing_plan_change_requests"\)[\s\S]*\.in\("status", ACTIVE_PLAN_CHANGE_REQUEST_STATUSES\)/);
  assert.match(adminPlanChangeRequestsRoute, /request_kind:\s*"enterprise_exit"/);
  assert.match(adminPlanChangeRequestsRoute, /source:\s*"admin"/);
  assert.match(adminPlanChangeRequestsRoute, /ACTIVE_REQUEST_EXISTS/);
  assert.match(adminPlanChangeRequestsRoute, /insertError\?\.code === "23505"/);
  assert.match(adminPlanChangeRequestsRoute, /ACTIVE_REQUEST_RELOAD_FAILED/);

  assert.match(planChangeRequestsTable, /createExitRequest/);
  assert.match(planChangeRequestsTable, /Создать заявку на выход/);
  assert.match(planChangeRequestsTable, /ACTIVE_REQUEST_RELOAD_FAILED/);
  assert.match(planChangeRequestsTable, /ACTIVE_REQUEST_EXISTS/);
  assert.match(planChangeRequestsTable, /REQUEST_KIND_LABEL\[existingRequest\.request_kind\]/);
  assert.match(planChangeRequestsTable, /STATUS_LABEL\[existingRequest\.status\]/);
  assert.match(planChangeRequestsTable, /\/api\/admin\/billing\/plan-change-requests/);
  assert.match(planChangeRequestsTable, /exitRequestErrorMessage/);
  assert.match(planChangeRequestsTable, /EXIT_REQUEST_CREATE_ERROR_COPY\.INVALID_BODY/);
  assert.doesNotMatch(enterpriseAgreementsTable, /createExitRequest/);
  assert.doesNotMatch(enterpriseAgreementsTable, /Создать заявку на выход/);
  assert.doesNotMatch(enterpriseAgreementsTable, /Договорённость завершена/);
});

test("admin agreement API forbids company-only amendment creation", () => {
  assert.match(enterpriseAgreementsRoute, /sourceRequestId:\s*z\.string\(\)\.uuid\(\)/);
  assert.doesNotMatch(enterpriseAgreementsRoute, /companyId:\s*z\.string\(\)\.uuid\(\)/);
  assert.match(enterpriseRequestFlowDrawerGuardsMigration, /p_replaces_agreement_id uuid/);
  assert.match(enterpriseRequestFlowDrawerGuardsMigration, /REPLACED_AGREEMENT_NOT_ACTIVE/);
});

test("admin agreement API requires an approved source request for Enterprise activation path", () => {
  assert.match(enterpriseAgreementsRoute, /sourceRequestId:\s*z\.string\(\)\.uuid\(\)/);
  assert.match(enterpriseAgreementsRoute, /sourceRequestUpdatedAt:\s*z\.string\(\)\.datetime\(\{ offset: true \}\)/);
  assert.doesNotMatch(enterpriseAgreementsRoute, /companyId:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.doesNotMatch(enterpriseAgreementsRoute, /else if \(companyId\)/);
});

test("admin agreement API accepts only matching approved Enterprise request kinds", () => {
  assert.match(enterpriseRequestAgreementLifecycleGuardMigration, /v_request\.request_kind <> 'upgrade_to_enterprise'/);
  assert.match(enterpriseRequestAgreementLifecycleGuardMigration, /v_request\.current_plan = 'enterprise'/);
  assert.match(enterpriseAgreementsRoute, /SOURCE_REQUEST_KIND_INVALID/);
  assert.match(enterpriseAgreementsRoute, /SOURCE_REQUEST_CURRENT_PLAN_INVALID/);
  assert.match(enterpriseAgreementsRoute, /SOURCE_REQUEST_HAS_OPEN_AGREEMENT/);
  assert.match(planChangeRequestFlow, /request_kind === "upgrade_to_enterprise"/);
  assert.match(planChangeRequestFlow, /request_kind === "enterprise_terms_change"/);
});

test("admin agreement creation is idempotent per source request", () => {
  assert.match(enterpriseAgreementsRoute, /\.eq\("source_request_id", sourceRequestId\)/);
  assert.match(enterpriseAgreementsRoute, /findExistingSourceAgreement\(admin, parsed\.data\.sourceRequestId\)/);
  assert.match(enterpriseAgreementsRoute, /\.in\("status", \["draft", "pending_payment", "active"\]\)/);
  assert.match(enterpriseAgreementsRoute, /\.limit\(1\)/);
  assert.match(enterpriseAgreementsRoute, /createError\?\.code === "23505"/);
  assert.match(enterpriseAgreementsRoute, /AGREEMENT_ALREADY_EXISTS/);
  assert.match(planChangeRequestsTable, /agreementBySourceRequest\.get\(row\.id\)/);
  assert.match(planChangeRequestsTable, /Условия Enterprise созданы/);
});

test("legacy enterprise lead qualification no longer switches company plan directly", () => {
  assert.doesNotMatch(tariffRequestsActions, /qualify_company_enterprise_plan/);
  assert.doesNotMatch(tariffRequestsActions, /companyPlanUpdated/);
  assert.doesNotMatch(tariffRequestsActions, /\$\{[^}]*Err\.message\}/);
  assert.doesNotMatch(tariffRequestsActions, /message:\s*[^,\n]*\.message/);
  assert.match(tariffRequestsActions, /оформляется в Billing/);
});

test("admin plan-change request status route updates handled and terminal timestamps", () => {
  for (const column of ["handled_by", "handled_at", "updated_at", "approved_at", "applied_at", "rejected_at", "canceled_at"]) {
    assert.match(planChangeStatusRoute, new RegExp(column));
  }

  assert.match(planChangeStatusRoute, /in_review/);
  assert.match(planChangeStatusRoute, /contacted/);
  assert.match(planChangeStatusRoute, /approved/);
  assert.match(planChangeStatusRoute, /applied/);
  assert.match(planChangeStatusRoute, /rejected/);
  assert.match(planChangeStatusRoute, /canceled/);
  assert.doesNotMatch(planChangeStatusRoute, /error\.message/);
});

test("admin plan-change request status route keeps terminal requests closed", () => {
  assert.match(planChangeStatusRoute, /ALLOWED_REGULAR_STATUS_TRANSITIONS/);
  assert.match(planChangeStatusRoute, /existing\.status/);
  assert.match(planChangeStatusRoute, /isTerminalStatus\(existing\.status\)/);
  assert.match(planChangeStatusRoute, /TRANSITION_INVALID/);
  assert.match(planChangeStatusRoute, /REQUEST_STATUS_CHANGED/);
  assert.match(planChangeStatusRoute, /SOURCE_REQUEST_HAS_OPEN_AGREEMENT/);
  assert.match(planChangeStatusRoute, /dbErrorReason\(error, \["SOURCE_REQUEST_HAS_OPEN_AGREEMENT"\]\)/);
  assert.match(planChangeStatusRoute, /\.from\("enterprise_agreements"\)[\s\S]*\.eq\("source_request_id", requestId\)/);
  assert.match(planChangeStatusRoute, /\.in\("status", \["draft", "pending_payment", "active"\]\)/);
  assert.doesNotMatch(planChangeStatusRoute, /\.in\("status", \["draft", "pending_payment", "active", "canceled"\]\)/);
  assert.match(planChangeStatusRoute, /\.eq\("status", existing\.status\)/);
  assert.match(planChangeStatusRoute, /\.eq\("updated_at", parsed\.data\.updatedAt\)/);
  assert.match(planChangeRequestsTable, /SOURCE_REQUEST_HAS_OPEN_AGREEMENT/);
  assert.match(planChangeRequestsTable, /name="adminNote"[\s\S]*maxLength=\{4000\}/);
  assert.match(planChangeRequestsTable, /name="publicResponse"[\s\S]*maxLength=\{4000\}/);
  assert.match(planChangeRequestsTable, /value=\{draft\.termsSummary\}[\s\S]*maxLength=\{5000\}/);
  assert.match(planChangeRequestsTable, /TRANSITION_INVALID/);
  assert.match(planChangeRequestsTable, /REQUEST_STATUS_CHANGED/);
});

test("admin plan-change request status route follows drawer state machine", () => {
  assert.match(planChangeStatusRoute, /submitted: \["in_review", "rejected", "canceled"\]/);
  assert.doesNotMatch(planChangeStatusRoute, /submitted: \["in_review", "contacted", "approved"/);
  assert.match(planChangeStatusRoute, /approved: \["applied", "rejected", "canceled"\]/);
  assert.match(planChangeStatusRoute, /canApplyManually/);
  assert.match(planChangeStatusRoute, /request_kind/);
  assert.match(planChangeStatusRoute, /parsed\.data\.status === "applied"[\s\S]*!canApplyManually/);
});

test("admin agreement terms update is protected against stale status changes", () => {
  assert.match(enterpriseAgreementsRoute, /canSaveEnterpriseAgreementTerms/);
  assert.match(enterpriseAgreementDetailRoute, /canSaveEnterpriseAgreementTerms/);
  assert.doesNotMatch(enterpriseAgreementsRoute, /canActivateEnterpriseAgreement/);
  assert.doesNotMatch(enterpriseAgreementDetailRoute, /canActivateEnterpriseAgreement/);
  assert.match(enterpriseAgreementDetailRoute, /currentAgreement\.status !== "draft"/);
  assert.match(enterpriseAgreementDetailRoute, /AGREEMENT_NOT_EDITABLE/);
  assert.match(enterpriseAgreementDetailRoute, /\.eq\("id", agreementId\)[\s\S]*\.eq\("status", currentAgreement\.status\)/);
  assert.match(enterpriseAgreementsTable, /AGREEMENT_NOT_EDITABLE/);
  assert.match(enterpriseAgreementDetailRoute, /AGREEMENT_STATUS_CHANGED/);
  assert.match(enterpriseAgreementsTable, /AGREEMENT_STATUS_CHANGED/);
});

test("admin can restore stranded pending Enterprise agreements to draft only without payable invoices", () => {
  assert.match(enterpriseAgreementRestoreDraftRoute, /requirePlatformAdmin/);
  assert.match(enterpriseAgreementRestoreDraftRoute, /rpc\("restore_enterprise_agreement_draft"/);
  assert.match(enterpriseAgreementRestoreDraftRoute, /AGREEMENT_NOT_RESTORABLE/);
  assert.match(enterpriseAgreementRestoreDraftRoute, /AGREEMENT_HAS_PAYABLE_INVOICE/);
  assert.doesNotMatch(enterpriseAgreementRestoreDraftRoute, /\.from\("billing_manual_invoices"\)[\s\S]*\.in\("status", \["issued", "paid"\]\)/);
  assert.doesNotMatch(enterpriseAgreementRestoreDraftRoute, /\.update\(\{ status: "draft"/);
  assert.match(enterpriseAgreementRestoreDraftRoute, /AGREEMENT_STATUS_CHANGED/);
});

test("admin plan-change requests table does not offer regular status changes for terminal rows", () => {
  assert.match(planChangeRequestsTable, /isTerminalStatus\(row\.status\)/);
  assert.match(planChangeRequestsTable, /FinishedRequestState/);
  assert.match(planChangeRequestsTable, /Заявка завершена/);
});

test("admin plan-change request drawer keeps terminal actions available before application", () => {
  assert.match(planChangeRequestsTable, /TerminalRequestActionsForm/);
  assert.match(planChangeRequestsTable, /Закрытие заявки/);
  assert.match(planChangeRequestsTable, /!\["work", "decision", "finished"\]\.includes\(selectedStageKey \?\? ""\)/);
  assert.match(planChangeStatusRoute, /approved: \["applied", "rejected", "canceled"\]/);
  assert.match(planChangeStatusRoute, /closesApprovedRequest\(existing\.status, parsed\.data\.status\)/);
});
