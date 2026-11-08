import "server-only";

export function stripHtmlToText(html: string): string {
  const s = String(html ?? "");
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function pMap<T, R>(
  items: T[],
  mapper: (item: T, idx: number) => Promise<R>,
  opts?: { concurrency?: number }
): Promise<R[]> {
  const concurrency = Math.max(1, Math.min(20, Math.trunc(opts?.concurrency ?? 5)));
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

