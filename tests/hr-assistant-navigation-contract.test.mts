import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("components/dashboard/sidebar.tsx", "utf8");
const mobileNav = readFileSync("components/dashboard/mobile-nav.tsx", "utf8");
const navItems = readFileSync("components/dashboard/nav-items.ts", "utf8");

test("dashboard navigation exposes HR assistant on desktop and mobile", () => {
  for (const source of [sidebar, mobileNav]) {
    assert.match(source, /dashboardNavItems/);
    assert.match(source, /item\.title/);
    assert.match(source, /item\.href/);
    assert.match(source, /item\.icon/);
  }

  assert.match(navItems, /HR-ассистент/);
  assert.match(navItems, /\/dashboard\/hr-assistant/);
  assert.match(navItems, /icon:\s*Bot/);
});

test("HR assistant page exists under dashboard route", () => {
  const page = readFileSync("app/(dashboard)/dashboard/hr-assistant/page.tsx", "utf8");
  assert.match(page, /HR-ассистент/);
  assert.match(page, /HrAssistantClient/);
});
