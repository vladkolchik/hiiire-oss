import { buildRssFeed } from "../../../lib/content/feeds.ts";

export function GET(): Response {
  return new Response(buildRssFeed(), {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=3600",
      "content-type": "application/rss+xml; charset=utf-8",
    },
  });
}
