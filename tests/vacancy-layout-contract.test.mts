import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(dashboard)/dashboard/vacancies/page.tsx", "utf8");

const bilingualExperienceLevelLabels = [
  "Стажер (Trainee)",
  "Начальный (Junior)",
  "Средний (Middle)",
  "Высокий (Senior)",
  "Ведущий (Lead)",
] as const;

function getBlock(startNeedle: string, endNeedle: string): string {
  return getBlockAfter("", startNeedle, endNeedle);
}

function getBlockAfter(afterNeedle: string, startNeedle: string, endNeedle: string): string {
  const after = afterNeedle ? source.indexOf(afterNeedle) : 0;
  assert.notEqual(after, -1, `Could not find block anchor: ${afterNeedle}`);

  const start = source.indexOf(startNeedle, after);
  assert.notEqual(start, -1, `Could not find block start: ${startNeedle}`);

  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `Could not find block end: ${endNeedle}`);

  return source.slice(start, end);
}

function assertHasClass(block: string, className: string, message?: string) {
  assert.match(block, new RegExp(`\\b${className}\\b`), message ?? `Expected class "${className}"`);
}

function assertHasOneClass(block: string, classNames: readonly string[], message: string) {
  assert.ok(classNames.some((className) => new RegExp(`\\b${className}\\b`).test(block)), message);
}

test("vacancy table reserves fixed space for created date and actions", () => {
  assert.match(source, /<Table className="[^"]*min-w-\[1180px\][^"]*\btable-fixed\b/);
  assert.match(source, /<CardContent className="[^"]*\bmax-w-full\b[^"]*\boverflow-x-auto\b/);

  const header = getBlock("<TableHeader>", "</TableHeader>");
  assert.match(header, /<TableHead scope="col" className="[^"]*w-\[11rem\][^"]*">Создана<\/TableHead>/);
  assert.match(header, /<TableHead scope="col" className="[^"]*w-\[7\.5rem\][^"]*">Действия<\/TableHead>/);
  assert.doesNotMatch(header, /Создана<\/TableHead>\s*<TableHead scope="col" className="[^"]*\bw-\[7%\]/);
});

test("vacancy table title and location cells guard long text without deforming controls", () => {
  const vacancyRows = ": filteredVacancies.map((vacancy) => {";
  const titleCell = getBlockAfter(vacancyRows, '<TableCell className="w-[29%] align-top font-medium">', "</TableCell>");
  assertHasClass(titleCell, "min-w-0");
  assertHasOneClass(titleCell, ["break-words", "truncate"], "Vacancy table title must wrap or truncate long text");
  assertHasClass(titleCell, "shrink-0", "Vacancy source badge must not shrink under long titles");

  const locationCell = getBlockAfter(vacancyRows, '<TableCell className="w-[13%] align-top">', "</TableCell>");
  assertHasClass(locationCell, "min-w-0");
  assertHasOneClass(locationCell, ["break-words", "truncate"], "Vacancy table location must wrap or truncate long text");
  assert.match(locationCell, /<MapPin[^>]+className="[^"]*\bh-3\b[^"]*\bw-3\b[^"]*\bshrink-0\b/);
});

test("vacancy grid cards guard long titles and locations while keeping actions stable", () => {
  const gridCard = getBlockAfter("/* Grid View */", "key={vacancy.id}", "</CardContent>");

  assertHasClass(gridCard, "min-w-0", "Vacancy grid card must allow nested flex content to shrink");
  assert.match(gridCard, /<CardTitle[^>]+className="[^"]*(?:\bbreak-words\b|\btruncate\b)/);
  assert.match(gridCard, /<CardDescription[^>]+className="[^"]*\bmin-w-0\b[^"]*(?:\bbreak-words\b|\btruncate\b)/);
  assert.match(gridCard, /<MapPin[^>]+className="[^"]*\bh-3\b[^"]*\bw-3\b[^"]*\bshrink-0\b/);
  assert.match(gridCard, /<Clock[^>]+className="[^"]*\bh-3\b[^"]*\bw-3\b[^"]*\bshrink-0\b/);
  assert.match(gridCard, /<Button[^>]+className="[^"]*\bshrink-0\b/);
});

test("vacancy list cards show bilingual candidate level labels", () => {
  for (const label of bilingualExperienceLevelLabels) {
    assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /junior: "Начальный",/);
  assert.doesNotMatch(source, /middle: "Средний",/);
  assert.doesNotMatch(source, /senior: "Высокий",/);
  assert.doesNotMatch(source, /lead: "Ведущий",/);
  assert.doesNotMatch(source, /trainee: "Trainee",/);
});
