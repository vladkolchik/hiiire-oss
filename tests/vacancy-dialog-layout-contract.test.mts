import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createSource = readFileSync("components/dashboard/create-vacancy-dialog.tsx", "utf8");
const editSource = readFileSync("components/dashboard/edit-vacancy-dialog.tsx", "utf8");
const addCandidateSource = readFileSync("components/dashboard/add-candidate-dialog.tsx", "utf8");

for (const [name, source] of [
  ["create vacancy", createSource],
  ["edit vacancy", editSource],
] as const) {
  test(`${name} native selects use theme tokens for dark mode`, () => {
    assert.match(source, /selectClassName/);
    assert.match(source, /bg-background/);
    assert.match(source, /text-foreground/);
    assert.match(source, /\[&_option\]:bg-background/);
    assert.match(source, /\[&_option\]:text-foreground/);
  });

  test(`${name} advanced section keeps a gutter between field borders and section border`, () => {
    assert.match(source, /<AccordionContent className="[^"]*\bpx-1\b[^"]*\bpt-2\b/);
  });

  test(`${name} dialog keeps advanced fields inside the modal scroll area`, () => {
    assert.match(source, /import \{ ScrollArea \} from "@\/components\/ui\/scroll-area"/);
    assert.match(source, /<DialogContent[\s\S]*className="[^"]*\bmax-h-\[min\(90dvh,calc\(100dvh-2rem\)\)\][^"]*\boverflow-visible\b[^"]*\bflex\b[^"]*\bflex-col\b/);
    assert.match(source, /<form onSubmit=\{form\.handleSubmit\(onSubmit, onInvalid\)\} className="[^"]*\bmin-h-0\b[^"]*\bflex\b[^"]*\bflex-col\b/);
    assert.match(source, /<ScrollArea className="[^"]*\bh-\[calc\(90dvh-11\.5rem\)\][^"]*\bmax-h-\[calc\(100dvh-13\.5rem\)\][^"]*\bmin-h-\[12rem\][^"]*\bpr-3\b/);
    assert.doesNotMatch(source, /<ScrollArea className="[^"]*\bflex-1\b/);
    assert.match(source, /<div className="[^"]*\bshrink-0\b[^"]*\bflex\b[^"]*\bjustify-end\b/);
    assert.doesNotMatch(source, /<DialogContent[\s\S]*className="[^"]*\boverflow-y-auto\b/);
  });
}

test("edit vacancy dialog ignores outside clicks to avoid discarding unsaved edits", () => {
  assert.match(editSource, /onInteractOutside=\{\(event\) => event\.preventDefault\(\)\}/);
});

test("add candidate vacancy select constrains long selected vacancy titles", () => {
  const fieldStart = addCandidateSource.indexOf('name="vacancyId"');
  assert.notEqual(fieldStart, -1);
  const fieldBlock = addCandidateSource.slice(fieldStart, addCandidateSource.indexOf("<FormDescription>", fieldStart));

  assert.match(fieldBlock, /<FormItem className="[^"]*\bmin-w-0\b/);
  assert.match(fieldBlock, /<SelectTrigger className="[^"]*\bmin-w-0\b/);
  assert.match(fieldBlock, /<SelectValue placeholder="Выберите вакансию" \/>/);
});

test("add candidate dialog keeps submit controls visible on mobile", () => {
  const dialogContentStart = addCandidateSource.indexOf("<DialogContent");
  assert.notEqual(dialogContentStart, -1);
  const dialogContentTag = addCandidateSource.slice(
    dialogContentStart,
    addCandidateSource.indexOf(">", dialogContentStart) + 1
  );
  const scrollAreaStart = addCandidateSource.indexOf("<ScrollArea", dialogContentStart);
  const submitButtonStart = addCandidateSource.indexOf("{/* Submit Button */}", scrollAreaStart);
  const scrollAreaBlock = addCandidateSource.slice(scrollAreaStart, submitButtonStart);
  assert.notEqual(scrollAreaStart, -1);
  assert.notEqual(submitButtonStart, -1);

  assert.match(addCandidateSource, /import \{ ScrollArea \} from "@\/components\/ui\/scroll-area"/);
  assert.match(addCandidateSource, /<DialogContent[\s\S]*className="[^"]*\bh-\[min\(90dvh,calc\(100dvh-2rem\)\)\][^"]*\bmax-h-\[min\(90dvh,calc\(100dvh-2rem\)\)\][^"]*\boverflow-visible\b[^"]*\bflex\b[^"]*\bflex-col\b/);
  assert.match(addCandidateSource, /<DialogHeader className="shrink-0">/);
  assert.match(addCandidateSource, /<form[\s\S]*className="[^"]*\bmin-h-0\b[^"]*\bflex\b[^"]*\bflex-1\b[^"]*\bflex-col\b[^"]*\bgap-6\b/);
  assert.match(addCandidateSource, /<ScrollArea className="[^"]*\bmin-h-0\b[^"]*\bflex-1\b[^"]*\bpr-3\b/);
  assert.match(scrollAreaBlock, /<\/ScrollArea>/);
  assert.match(addCandidateSource, /<div className="[^"]*\bshrink-0\b[^"]*\bflex\b[^"]*\bjustify-end\b/);
  assert.doesNotMatch(dialogContentTag, /\boverflow-y-auto\b/);
  assert.doesNotMatch(addCandidateSource, /\bmin-h-\[12rem\]\b/);
});
