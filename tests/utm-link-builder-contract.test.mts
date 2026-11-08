import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function read(filePath: string) {
  assert.ok(existsSync(filePath), `${filePath} should exist`);
  return readFileSync(filePath, "utf8");
}

test("UTM link builder creates standard links and omits removed or empty params", async () => {
  const moduleUrl = pathToFileURL(path.resolve("lib/marketing/utm-link-builder.ts")).href;
  const { buildUtmLink, normalizeLinkParamValue } = await import(`${moduleUrl}?utm-builder=${Date.now()}`);

  assert.equal(normalizeLinkParamValue("May Launch 2026"), "may_launch_2026");

  const link = buildUtmLink({
    baseUrl: "https://hiiire.com/",
    utm: {
      source: "Telegram",
      medium: "Post",
      campaign: "May Launch",
      content: "",
      term: "Recruiters RU",
    },
    customParams: [
      { key: "audience", value: "Recruiters" },
      { key: "promo", value: "" },
      { key: "", value: "ignored" },
      { key: "gclid", value: "manual-click-id" },
    ],
  });

  assert.equal(
    link,
    "https://hiiire.com/?utm_source=telegram&utm_medium=post&utm_campaign=may_launch&utm_term=recruiters_ru&audience=recruiters",
  );
  assert.doesNotMatch(link, /utm_content|promo|gclid|manual-click-id/);
});

test("admin marketing page mounts compact UTM builder with custom params and help spoiler", () => {
  const page = read("app/(admin)/admin/(protected)/marketing/page.tsx");
  const builder = read("components/admin/utm-link-builder.tsx");
  const docs = read("docs/For_juniors/hiiire_for_junior.md");

  assert.match(page, /UtmLinkBuilder/);
  assert.match(builder, /https:\/\/hiiire\.com\//);
  assert.match(builder, /Конструктор ссылок/);
  assert.match(builder, /Лендинг/);
  assert.match(builder, /Заявка/);
  assert.match(builder, /Кастом/);
  assert.match(builder, /Доп\. параметры/);
  assert.match(builder, /addCustomParam/);
  assert.match(builder, /removeCustomParam/);
  assert.match(builder, /details/);
  assert.match(builder, /Что значит каждый параметр/);
  for (const label of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    assert.match(builder, new RegExp(label));
  }
  assert.match(docs, /Конструктор ссылок/);
  assert.match(docs, /Доп\. параметры/);
});
