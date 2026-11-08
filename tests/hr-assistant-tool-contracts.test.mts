import assert from "node:assert/strict";
import test from "node:test";

import type { CompanyContext } from "../lib/access/company-guards.ts";
import {
  clampToolLimit,
  createCursor,
  decodeCursor,
  toHrAssistantScope,
  toolFailure,
  toolListSuccess,
} from "../lib/hr-assistant/tool-contracts.ts";

const ctx: CompanyContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "recruiter@example.com",
  companyId: "22222222-2222-4222-8222-222222222222",
  role: "recruiter",
};

test("tool list success exposes page info, filters, scope, and aggregations", () => {
  const result = toolListSuccess({
    toolRunId: "run-1",
    items: [{ id: "candidate-1" }],
    pageInfo: { limit: 20, nextCursor: "cursor-2", hasMore: true, total: 573, totalExact: true },
    appliedFilters: { status: "reviewing" },
    appliedFilterLabels: { status: "На рассмотрении" },
    availableFilters: { status: ["new", "reviewing"] },
    availableFilterLabels: { status: { new: "Новый", reviewing: "На рассмотрении" } },
    sort: { key: "applied_at", direction: "desc" },
    sortLabel: "Сначала новые",
    scope: toHrAssistantScope(ctx, { scopeType: "workspace", scopeId: null }),
    scopeLabel: "Все доступные данные",
    aggregations: { statusCounts: { reviewing: 17 } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.pageInfo.hasMore, true);
  assert.equal(result.pageInfo.nextCursor, "cursor-2");
  assert.equal(result.scope.ownerRestricted, true);
  assert.deepEqual(result.appliedFilterLabels, { status: "На рассмотрении" });
  assert.deepEqual(result.availableFilterLabels, { status: { new: "Новый", reviewing: "На рассмотрении" } });
  assert.equal(result.sortLabel, "Сначала новые");
  assert.equal(result.scopeLabel, "Все доступные данные");
  assert.deepEqual(result.aggregations, { statusCounts: { reviewing: 17 } });
});

test("tool failure returns a user-safe structured error", () => {
  const result = toolFailure("temporary_failure", "Не удалось загрузить данные. Попробуйте еще раз.", true, "run-1");

  assert.deepEqual(result, {
    ok: false,
    toolRunId: "run-1",
    error: {
      code: "temporary_failure",
      message: "Не удалось загрузить данные. Попробуйте еще раз.",
      retryable: true,
    },
  });
});

test("cursor roundtrip binds pagination to filters and sort", () => {
  const cursor = createCursor({
    entity: "candidates",
    filtersHash: "status=reviewing",
    sort: { key: "applied_at", direction: "desc" },
    last: { appliedAt: "2026-05-17T10:00:00.000Z", id: "candidate-1" },
  });

  const decoded = decodeCursor(cursor);

  assert.equal(decoded.entity, "candidates");
  assert.equal(decoded.filtersHash, "status=reviewing");
  assert.equal(decoded.last.id, "candidate-1");
});

test("limit clamp keeps model input inside service bounds", () => {
  assert.equal(clampToolLimit(undefined, { defaultLimit: 20, maxLimit: 100 }), 20);
  assert.equal(clampToolLimit(0, { defaultLimit: 20, maxLimit: 100 }), 1);
  assert.equal(clampToolLimit(250, { defaultLimit: 20, maxLimit: 100 }), 100);
});
