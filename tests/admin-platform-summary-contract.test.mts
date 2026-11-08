import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
    }
    if (specifier === "next/server") {
      return {
        url: "data:text/javascript,export%20function%20after(callback)%20%7B%20return%20callback()%3B%20%7D",
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      const withoutAlias = specifier.slice(2);
      const resolvedPath = path.resolve(withoutAlias);
      const filePath = existsSync(resolvedPath) ? resolvedPath : `${resolvedPath}.ts`;
      return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

function read(path: string) {
  assert.ok(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

test("platform summary helper owns the /admin count table contract", () => {
  const source = read("lib/admin/platform-summary.ts");

  for (const table of ["companies", "profiles", "vacancies", "candidates", "ai_analyses"]) {
    assert.match(source, new RegExp(`table:\\s*"${table}"`));
  }

  assert.match(source, /export type PlatformSummary/);
  assert.match(source, /export async function loadPlatformSummary/);
  assert.match(source, /select\("\*", \{ count: "exact", head: true \}\)/);
  assert.match(source, /if \(error\) throw error/);
  assert.match(source, /aiRequests/);
});

test("platform summary helper maps Supabase counts to summary keys", async () => {
  const { loadPlatformSummaryFromClient } = await import("../lib/admin/platform-summary.ts");
  const seenTables: string[] = [];
  const countsByTable = new Map([
    ["companies", 10],
    ["profiles", 20],
    ["vacancies", 30],
    ["candidates", 40],
    ["ai_analyses", 50],
  ]);
  const fakeClient = {
    from(table: string) {
      seenTables.push(table);
      return {
        async select(columns: string, options: { count: "exact"; head: true }) {
          assert.equal(columns, "*");
          assert.deepEqual(options, { count: "exact", head: true });
          return { count: countsByTable.get(table) ?? 0, error: null };
        },
      };
    },
  };

  const summary = await loadPlatformSummaryFromClient(fakeClient);

  assert.deepEqual(seenTables, ["companies", "profiles", "vacancies", "candidates", "ai_analyses"]);
  assert.deepEqual(summary, {
    companies: 10,
    users: 20,
    vacancies: 30,
    candidates: 40,
    aiRequests: 50,
  });
});

test("platform summary helper throws on count errors for strict admin page behavior", async () => {
  const { loadPlatformSummaryFromClient } = await import("../lib/admin/platform-summary.ts");
  const fakeClient = {
    from() {
      return {
        async select() {
          return { count: null, error: new Error("count failed") };
        },
      };
    },
  };

  await assert.rejects(() => loadPlatformSummaryFromClient(fakeClient), /count failed/);
});

test("admin home page uses shared platform summary helper instead of local count logic", () => {
  const page = read("app/(admin)/admin/(protected)/page.tsx");

  assert.match(page, /loadPlatformSummary/);
  assert.doesNotMatch(page, /function countTable/);
  assert.doesNotMatch(page, /from\(table\)/);
  assert.match(page, /summary\.companies/);
  assert.match(page, /summary\.users/);
  assert.match(page, /summary\.vacancies/);
  assert.match(page, /summary\.candidates/);
  assert.match(page, /summary\.aiRequests/);
});
