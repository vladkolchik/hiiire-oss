import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readProjectFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin sidebar links to protected content admin", () => {
  const sidebarSource = readProjectFile("components/admin/admin-sidebar.tsx");

  assert.match(sidebarSource, /title:\s*"Контент"[\s\S]*?href:\s*"\/admin\/content"/);
});

test("protected content page gives concise author guidance and mounts Sveltia", () => {
  const pageSource = readProjectFile("app/(admin)/admin/(protected)/content/page.tsx");

  assert.match(pageSource, /ContentCmsClient/);
  assert.match(pageSource, /<ContentCmsClient\s*\/>/);
  assert.match(pageSource, /Accordion|details|summary/);
  assert.match(pageSource, /чеклист/i);
  assert.match(pageSource, /ветк/i);
  assert.match(pageSource, /PR|pull request/i);
  assert.doesNotMatch(pageSource, /requirePlatformAdmin/);
});

test("Sveltia client loads CMS manually and uses local publishing workflow", () => {
  const clientSource = readProjectFile("components/admin/content-cms-client.tsx");

  assert.match(clientSource, /"use client"/);
  assert.match(clientSource, /CMS_MANUAL_INIT\s*=\s*true/);
  assert.match(clientSource, /https:\/\/unpkg\.com\/@sveltia\/cms@\d+\.\d+\.\d+\/dist\/sveltia-cms\.js/);
  assert.match(clientSource, /local_backend/);
  assert.match(clientSource, /localhost|127\.0\.0\.1|NODE_ENV/);
  assert.match(clientSource, /let\s+sveltiaScriptLoadPromise/);
  assert.match(clientSource, /await\s+window\.CMS\.init/);
  assert.match(
    clientSource,
    /sha512-zsPprk61cwbRbwlWl3TeOrZh8v\/mR97EQ2FhfM9\+xju\+u7x2Y2lMZV6G2WHaFTueQ5Z1Oe2utrioPQPwy0o\/9A==/,
  );
  assert.match(clientSource, /script\.integrity\s*=/);
  assert.match(clientSource, /script\.crossOrigin\s*=\s*"anonymous"/);
  assert.doesNotMatch(clientSource, /token|client_secret|access_token/i);
});

test("Sveltia config exposes blog and knowledge base collections with controlled fields", () => {
  const clientSource = readProjectFile("components/admin/content-cms-client.tsx");

  assert.match(clientSource, /name:\s*"blog"[\s\S]*?folder:\s*"content\/blog"/);
  assert.match(clientSource, /name:\s*"knowledge-base"[\s\S]*?folder:\s*"content\/knowledge-base"/);
  assert.match(clientSource, /output:\s*{[\s\S]*?omit_empty_optional_fields:\s*true/);
  assert.match(clientSource, /slug:\s*"{{fields\.slug}}"/);
  assert.match(clientSource, /name:\s*"url"[\s\S]*?widget:\s*"select"[\s\S]*?landingUrlOptions/);

  for (const fieldName of ["category", "status", "intent", "articleType", "productArea"]) {
    assert.match(
      clientSource,
      new RegExp(`name:\\s*"${fieldName}"[\\s\\S]*?widget:\\s*"select"`),
      `${fieldName} must be a controlled select field`,
    );
  }

  for (const fieldName of ["publishedAt", "updatedAt"]) {
    assert.match(
      clientSource,
      new RegExp(`name:\\s*"${fieldName}"[\\s\\S]*?widget:\\s*"datetime"[\\s\\S]*?type:\\s*"date"[\\s\\S]*?format:\\s*"YYYY-MM-DD"`),
      `${fieldName} must save YYYY-MM-DD values accepted by content validation`,
    );
  }
});

test("content admin guidance and preview cover editorial guardrails", () => {
  const pageSource = readProjectFile("app/(admin)/admin/(protected)/content/page.tsx");
  const clientSource = readProjectFile("components/admin/content-cms-client.tsx");

  for (const phrase of [
    "Первый экран",
    "таблиц",
    "FAQ",
    "Источники",
    "финальное решение",
    "обезличенном",
    "relatedContent",
  ]) {
    assert.match(pageSource, new RegExp(phrase, "i"));
  }

  for (const fieldName of ["h1", "excerpt", "body", "faq", "sources", "relatedContent"]) {
    assert.match(clientSource, new RegExp(fieldName));
  }
});

test("content workflow docs and scripts cover required publishing operations", () => {
  const docsUrl = new URL("../docs/content-workflow.md", import.meta.url);
  const packageJson = readProjectFile("package.json");

  assert.equal(existsSync(docsUrl), true);
  const workflow = readFileSync(docsUrl, "utf8");

  for (const phrase of [
    "branch",
    "PR",
    "Sveltia preview",
    "relatedContent",
    "Google Search Console",
    "Яндекс Вебмастер",
    "Bing Webmaster Tools",
    "GEO Monitoring",
    "IndexNow",
  ]) {
    assert.match(workflow, new RegExp(phrase, "i"));
  }

  assert.match(packageJson, /"content:check"/);
  assert.match(packageJson, /"content:lint"/);
  assert.match(packageJson, /"content:quality"/);
  assert.match(packageJson, /"content:indexnow"/);
  assert.match(packageJson, /"test:content"/);
});
