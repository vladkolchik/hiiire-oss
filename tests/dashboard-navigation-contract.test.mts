import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const expectedDashboardNavOrder = [
  "Главная",
  "Вакансии",
  "Кандидаты",
  "Календарь",
  "HR-ассистент",
  "Статистика",
  "Активность",
  "PDF-инструменты",
  "Обратная связь",
  "Настройки",
];

function extractNavTitles(source: string) {
  return Array.from(source.matchAll(/title:\s*"([^"]+)"/g), (match) => match[1]);
}

test("dashboard navigation follows the product order", () => {
  const source = readFileSync("components/dashboard/nav-items.ts", "utf8");

  assert.deepEqual(extractNavTitles(source), expectedDashboardNavOrder);
});

test("desktop and mobile navigation use the shared dashboard list", () => {
  const sidebarSource = readFileSync("components/dashboard/sidebar.tsx", "utf8");
  const mobileSource = readFileSync("components/dashboard/mobile-nav.tsx", "utf8");

  assert.match(sidebarSource, /dashboardNavItems\.map/);
  assert.match(mobileSource, /dashboardNavItems\.map/);
});
