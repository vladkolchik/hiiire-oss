import assert from "node:assert/strict";
import test from "node:test";

import { loadAllSupabaseRows, loadAllSupabaseRowsForValues, loadPagedSupabaseRows } from "../lib/supabase/pagination.ts";

test("loadPagedSupabaseRows returns rows and total from a successful page query", async () => {
  let fallbackCountCalls = 0;

  const result = await loadPagedSupabaseRows({
    runPageQuery: async () => ({
      data: [{ id: "row-1" }, { id: "row-2" }],
      error: null,
      count: 7,
    }),
    runCountQuery: async () => {
      fallbackCountCalls += 1;
      return { count: 0, error: null };
    },
  });

  assert.deepEqual(result.rows, [{ id: "row-1" }, { id: "row-2" }]);
  assert.equal(result.total, 7);
  assert.equal(result.recoveredFromOutOfRange, false);
  assert.equal(fallbackCountCalls, 0);
});

test("loadPagedSupabaseRows recovers the real total after a PGRST103 out-of-range page request", async () => {
  let fallbackCountCalls = 0;

  const result = await loadPagedSupabaseRows({
    runPageQuery: async () => ({
      data: null,
      error: {
        code: "PGRST103",
        message: "Requested range not satisfiable",
      },
      count: null,
    }),
    runCountQuery: async () => {
      fallbackCountCalls += 1;
      return { count: 32, error: null };
    },
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.total, 32);
  assert.equal(result.recoveredFromOutOfRange, true);
  assert.equal(fallbackCountCalls, 1);
});

test("loadPagedSupabaseRows rethrows non-range errors", async () => {
  await assert.rejects(
    () =>
      loadPagedSupabaseRows({
        runPageQuery: async () => ({
          data: null,
          error: {
            code: "42501",
            message: "permission denied",
          },
          count: null,
        }),
        runCountQuery: async () => ({ count: 0, error: null }),
      }),
    (error) => {
      assert.deepEqual(error, {
        code: "42501",
        message: "permission denied",
      });
      return true;
    }
  );
});

test("loadAllSupabaseRows reads every page until the final short page", async () => {
  const calls: Array<[number, number]> = [];
  const rowsByPage = new Map([
    [0, [{ id: "row-1" }, { id: "row-2" }]],
    [2, [{ id: "row-3" }, { id: "row-4" }]],
    [4, [{ id: "row-5" }]],
  ]);

  const rows = await loadAllSupabaseRows({
    pageSize: 2,
    runPageQuery: async (from, to) => {
      calls.push([from, to]);
      return { data: rowsByPage.get(from) ?? [], error: null };
    },
  });

  assert.deepEqual(calls, [
    [0, 1],
    [2, 3],
    [4, 5],
  ]);
  assert.deepEqual(rows, [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }, { id: "row-4" }, { id: "row-5" }]);
});

test("loadAllSupabaseRows allows exactly maxRows but rejects rows beyond the cap", async () => {
  const exactRows = await loadAllSupabaseRows({
    maxRows: 4,
    pageSize: 2,
    runPageQuery: async (from, to) => ({
      data: [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }, { id: "row-4" }].slice(from, to + 1),
      error: null,
    }),
  });

  assert.deepEqual(exactRows, [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }, { id: "row-4" }]);

  await assert.rejects(
    () =>
      loadAllSupabaseRows({
        maxRows: 4,
        pageSize: 2,
        runPageQuery: async (from, to) => ({
          data: [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }, { id: "row-4" }, { id: "row-5" }].slice(from, to + 1),
          error: null,
        }),
      }),
    /exceeded 4 rows/,
  );
});

test("loadAllSupabaseRows enforces maxRows even when it is smaller than pageSize", async () => {
  const calls: Array<[number, number]> = [];
  const exactRows = await loadAllSupabaseRows({
    maxRows: 2,
    pageSize: 1000,
    runPageQuery: async (from, to) => {
      calls.push([from, to]);
      return {
        data: [{ id: "row-1" }, { id: "row-2" }].slice(from, to + 1),
        error: null,
      };
    },
  });

  assert.deepEqual(calls, [[0, 2]]);
  assert.deepEqual(exactRows, [{ id: "row-1" }, { id: "row-2" }]);

  await assert.rejects(
    () =>
      loadAllSupabaseRows({
        maxRows: 2,
        pageSize: 1000,
        runPageQuery: async (from, to) => ({
          data: [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }].slice(from, to + 1),
          error: null,
        }),
      }),
    /exceeded 2 rows/,
  );
});

test("loadAllSupabaseRowsForValues chunks large filter values and paginates each chunk", async () => {
  const calls: Array<{ values: readonly string[]; from: number; to: number }> = [];
  const rows = await loadAllSupabaseRowsForValues({
    chunkSize: 2,
    pageSize: 2,
    values: ["a", "b", "c"],
    runChunkPageQuery: async (values, from, to) => {
      calls.push({ values, from, to });
      if (values.join(",") === "a,b" && from === 0) return { data: [{ id: "ab-1" }, { id: "ab-2" }], error: null };
      if (values.join(",") === "a,b" && from === 2) return { data: [{ id: "ab-3" }], error: null };
      if (values.join(",") === "c" && from === 0) return { data: [{ id: "c-1" }], error: null };
      return { data: [], error: null };
    },
  });

  assert.deepEqual(
    calls.map((call) => ({ values: [...call.values], from: call.from, to: call.to })),
    [
      { values: ["a", "b"], from: 0, to: 1 },
      { values: ["a", "b"], from: 2, to: 3 },
      { values: ["c"], from: 0, to: 1 },
    ],
  );
  assert.deepEqual(rows, [{ id: "ab-1" }, { id: "ab-2" }, { id: "ab-3" }, { id: "c-1" }]);
});

test("loadAllSupabaseRowsForValues enforces maxRows across chunks", async () => {
  await assert.rejects(
    () =>
      loadAllSupabaseRowsForValues({
        chunkSize: 1,
        maxRows: 2,
        pageSize: 1000,
        values: ["a", "b"],
        runChunkPageQuery: async (values, from, to) => ({
          data: values.map((value) => [{ id: `${value}-1` }, { id: `${value}-2` }]).flat().slice(from, to + 1),
          error: null,
        }),
      }),
    /exceeded 2 rows/,
  );
});
