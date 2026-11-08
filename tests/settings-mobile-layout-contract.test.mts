import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("app/(dashboard)/dashboard/settings/page.tsx", "utf8");

function sectionBetween(sourceText: string, startNeedle: string, endNeedle: string) {
  const start = sourceText.indexOf(startNeedle);
  const end = sourceText.indexOf(endNeedle, start + startNeedle.length);

  assert.notEqual(start, -1, `Missing section start: ${startNeedle}`);
  assert.notEqual(end, -1, `Missing section end: ${endNeedle}`);

  return sourceText.slice(start, end);
}

test("settings page has a mobile-safe page shell and tab bar", () => {
  const page = source();

  assert.match(page, /<div className="[^"]*\bmin-w-0\b[^"]*\boverflow-hidden\b/);
  assert.match(page, /<h1 className="[^"]*\btext-2xl\b[^"]*\bsm:text-3xl\b/);
  assert.match(page, /<TabsList className="[^"]*\bmax-w-full\b[^"]*\boverflow-x-auto\b/);
  assert.match(page, /<TabsTrigger value="profile" className="[^"]*\bshrink-0\b/);
  assert.match(page, /<TabsTrigger value="plan" className="[^"]*\bshrink-0\b/);
});

test("settings cards keep headers, badges, and action rows contained on mobile", () => {
  const page = source();
  const integrations = sectionBetween(page, "{/* Integrations Tab */}", "{/* Notifications Tab */}");
  const notifications = sectionBetween(page, "{/* Notifications Tab */}", "{/* Plan Tab */}");
  const plan = sectionBetween(page, "{/* Plan Tab */}", "<AlertDialog");

  for (const section of [integrations, notifications, plan]) {
    assert.match(section, /className="[^"]*\bflex-col\b[^"]*\bsm:flex-row\b[^"]*\bsm:items-center\b[^"]*\bsm:justify-between\b/);
  }

  assert.equal(Array.from(page.matchAll(/<Badge[^>]+className="[^"]*\bshrink-0\b/g)).length >= 6, true);
  assert.equal(Array.from(page.matchAll(/<Button[^>]+className="[^"]*\bw-full\b[^"]*\bsm:w-auto\b/g)).length >= 4, true);
  assert.equal(Array.from(page.matchAll(/<Switch[\s\S]*?className="[^"]*\bshrink-0\b/g)).length >= 2, true);
});

test("settings integrations tab has a mobile-safe MCP placeholder", () => {
  const page = source();
  const integrations = sectionBetween(page, "{/* Integrations Tab */}", "{/* Notifications Tab */}");
  const mcp = sectionBetween(integrations, "{/* MCP Integration */}", "{/* Google Calendar Integration */}");

  assert.match(mcp, /<CardTitle>MCP<\/CardTitle>/);
  assert.match(mcp, /Скоро/);
  assert.match(mcp, /Если вы привыкли работать со своим ИИ-агентом, у нас хорошие новости!/);
  assert.match(mcp, /Скоро вы сможете дать вашему ИИ-агенту использовать hiiire через MCP/);
  assert.match(mcp, /Codex, Claude Code, Hermes или OpenClaw/);
  assert.match(mcp, /className="[^"]*\bflex-col\b[^"]*\bsm:flex-row\b[^"]*\bsm:items-center\b[^"]*\bsm:justify-between\b/);
  assert.equal(Array.from(mcp.matchAll(/className="[^"]*\bbreak-words\b/g)).length >= 2, true);
});

test("settings notification preference errors do not show raw API codes", () => {
  const page = source();
  const telegramToggle = sectionBetween(page, "const handleToggleTelegramEnabled", "const handleToggleEmailEnabled");
  const emailToggle = sectionBetween(page, "const handleToggleEmailEnabled", "const loadCompany");
  const telegramRoute = readFileSync("app/api/telegram/preferences/route.ts", "utf8");
  const emailRoute = readFileSync("app/api/email/preferences/route.ts", "utf8");

  for (const sourceText of [telegramToggle, emailToggle]) {
    assert.match(sourceText, /readUserFacingApiErrorMessage\(json,\s*"Проверьте настройку уведомлений и попробуйте ещё раз\."\)/);
    assert.doesNotMatch(sourceText, /String\(json\?\.error/);
  }

  for (const route of [telegramRoute, emailRoute]) {
    assert.match(route, /error:\s*"INVALID_BODY",\s*message:\s*INVALID_BODY_MESSAGE/);
    assert.match(route, /SAVE_FAILED_MESSAGE/);
  }
});

test("settings employee table keeps full identity available through horizontal scroll", () => {
  const page = source();
  const company = sectionBetween(page, "{/* Company Tab */}", "{/* Integrations Tab */}");

  assert.match(company, /<div className="[^"]*\bmax-w-full\b[^"]*\boverflow-x-auto\b[^"]*rounded-md border"/);
  assert.match(company, /<Table className="[^"]*\bmin-w-\[[^\]]+\]/);
  assert.doesNotMatch(company, /<TableCell className="[^"]*\btruncate\b/);
  assert.match(company, /<TableCell className="[^"]*\bwhitespace-nowrap\b[^"]*">\{employee\.email/);
});

test("settings plan cards use mobile-first columns and protected card titles", () => {
  const page = source();
  const plan = sectionBetween(page, "{/* Plan Tab */}", "<AlertDialog");

  assert.match(plan, /<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">/);
  assert.equal(Array.from(plan.matchAll(/<CardTitle className="[^"]*\bmin-w-0\b[^"]*\bgap-2\b/g)).length, 3);
});
