import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const currentUserFacingFiles = [
  "components/landing/hero.tsx",
  "components/landing/pricing.tsx",
  "components/dashboard/welcome-dialog.tsx",
  "app/(marketing)/terms/page.tsx",
  "docs/public-offer-hiiire-ru.md",
];

test("current user-facing trial copy says 7 days, not 14 days", () => {
  // docs/public-offer-hiiire-ru.md contains operator requisites and is absent in the public open-source export.
  const combined = currentUserFacingFiles
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  assert.match(combined, /Попробовать бесплатно — 7 дней/);
  assert.match(combined, /7 дней бесплатно/);
  assert.match(combined, /7 календарных дней/);
  assert.doesNotMatch(combined, /Попробовать бесплатно — 14 дней/);
  assert.doesNotMatch(combined, /14 дней бесплатно/);
  assert.doesNotMatch(combined, /14 календарных дней/);
});
