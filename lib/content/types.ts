import type {
  ARTICLE_TYPES,
  BLOG_CATEGORY_SLUGS,
  CONTENT_INTENTS,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  CTA_TYPES,
  DIFFICULTIES,
  KNOWLEDGE_BASE_CATEGORY_SLUGS,
  PRODUCT_AREAS,
  RELATED_CONTENT_PLACEMENTS,
  RELATED_CONTENT_TYPES,
} from "./taxonomy.ts";

export type ContentType = (typeof CONTENT_TYPES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type BlogCategory = (typeof BLOG_CATEGORY_SLUGS)[number];
export type KnowledgeBaseCategory =
  (typeof KNOWLEDGE_BASE_CATEGORY_SLUGS)[number];
export type ContentIntent = (typeof CONTENT_INTENTS)[number];
export type ArticleType = (typeof ARTICLE_TYPES)[number];
export type ProductArea = (typeof PRODUCT_AREAS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type RelatedContentType = (typeof RELATED_CONTENT_TYPES)[number];
export type RelatedContentPlacement =
  (typeof RELATED_CONTENT_PLACEMENTS)[number];
export type CtaType = (typeof CTA_TYPES)[number];

export type FaqItem = {
  question: string;
  answer: string;
};

export type ContentSource = {
  title: string;
  url: string;
};

type InternalRelatedContentLink = {
  type: Exclude<RelatedContentType, "landing">;
  slug: string;
  url?: never;
  label: string;
  placement: RelatedContentPlacement;
};

type LandingRelatedContentLink = {
  type: "landing";
  slug?: never;
  url: string;
  label: string;
  placement: RelatedContentPlacement;
};

export type RelatedContentLink =
  | InternalRelatedContentLink
  | LandingRelatedContentLink;

export type ContentBase = {
  contentType: ContentType;
  title: string;
  slug: string;
  h1: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  category: string;
  tags: string[];
  authorName: string;
  authorRole?: string;
  reviewerName?: string;
  reviewerRole?: string;
  publishedAt: string;
  updatedAt: string;
  readingTimeMinutes?: number;
  status: ContentStatus;
  canonicalUrl?: string;
  ogImage?: string;
  noindex?: boolean;
  faq?: FaqItem[];
  sources?: ContentSource[];
  relatedContent?: RelatedContentLink[];
  ctaType?: CtaType;
  body: string;
};

export type BlogPost = ContentBase & {
  contentType: "blog";
  category: BlogCategory;
  intent: ContentIntent;
};

export type KnowledgeBaseArticle = ContentBase & {
  contentType: "knowledge-base";
  category: KnowledgeBaseCategory;
  articleType: ArticleType;
  productArea: ProductArea;
  difficulty?: Difficulty;
  estimatedSetupMinutes?: number;
  prerequisites?: string[];
};

export type ContentItem = BlogPost | KnowledgeBaseArticle;

export type ContentIndexEntry = {
  type: ContentType;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  url: string;
};
