import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const filtersBarSource = readFileSync("components/dashboard/candidates-filters-bar.tsx", "utf8");

test("candidates vacancy filter is searchable", () => {
  assert.match(filtersBarSource, /CommandInput/, "vacancy filter must expose a search input");
  assert.match(filtersBarSource, /CommandEmpty>\s*Вакансии не найдены\.\s*<\/CommandEmpty>/, "empty search must be user-facing");
  assert.match(filtersBarSource, /placeholder="Поиск по вакансии"/, "search input must describe vacancy search");
  assert.match(filtersBarSource, /role="combobox"/, "vacancy filter trigger must be announced as a combobox");
  assert.match(filtersBarSource, /aria-label="Фильтр по вакансии"/, "vacancy filter must keep its accessible label");
  assert.match(filtersBarSource, /value=\{\[vacancy\.title,\s*vacancy\.id\]\.join\(" "\)\}/, "search must match vacancy titles and ids");
});

