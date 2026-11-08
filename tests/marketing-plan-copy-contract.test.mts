import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pricingSource = readFileSync("components/landing/pricing.tsx", "utf8");
const hrAssistantPromoSource = readFileSync("components/landing/hr-assistant-promo.tsx", "utf8");
const settingsSource = readFileSync("app/(dashboard)/dashboard/settings/page.tsx", "utf8");
const landingPageSource = readFileSync("app/(marketing)/page.tsx", "utf8");
const readmeSource = readFileSync("README.md", "utf8");
// Internal docs helper; it is not shipped in the public open-source export.
const updateDocsSource = existsSync("_update_docs.ps1") ? readFileSync("_update_docs.ps1", "utf8") : null;

const expectedPlanBenefits = [
  "Безлимит рекрутеров, вакансий и кандидатов",
  "Интеграция с HH.ru",
  "Telegram и Email уведомления",
  "Календарь собеседований",
  "AI советы по вакансиям",
  "Аналитика и отчёты",
  "HR-ассистент",
];

test("marketing plan cards include HR assistant and exclude custom Enterprise integration", () => {
  for (const planName of ["Starter", "Professional"]) {
    const planBlock = extractObjectBlock(pricingSource, `name: "${planName}"`);
    for (const benefit of expectedPlanBenefits) {
      assert.match(planBlock, new RegExp(benefit));
    }
  }

  const starterBlock = extractObjectBlock(pricingSource, 'name: "Starter"');
  const professionalBlock = extractObjectBlock(pricingSource, 'name: "Professional"');
  const enterpriseBlock = extractObjectBlock(pricingSource, 'name: "Enterprise"');

  assert.match(starterBlock, /500 AI-запросов в месяц/);
  assert.match(professionalBlock, /2 000 AI-запросов в месяц/);
  assert.match(enterpriseBlock, /Индивидуальные лимиты AI-запросов со скидкой/);
  assert.doesNotMatch(enterpriseBlock, /HR-ассистент/);
  assert.doesNotMatch(enterpriseBlock, /Кастомная интеграция/);
});

test("dashboard plan cards mirror marketing page benefits", () => {
  for (const planName of ["Starter", "Professional"]) {
    const cardBlock = extractDashboardCardBlock(settingsSource, planName);
    for (const benefit of expectedPlanBenefits) {
      assert.match(cardBlock, new RegExp(benefit));
    }
  }

  const starterCard = extractDashboardCardBlock(settingsSource, "Starter");
  const professionalCard = extractDashboardCardBlock(settingsSource, "Professional");
  const enterpriseCard = extractDashboardCardBlock(settingsSource, "Enterprise");

  assert.match(starterCard, /500 AI-запросов в месяц/);
  assert.match(professionalCard, /2 000 AI-запросов в месяц/);
  assert.match(enterpriseCard, /Индивидуальные лимиты AI-запросов со скидкой/);
  assert.doesNotMatch(enterpriseCard, /HR-ассистент/);
  assert.doesNotMatch(enterpriseCard, /Кастомная интеграция/);
  assert.doesNotMatch(enterpriseCard, /Индивидуальный лимит кредитов/);
});

test("public Starter price copy matches the billing amount", () => {
  const starterBlock = extractObjectBlock(pricingSource, 'name: "Starter"');
  const starterCard = extractDashboardCardBlock(settingsSource, "Starter");

  assert.match(starterBlock, /price:\s*"4 990₽"/);
  assert.match(starterCard, /4[\u202F ]990[\u202F ]?₽\/мес/);
  assert.match(readmeSource, /Starter[\s\S]*4[\u202F ]990[\u202F ]?₽\/мес/);
});

test("landing page promotes HR assistant before internal responses", () => {
  assert.match(landingPageSource, /HrAssistantPromo/);
  assert.match(landingPageSource, /<HrAssistantPromo \/>[\s\S]*<InternalPortals \/>/);
});

test("README and docs updater preserve the current public pricing contract", () => {
  const sources = updateDocsSource ? [readmeSource, normalizePowerShellGeneratedText(updateDocsSource)] : [readmeSource];
  for (const source of sources) {
    assert.match(source, /Starter[\s\S]*500 AI-запросов[\s\S]*HR-ассистент/);
    assert.match(source, /Professional[\s\S]*2[\u202F ]000 AI-запросов[\s\S]*HR-ассистент[\s\S]*приоритетная поддержка/);
    assert.match(source, /Enterprise[\s\S]*Индивидуально[\s\S]*индивидуальные лимиты AI-запросов со скидкой[\s\S]*выделенный менеджер[\s\S]*обучение команды/);
    assert.match(source, /CTA на Starter\/Professional[\s\S]*\/signup\?plan=\.\.\./);
    assert.match(source, /CTA на Enterprise[\s\S]*\/request-access\?plan=enterprise/);
  }

  if (!updateDocsSource) return;

  assert.match(updateDocsSource, /\$repoRoot\s*=\s*\$PSScriptRoot/);
  assert.match(updateDocsSource, /Join-Path \$repoRoot "README\.md"/);
  assert.match(updateDocsSource, /Join-Path \$repoRoot "docs\\DATABASE_SCHEMA\.md"/);
  assert.doesNotMatch(updateDocsSource, /\b[A-Za-z]:\\/, "docs updater must not hardcode absolute Windows paths");
  assert.doesNotMatch(updateDocsSource, /тарифные планы с 7-дневным пробным периодом/);
});

function normalizePowerShellGeneratedText(source: string): string {
  return source
    .replace(/"\s*\+\s*\[char\]0x202F\s*\+\s*"/g, "\u202F")
    .replace(/"\s*\+\s*\[char\]0x20BD\s*\+\s*"/g, "₽");
}

test("HR assistant promo CTA and mockup are guarded against narrow mobile overflow", () => {
  assert.match(hrAssistantPromoSource, /className="[^"]*min-w-0[^"]*"/);
  assert.match(hrAssistantPromoSource, /className="[^"]*max-w-full[^"]*"/);
  assert.match(hrAssistantPromoSource, /Попробовать HR-ассистента/);
  assert.match(hrAssistantPromoSource, /whitespace-normal/);
});

function extractObjectBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing marker: ${marker}`);
  const end = source.indexOf("\n  },", start);
  assert.notEqual(end, -1, `Missing object end after marker: ${marker}`);
  return source.slice(start, end);
}

function extractDashboardCardBlock(source: string, planName: string): string {
  const start = source.indexOf(`{/* ${planName} */}`);
  assert.notEqual(start, -1, `Missing dashboard card marker: ${planName}`);

  const nextMarker = source.indexOf("{/*", start + 1);
  assert.notEqual(nextMarker, -1, `Missing dashboard card end marker after: ${planName}`);

  return source.slice(start, nextMarker);
}
