import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const scannedRoots = ["app", "components", "hooks", "services"];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"]);

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

test("browser-facing code does not import the Supabase browser client", () => {
  const offenders: string[] = [];

  for (const root of scannedRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    for (const file of listSourceFiles(absoluteRoot)) {
      const source = readFileSync(file, "utf8");
      if (source.includes("@/lib/supabase/browser") || source.includes("createSupabaseBrowserClient")) {
        offenders.push(path.relative(repoRoot, file).replaceAll("\\", "/"));
      }
    }
  }

  assert.deepEqual(offenders.sort(), []);
});
