# Content Workflow

This document is the required workflow for hiiire blog and knowledge-base materials.

## Where Content Lives

- Blog posts: `content/blog/*.md`
- Knowledge-base articles: `content/knowledge-base/*.md`
- Body is Markdown with frontmatter fields validated by `lib/content`.
- Production indexing includes only `status: published` materials without `noindex: true`.
- Review materials can render locally in dev routes, but they do not enter production sitemap, RSS, `llms.txt`, or IndexNow URL lists.

## Local Authoring

1. Create a branch from `dev`.
2. Run the app locally.
3. Open `/admin/content` as a platform admin.
4. Edit content in Sveltia. The editor is for local branch work; it does not publish directly to production.
5. Open the real public route locally, for example `/blog/my-slug` or `/knowledge-base/my-slug`.
6. Run checks before PR:

```bash
npm run content:check
npm run content:lint
npm run content:quality
```

Sveltia preview is a writing aid, not final QA. The real check is the rendered local route.

## Status Values

- `draft`: work in progress, not public.
- `review`: visible locally in dev mode for review, not production-indexed.
- `published`: public page. It enters sitemap/RSS/agent files only when `noindex` is not enabled.

Use `noindex: true` only for published pages that should be visible by direct URL but excluded from discovery and indexing.

## Knowledge-Base Categories

Knowledge-base `category` values are controlled slugs. Use one of:

- `start` — Первые шаги
- `vacancies` — Вакансии
- `candidates` — Кандидаты
- `ai-assistant` — AI-ассистент
- `ai-ranking` — AI-оценка кандидатов
- `analytics` — Аналитика
- `hh-integration` — Интеграция HH.ru
- `billing` — Оплата и тарифы

## Manual Related Links

`relatedContent` is curated manually. When writing a new article, ask an agent to inspect current blog and knowledge-base pages and suggest 2-4 relevant internal links.

Keep links useful:

- link to the next practical step;
- link to a deeper explanation;
- avoid loops back to the same material;
- use landing links only from the allowed list in the CMS.

## Author Checklist

- The first screen answers the reader's question.
- H1, excerpt, SEO title, and SEO description are specific and not duplicated.
- Comparisons are tables with short rows and clear columns, and they are checked on mobile.
- FAQ is visible near the end of the page.
- External facts, numbers, and methods have sources.
- AI is described as a decision-support tool, not a final hiring authority.
- hiiire data is anonymized and aggregated.
- No private candidate, resume, vacancy, customer, or company data is included.
- No legal, hiring, or compliance guarantee is promised unless it is explicitly approved.

## Search And Webmaster Setup

After release, connect and monitor:

- Google Search Console
- Яндекс Вебмастер
- Bing Webmaster Tools

Submit or inspect:

- `https://hiiire.com/sitemap.xml`
- `https://hiiire.com/robots.txt`
- `https://hiiire.com/blog/rss.xml`
- `https://hiiire.com/llms.txt`

Track indexing issues, duplicate canonical warnings, crawl errors, and pages excluded by `noindex`.

## GEO Monitoring

Keep a lightweight monitoring log for generative search visibility:

- date checked;
- query or prompt;
- system checked, for example ChatGPT Search, Perplexity, Google AI results;
- whether hiiire appeared;
- cited URL;
- note about missing or incorrect answer.

Use the log to decide future blog and knowledge-base topics. Do not rewrite content only for bots if it makes the page worse for readers.

## IndexNow

`/indexnow-key.txt` exposes `INDEXNOW_KEY` when configured. Production release automation can submit changed public URLs to IndexNow after merge.

Run submission after a release with:

```bash
APP_ORIGIN=https://hiiire.com INDEXNOW_KEY=<key> npm run content:indexnow
```

Optional settings:

- `INDEXNOW_URLS`: comma-separated or newline-separated changed URLs. If it is empty, all public blog and knowledge-base URLs are submitted.
- `INDEXNOW_ENDPOINT`: custom endpoint, defaults to `https://api.indexnow.org/indexnow`.

The command logs endpoint, status, submitted URL count, submitted URLs, and response body. A failed IndexNow response exits with non-zero status so release automation can surface it.

IndexNow should include only public URLs:

- blog and knowledge-base pages with `status: published`;
- no `draft`;
- no `review`;
- no `noindex`.

If a page is removed or moved, check sitemap and canonical output before submitting.
