import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/dashboard/candidate-details.tsx", "utf8");

test("candidate details shell is constrained for narrow mobile drawers", () => {
  assert.match(source, /<div className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*\boverflow-y-auto\b[^"]*\bsm:overflow-hidden\b[^"]*bg-background/);
  assert.match(source, /<Tabs defaultValue="ai" className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*\boverflow-visible\b[^"]*\bsm:flex-1\b[^"]*\bsm:overflow-hidden\b/);
  assert.match(source, /<ScrollArea className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*\boverflow-visible\b[^"]*\[&>\[data-radix-scroll-area-viewport\]\]:h-auto[^"]*\bsm:flex-1\b[^"]*\bsm:overflow-hidden\b[^"]*sm:\[&>\[data-radix-scroll-area-viewport\]\]:h-full/);
  assert.match(source, /<div className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*px-4 py-5[^"]*\bsm:px-5\b/);
});

test("candidate details header keeps close button outside the mobile action row", () => {
  assert.match(source, /className="absolute top-4 right-4[^"]*"/);
  assert.match(source, /<div className="[^"]*\bflex\b[^"]*\bmin-w-0\b[^"]*\bflex-col\b[^"]*\bsm:flex-row\b/);
  assert.match(source, /className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"/);
  assert.match(source, /className="flex shrink-0 flex-col items-start gap-2 sm:items-end"/);
  assert.match(source, /className="flex min-w-0 flex-wrap items-center gap-2"/);
  assert.match(source, /<div className="px-4 py-4 sm:px-5 sm:py-5">/);
  assert.match(source, /<div className="flex items-start gap-3 pr-8 sm:gap-4 sm:pr-9">/);
  assert.doesNotMatch(source, /px-4 py-4 pr-12 sm:px-5 sm:py-5 sm:pr-14/);
  assert.doesNotMatch(source, /pl-\[3\.75rem\]/);
  assert.doesNotMatch(source, /sm:pl-\[4\.5rem\]/);

  const actionsStart = source.indexOf("{onScheduleInterview ? (");
  const actionsEnd = source.indexOf("</TooltipProvider>", actionsStart);
  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart, "Could not find candidate header action row");

  const actionsBlock = source.slice(actionsStart, actionsEnd);
  assert.doesNotMatch(actionsBlock, /aria-label="Закрыть"/);
});

test("candidate details tabs and content cards stay within mobile width", () => {
  assert.match(source, /<TabsList className="[^"]*\bmax-w-full\b[^"]*\boverflow-x-auto\b/);
  assert.match(source, /<TabsTrigger[\s\S]*className="[^"]*\bshrink-0\b[^"]*"/);
  assert.match(source, /<TabsContent value="ai" className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b/);
  assert.match(source, /<TabsContent value="resume" className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b/);
  assert.match(source, /<TabsContent value="data" className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b/);
  assert.match(source, /<Card className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*\boverflow-hidden\b[^"]*bg-muted\/30/);
});

test("candidate details score block stacks actions cleanly on mobile", () => {
  const scoreStart = source.indexOf("{/* Score block */}");
  const scoreEnd = source.indexOf("{/* Main Verdict", scoreStart);
  assert.ok(scoreStart >= 0 && scoreEnd > scoreStart, "Could not find candidate score block");

  const scoreBlock = source.slice(scoreStart, scoreEnd);

  assert.match(scoreBlock, /className="[^"]*\bflex\b[^"]*\bflex-col\b[^"]*\bitems-stretch\b[^"]*\bsm:flex-row\b/);
  assert.match(scoreBlock, /className="[^"]*\bwhitespace-nowrap\b[^"]*\btext-xs\b[^"]*\btext-muted-foreground\b/);
  assert.doesNotMatch(scoreBlock, /max-w-\[7\.5rem\]/);
  assert.match(scoreBlock, /className="[^"]*\bw-full\b[^"]*\bsm:w-auto\b/);
});
