import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const footerSource = readFileSync(new URL("../components/landing/footer.tsx", import.meta.url), "utf8");

test("footer product links use a same-page anchor link for repeat hash clicks", () => {
  assert.match(
    footerSource,
    /import\s+\{\s*LandingSectionLink\s*\}\s+from\s+"@\/components\/landing\/landing-section-link";/,
  );
  assert.match(footerSource, /<LandingSectionLink\s+href=\{item\.href\}/);
});
