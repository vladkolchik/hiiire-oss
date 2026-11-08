import { buildLlmsTxt } from "../../lib/content/feeds.ts";

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=3600",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
