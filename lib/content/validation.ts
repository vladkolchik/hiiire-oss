import { z } from "zod";

import {
  ALLOWED_LANDING_URLS,
  ARTICLE_TYPES,
  BLOG_CATEGORY_SLUGS,
  CONTENT_INTENTS,
  CONTENT_STATUSES,
  CTA_TYPES,
  DIFFICULTIES,
  KNOWLEDGE_BASE_CATEGORY_SLUGS,
  PRODUCT_AREAS,
  RELATED_CONTENT_PLACEMENTS,
} from "./taxonomy.ts";
import type { BlogPost, ContentItem, KnowledgeBaseArticle, RelatedContentLink } from "./types.ts";

type ValidationContext = {
  expectedContentType?: ContentItem["contentType"];
  expectedSlug?: string;
  sourcePath?: string;
};

export type ContentValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: string[] };

const requiredString = z.string().trim().min(1);

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD")
  .refine((value) => isStrictIsoCalendarDate(value), {
    message: "Дата должна быть календарной датой",
  });

const urlSchema = requiredString.url("URL должен быть полным адресом");
const externalSourceUrlSchema = urlSchema.refine((value) => isHttpUrl(value), {
  message: "URL источника должен начинаться с https:// или http://",
});

const relatedContentSchema: z.ZodType<RelatedContentLink> = z
  .object({
    type: z.enum(["blog", "knowledge-base", "landing"]),
    slug: requiredString.optional(),
    url: requiredString.optional(),
    label: requiredString,
    placement: z.enum(RELATED_CONTENT_PLACEMENTS),
  })
  .superRefine((link, context) => {
    if (link.type === "landing") {
      if (link.slug !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["slug"],
          message: "landing relatedContent не должен содержать slug",
        });
      }
      if (link.url === undefined) {
        context.addIssue({
          code: "custom",
          path: ["url"],
          message: "landing relatedContent должен содержать url",
        });
      } else if (!isAllowedLandingUrl(link.url)) {
        context.addIssue({
          code: "custom",
          path: ["url"],
          message: "landing URL должен быть из разрешенного списка",
        });
      }
      return;
    }

    if (link.slug === undefined) {
      context.addIssue({
        code: "custom",
        path: ["slug"],
        message: `${link.type} relatedContent должен содержать slug`,
      });
    }
    if (link.url !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: `${link.type}/${link.slug ?? "без-slug"} relatedContent не должен содержать url`,
      });
    }
  })
  .transform((link): RelatedContentLink => {
    if (link.type === "landing") {
      return {
        type: "landing",
        url: link.url ?? "",
        label: link.label,
        placement: link.placement,
      };
    }

    return {
      type: link.type,
      slug: link.slug ?? "",
      label: link.label,
      placement: link.placement,
    };
  });

const baseSchema = z.object({
  contentType: z.enum(["blog", "knowledge-base"]),
  title: requiredString,
  slug: requiredString.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  h1: requiredString,
  excerpt: requiredString,
  metaTitle: requiredString,
  metaDescription: requiredString,
  category: requiredString,
  tags: z.array(requiredString).min(1),
  authorName: requiredString,
  authorRole: requiredString.optional(),
  reviewerName: requiredString.optional(),
  reviewerRole: requiredString.optional(),
  publishedAt: isoDateSchema,
  updatedAt: isoDateSchema,
  readingTimeMinutes: z.number().int().positive().optional(),
  status: z.enum(CONTENT_STATUSES),
  canonicalUrl: urlSchema.optional(),
  ogImage: z.string().min(1).optional(),
  noindex: z.boolean().optional(),
  faq: z
    .array(
      z.object({
        question: requiredString,
        answer: requiredString,
      }),
    )
    .optional(),
  sources: z
    .array(
      z.object({
        title: requiredString,
        url: externalSourceUrlSchema,
      }),
    )
    .optional(),
  relatedContent: z.array(relatedContentSchema).optional(),
  ctaType: z.enum(CTA_TYPES).optional(),
  body: requiredString,
});

const blogSchema: z.ZodType<BlogPost> = baseSchema
  .extend({
    contentType: z.literal("blog"),
    category: z.enum(BLOG_CATEGORY_SLUGS),
    intent: z.enum(CONTENT_INTENTS),
  })
  .refine(hasValidDateOrder, {
    message: "updatedAt должен быть не раньше publishedAt",
    path: ["updatedAt"],
  });

const knowledgeBaseSchema: z.ZodType<KnowledgeBaseArticle> = baseSchema
  .extend({
    contentType: z.literal("knowledge-base"),
    category: z.enum(KNOWLEDGE_BASE_CATEGORY_SLUGS),
    articleType: z.enum(ARTICLE_TYPES),
    productArea: z.enum(PRODUCT_AREAS),
    difficulty: z.enum(DIFFICULTIES).optional(),
    estimatedSetupMinutes: z.number().int().positive().optional(),
    prerequisites: z.array(requiredString).optional(),
  })
  .refine(hasValidDateOrder, {
    message: "updatedAt должен быть не раньше publishedAt",
    path: ["updatedAt"],
  });

const contentItemSchema: z.ZodType<ContentItem> = z.union([
  blogSchema,
  knowledgeBaseSchema,
]);

export function parseContentItem(
  input: unknown,
  context: ValidationContext = {},
): ContentItem {
  const parsed = contentItemSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(formatZodIssues(parsed.error.issues, context.sourcePath));
  }

  const contextIssues = validateContext(parsed.data, context);
  if (contextIssues.length > 0) {
    throw new Error(contextIssues.join("\n"));
  }

  return parsed.data;
}

export function validateContentCollection(
  items: unknown[],
): ContentValidationResult {
  const issues: string[] = [];
  const parsedItems: ContentItem[] = [];

  for (const [index, item] of items.entries()) {
    const parsed = contentItemSchema.safeParse(item);

    if (!parsed.success) {
      issues.push(
        `item ${index}: ${formatZodIssues(parsed.error.issues)}`,
      );
      continue;
    }

    parsedItems.push(parsed.data);
  }

  issues.push(...validateDuplicateSlugs(parsedItems));
  issues.push(...validateRelatedContent(parsedItems));

  return issues.length > 0 ? { ok: false, issues } : { ok: true, issues: [] };
}

function validateContext(
  item: ContentItem,
  context: ValidationContext,
): string[] {
  const issues: string[] = [];

  if (
    context.expectedContentType &&
    item.contentType !== context.expectedContentType
  ) {
    issues.push(
      formatIssue(
        context.sourcePath ?? item.slug,
        `contentType должен соответствовать папке ${context.expectedContentType}`,
      ),
    );
  }

  if (context.expectedSlug && item.slug !== context.expectedSlug) {
    issues.push(
      formatIssue(
        context.sourcePath ?? item.slug,
        "slug должен совпадать с именем файла",
      ),
    );
  }

  return issues;
}

function hasValidDateOrder(item: {
  publishedAt: string;
  updatedAt: string;
}): boolean {
  return compareIsoDates(item.updatedAt, item.publishedAt) >= 0;
}

function isStrictIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateDuplicateSlugs(items: ContentItem[]): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];

  for (const item of items) {
    const key = `${item.contentType}:${item.slug}`;
    if (seen.has(key)) {
      issues.push(`${item.contentType}/${item.slug}: slug должен быть уникальным`);
    }
    seen.add(key);
  }

  return issues;
}

function validateRelatedContent(items: ContentItem[]): string[] {
  const issues: string[] = [];
  const byKey = new Map(
    items.map((item) => [`${item.contentType}:${item.slug}`, item]),
  );

  for (const item of items) {
    for (const link of item.relatedContent ?? []) {
      if (link.type === "landing") {
        if (!link.url || !isAllowedLandingUrl(link.url)) {
          issues.push(
            `${item.contentType}/${item.slug}: landing-ссылка ${link.url ?? "без URL"} не разрешена`,
          );
        }
        continue;
      }

      if (!link.slug) {
        issues.push(
          `${item.contentType}/${item.slug}: relatedContent для ${link.type} должен содержать slug`,
        );
        continue;
      }

      if (link.type === item.contentType && link.slug === item.slug) {
        issues.push(
          `${item.contentType}/${item.slug}: relatedContent не должен ссылаться на себя`,
        );
        continue;
      }

      const target = byKey.get(`${link.type}:${link.slug}`);
      if (!target) {
        issues.push(
          `${item.contentType}/${item.slug}: relatedContent ${link.type}/${link.slug} не найден`,
        );
        continue;
      }

      if (
        item.status === "published" &&
        (target.status !== "published" || target.noindex === true)
      ) {
        issues.push(
          `${item.contentType}/${item.slug}: published-материал не должен ссылаться на непубличный ${link.type}/${link.slug}`,
        );
      }
    }
  }

  return issues;
}

function isAllowedLandingUrl(url: string): boolean {
  return ALLOWED_LANDING_URLS.some((allowedUrl) => allowedUrl === url);
}

function formatZodIssues(issues: z.ZodIssue[], sourcePath?: string): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
      return formatIssue(
        sourcePath ? `${sourcePath}: ${path}` : path,
        issue.message,
      );
    })
    .join("\n");
}

function formatIssue(label: string, message: string): string {
  return `${label}: ${message}`;
}
