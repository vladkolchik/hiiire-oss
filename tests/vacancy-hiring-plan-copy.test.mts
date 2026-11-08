import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createDialogSource = readFileSync("components/dashboard/create-vacancy-dialog.tsx", "utf8");
const editDialogSource = readFileSync("components/dashboard/edit-vacancy-dialog.tsx", "utf8");
const detailsSource = readFileSync("components/dashboard/vacancy-details.tsx", "utf8");

test("vacancy form names headcount as hiring plan", () => {
  assert.match(createDialogSource, /<FormLabel>План найма<\/FormLabel>/);
  assert.match(editDialogSource, /<FormLabel>План найма<\/FormLabel>/);
  assert.doesNotMatch(createDialogSource, /<FormLabel>Кол-во ставок<\/FormLabel>/);
  assert.doesNotMatch(editDialogSource, /<FormLabel>Кол-во ставок<\/FormLabel>/);
});

test("vacancy details display hiring plan as abbreviated people count", () => {
  assert.match(detailsSource, /title="План найма"/);
  assert.match(detailsSource, /value=\{`\$\{vacancy\.headcount\} чел\.`\}/);
  assert.doesNotMatch(detailsSource, /title="Ставок"/);
});
