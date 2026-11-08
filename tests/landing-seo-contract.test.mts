import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import test from "node:test";

const landingPageSource = readFileSync("app/(marketing)/page.tsx", "utf8");
const previewImagePath = "public/og/hiiire-preview.png";

test("root landing declares canonical and OpenGraph metadata", () => {
  assert.match(landingPageSource, /import\s+type\s+\{\s*Metadata\s*\}\s+from\s+"next";/);
  assert.match(landingPageSource, /import\s+\{\s*getCanonicalUrl\s*\}\s+from\s+"@\/lib\/content\/seo";/);
  assert.match(landingPageSource, /export\s+const\s+metadata:\s*Metadata\s*=\s*\{/);
  assert.match(landingPageSource, /alternates:\s*\{\s*canonical:\s*getCanonicalUrl\("\/"\)/);
  assert.match(landingPageSource, /openGraph:\s*\{/);
  assert.match(landingPageSource, /url:\s*getCanonicalUrl\("\/"\)/);
  assert.match(landingPageSource, /siteName:\s*"hiiire"/);
  assert.match(landingPageSource, /type:\s*"website"/);
  assert.match(landingPageSource, /const\s+landingPreviewImage\s*=\s*"\/og\/hiiire-preview\.png";/);
  assert.match(landingPageSource, /images:\s*\[\s*\{/);
  assert.match(landingPageSource, /url:\s*getCanonicalUrl\(landingPreviewImage\)/);
  assert.match(landingPageSource, /width:\s*889/);
  assert.match(landingPageSource, /height:\s*344/);
  assert.match(landingPageSource, /alt:\s*landingTitle/);
  assert.match(landingPageSource, /twitter:\s*\{/);
  assert.match(landingPageSource, /card:\s*"summary_large_image"/);
  assert.match(landingPageSource, /images:\s*\[\s*getCanonicalUrl\(landingPreviewImage\)\s*\]/);
  assert.equal(existsSync(previewImagePath), true);
});
