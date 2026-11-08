import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { landingFooterResourceLinks, landingNavigationLinks } from "../lib/landing-navigation-links.ts";

test("header navigation includes blog and keeps knowledge base out of the header", () => {
  assert.deepEqual(
    landingNavigationLinks.map((item) => item.href),
    ["/#features", "/#internal-portals", "/#how-it-works", "/#pricing", "/blog"],
  );
  assert.ok(landingNavigationLinks.some((item) => item.label === "Блог" && item.href === "/blog"));
  assert.equal(landingNavigationLinks.some((item) => item.label === "База знаний"), false);
});

test("footer resource links include blog, knowledge base, and PDF tools", () => {
  assert.deepEqual(landingFooterResourceLinks, [
    { href: "/blog", label: "Блог" },
    { href: "/knowledge-base", label: "База знаний" },
    { href: "/pdf-tools", label: "PDF-инструменты" },
  ]);
});

test("landing product navigation uses same-page section links for repeat hash clicks", () => {
  const navigationSource = readFileSync(
    new URL("../components/landing/navigation.tsx", import.meta.url),
    "utf8",
  );
  const footerSource = readFileSync(new URL("../components/landing/footer.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(navigationSource, /<a\s+[\s\S]*?href=\{item\.href\}/);
  assert.doesNotMatch(footerSource, /<a\s+[\s\S]*?href=\{item\.href\}/);
  assert.match(
    navigationSource,
    /import\s+\{\s*LandingSectionLink\s*\}\s+from\s+"@\/components\/landing\/landing-section-link";/,
  );
  assert.match(navigationSource, /<LandingSectionLink[\s\S]*?href=\{item\.href\}/);
  assert.match(footerSource, /<LandingSectionLink[\s\S]*?href=\{item\.href\}/);
});

test("landing header shows the signed-in email and dashboard link when auth data is present", () => {
  const navigationSource = readFileSync(
    new URL("../components/landing/navigation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(navigationSource, /const \[authenticatedUserEmail, setAuthenticatedUserEmail\]/);
  assert.match(navigationSource, /getLandingHeaderAuthView\(authenticatedUserEmail\)/);
  assert.match(navigationSource, /resolveLandingHeaderAuthenticatedEmail/);
  assert.match(navigationSource, /supabase\.auth\.getUser\(\)/);
  assert.match(navigationSource, /setAuthenticatedUserEmail\(email\)/);
  assert.match(navigationSource, /authView\.kind === "authenticated"\s*\?\s*\(/);
  assert.match(navigationSource, /href=\{authView\.dashboardHref\}/);
  assert.match(navigationSource, />В кабинет</);
  assert.match(navigationSource, /\{authView\.email\}/);
  assert.match(navigationSource, /min-w-0 max-w-\[220px\] truncate/);
});
