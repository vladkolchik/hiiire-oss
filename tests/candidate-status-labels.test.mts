import assert from "node:assert/strict";
import test from "node:test";

test("candidate status labels are user-facing Russian copy", async () => {
  const mod = await import("../lib/candidates/status-labels.ts");

  assert.equal(mod.formatCandidateStatusLabel("new"), "Новый");
  assert.equal(mod.formatCandidateStatusLabel("reviewing"), "Рассмотрение");
  assert.equal(mod.formatCandidateStatusLabel("security-check"), "Проверка СБ");
  assert.equal(mod.formatCandidateStatusLabel("interview-scheduled"), "Собеседование");
  assert.equal(mod.formatCandidateStatusLabel("interviewed"), "Опрошен");
  assert.equal(mod.formatCandidateStatusLabel("offer"), "Оффер");
  assert.equal(mod.formatCandidateStatusLabel("hired"), "Принят");
  assert.equal(mod.formatCandidateStatusLabel("rejected"), "Отклонён");
  assert.equal(mod.formatCandidateStatusLabel("unknown-status"), "Неизвестный статус");
});
