import type { MetadataRoute } from "next";

import { getCanonicalUrl } from "../lib/content/seo.ts";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
      },
      {
        userAgent: "GPTBot",
        allow: "/",
      },
    ],
    sitemap: getCanonicalUrl("/sitemap.xml"),
  };
}
