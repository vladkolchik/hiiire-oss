import type { MetadataRoute } from "next";

import { buildSitemapEntries } from "../lib/content/seo.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries();
}
