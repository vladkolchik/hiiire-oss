import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("worker concurrency is capped at 32 jobs per instance", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");
  const dist = readFileSync("worker/dist/index.js", "utf8");
  const readme = readFileSync("README.md", "utf8");

  assert.match(source, /WORKER_CONCURRENCY\s*=\s*Math\.max\(1,\s*Math\.min\(32,\s*Number\(process\.env\.WORKER_CONCURRENCY \|\| 3\)\)\)/);
  assert.match(dist, /WORKER_CONCURRENCY\s*=\s*Math\.max\(1,\s*Math\.min\(32,\s*Number\([^)]*WORKER_CONCURRENCY \|\| 3\)\)\)/);
  assert.match(readme, /диапазон `1\.\.32` на инстанс/);
});
