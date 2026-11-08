import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("select content exposes scrollable viewport and stable text truncation", () => {
  const source = readFileSync("components/ui/select.tsx", "utf8");

  assert.match(source, /max-h-\[min\(var\(--radix-select-content-available-height\),20rem\)\]/);
  assert.match(source, /overflow-y-auto/);
  assert.match(source, /scrollbar-thin/);
  assert.match(source, /data-\[slot=select-item-text\]:truncate/);
});

test("popover content uses theme tokens and bounded overflow", () => {
  const source = readFileSync("components/ui/popover.tsx", "utf8");

  assert.match(source, /bg-popover/);
  assert.match(source, /text-popover-foreground/);
  assert.match(source, /max-h-\[min\(var\(--radix-popover-content-available-height\),24rem\)\]/);
  assert.match(source, /overflow-y-auto/);
});

test("scroll area viewport keeps Radix content wrapper constrained", () => {
  const source = readFileSync("components/ui/scroll-area.tsx", "utf8");

  assert.match(source, /\[\&>div\]:!block/);
  assert.match(source, /\[\&>div\]:!min-w-0/);
  assert.match(source, /\[\&>div\]:!w-full/);
});
