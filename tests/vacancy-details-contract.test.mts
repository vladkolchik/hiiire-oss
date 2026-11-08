import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/dashboard/vacancy-details.tsx", "utf8");

const bilingualExperienceLevelLabels = [
  "Стажер (Trainee)",
  "Начальный (Junior)",
  "Средний (Middle)",
  "Высокий (Senior)",
  "Ведущий (Lead)",
] as const;

test("vacancy detail meta cards show full values instead of truncating them", () => {
  const start = source.indexOf("function VacancyMetaCard");
  assert.notEqual(start, -1);
  const block = source.slice(start, source.indexOf("export function VacancyDetails", start));

  assert.match(block, /valueClassName \?\? "[^"]*\bbreak-words\b[^"]*\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(block, /valueClassName \?\? "[^"]*\btruncate\b/);
  assert.match(block, /className="[^"]*\bflex-1\b[^"]*\bmin-w-0\b/);
  assert.match(block, /className="[^"]*\bshrink-0\b/);
});

test("vacancy detail long text blocks can wrap unbroken content", () => {
  for (const label of ["vacancy.description", "vacancy.benefits", "vacancy.bonus", "vacancy.mandatoryRequirements", "vacancy.hiringProcess"]) {
    const paragraphPattern = new RegExp(`<p className="([^"]+)">\\{${label.replace(".", "\\.")}\\}</p>`);
    const match = source.match(paragraphPattern);
    assert.ok(match, `Could not find paragraph for ${label}`);
    const paragraphClassName = match[1];

    assert.match(paragraphClassName, /\bbreak-words\b/, `${label} should wrap long text`);
    assert.match(paragraphClassName, /\[overflow-wrap:anywhere\]/, `${label} should wrap unbroken text`);
  }
});

test("vacancy about lists can wrap unbroken content", () => {
  for (const list of ["vacancy.requirements", "vacancy.responsibilities"]) {
    const prePattern = new RegExp(`<pre className="([^"]+)">\\s*\\{nlJoin\\(${list.replace(".", "\\.")}\\)\\}\\s*</pre>`);
    const match = source.match(prePattern);
    assert.ok(match, `Could not find about-list block for ${list}`);
    const preClassName = match[1];

    assert.match(preClassName, /\bbreak-words\b/, `${list} should wrap long text`);
    assert.match(preClassName, /\[overflow-wrap:anywhere\]/, `${list} should wrap unbroken text`);
  }
});

test("vacancy details constrain about tab containers before wrapping text", () => {
  assert.match(source, /<Tabs defaultValue="about" className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*\boverflow-hidden\b/);
  assert.match(source, /<ScrollArea className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b/);
  assert.match(source, /<div className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*px-5 py-5 space-y-5/);
  assert.match(source, /<TabsContent value="about" className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b/);
  assert.match(source, /<Card className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*\boverflow-hidden\b[^"]*bg-muted\/30/);
});

test("vacancy details show bilingual candidate level labels", () => {
  for (const label of bilingualExperienceLevelLabels) {
    assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /junior: "Начальный",/);
  assert.doesNotMatch(source, /middle: "Средний",/);
  assert.doesNotMatch(source, /senior: "Высокий",/);
  assert.doesNotMatch(source, /lead: "Ведущий",/);
  assert.doesNotMatch(source, /trainee: "Trainee",/);
});
