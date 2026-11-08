import "server-only";

import fs from "node:fs";
import path from "node:path";

export type QaDocReference = {
  refId: string;
  file: "docs/For_juniors/hiiire_for_junior.md";
  section: string;
  lineStart: number;
  lineEnd: number;
};

type IndexedSection = QaDocReference & {
  content: string;
  tokenSet: Set<string>;
};

type DocsCache = {
  cacheKey: string;
  sections: IndexedSection[];
};

type PromptCache = {
  mtimeMs: number;
  value: string;
};

const QA_DOC_FILE = "docs/For_juniors/hiiire_for_junior.md" as const;

const FALLBACK_SYSTEM_PROMPT = [
  "Ты QA-ассистент проекта hiiire.",
  "Опирайся только на переданные секции документации.",
  "Не додумывай поведение, которого нет в документации.",
  "Если поведение противоречит документации — verdict=looks_like_bug.",
  "Если поведение не описано — verdict=not_documented.",
].join("\n");

const MAX_SECTION_CONTEXT_CHARS = 2200;

let docsCache: DocsCache | null = null;
let promptCache: PromptCache | null = null;

export function getQaSystemInstruction(): string {
  const fullPath = getQaPromptPath();

  try {
    const stat = fs.statSync(fullPath);
    if (promptCache && promptCache.mtimeMs === stat.mtimeMs) return promptCache.value;

    const value = fs.readFileSync(fullPath, "utf8").trim();
    const finalValue = value.length > 0 ? value : FALLBACK_SYSTEM_PROMPT;
    promptCache = { mtimeMs: stat.mtimeMs, value: finalValue };
    return finalValue;
  } catch {
    return FALLBACK_SYSTEM_PROMPT;
  }
}

export function getRelevantQaSections(query: string, maxSections = 8): {
  references: QaDocReference[];
  contextBlock: string;
} {
  const sections = getIndexedSections();
  if (sections.length === 0) return { references: [], contextBlock: "" };

  const queryTokens = tokenize(query);
  const queryLower = query.toLowerCase();
  const routeMatches = extractRoutes(queryLower);

  const ranked = sections
    .map((section) => ({
      section,
      score: scoreSection(section, queryTokens, routeMatches, queryLower),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.section.lineStart - b.section.lineStart;
    });

  const positive = ranked.filter((row) => row.score > 0).map((row) => row.section);
  const selected = (positive.length > 0 ? positive : buildFallbackSections(sections)).slice(0, maxSections);

  const references: QaDocReference[] = selected.map(({ refId, file, section, lineStart, lineEnd }) => ({
    refId,
    file,
    section,
    lineStart,
    lineEnd,
  }));

  const contextBlock = selected
    .map((section) => {
      const clippedContent =
        section.content.length > MAX_SECTION_CONTEXT_CHARS
          ? `${section.content.slice(0, MAX_SECTION_CONTEXT_CHARS)}\n...[section truncated]`
          : section.content;
      return [
        `[${section.refId}] file=${section.file} section="${section.section}" lines=${section.lineStart}-${section.lineEnd}`,
        clippedContent,
      ].join("\n");
    })
    .join("\n\n");

  return { references, contextBlock };
}

function getIndexedSections(): IndexedSection[] {
  const cacheKey = getDocsCacheKey();
  if (docsCache && docsCache.cacheKey === cacheKey) return docsCache.sections;

  const sections: IndexedSection[] = [];
  let globalIndex = 0;
  const raw = fs.readFileSync(getQaDocPath(), "utf8");
  const parsed = splitIntoSections(QA_DOC_FILE, raw);

  for (const section of parsed) {
    globalIndex += 1;
    const refId = `J${String(globalIndex).padStart(3, "0")}`;
    sections.push({
      refId,
      file: QA_DOC_FILE,
      section: section.section,
      lineStart: section.lineStart,
      lineEnd: section.lineEnd,
      content: section.content,
      tokenSet: tokenize(`${section.section}\n${section.content}`),
    });
  }

  docsCache = { cacheKey, sections };
  return sections;
}

function getDocsCacheKey(): string {
  const stat = fs.statSync(getQaDocPath());
  return `${QA_DOC_FILE}:${stat.size}:${stat.mtimeMs}`;
}

function getQaDocPath(): string {
  return path.join(process.cwd(), "docs", "For_juniors", "hiiire_for_junior.md");
}

function getQaPromptPath(): string {
  return path.join(process.cwd(), "docs", "For_juniors", "promptforqaassistant.md");
}

function splitIntoSections(file: typeof QA_DOC_FILE, raw: string): Array<{
  section: string;
  lineStart: number;
  lineEnd: number;
  content: string;
}> {
  const lines = raw.split(/\r?\n/);
  const headings: Array<{ line: number; level: number; title: string }> = [];
  const headingRegex = /^(#{1,6})\s+(.+?)\s*$/;

  for (let i = 0; i < lines.length; i += 1) {
    const match = headingRegex.exec(lines[i]);
    if (!match) continue;
    headings.push({ line: i + 1, level: match[1].length, title: match[2].trim() });
  }

  const sections: Array<{ section: string; lineStart: number; lineEnd: number; content: string }> = [];

  if (headings.length === 0) {
    sections.push({
      section: `${file} (full document)`,
      lineStart: 1,
      lineEnd: Math.max(1, lines.length),
      content: raw.trim(),
    });
    return sections;
  }

  if (headings[0].line > 1) {
    sections.push({
      section: `${file} (intro)`,
      lineStart: 1,
      lineEnd: headings[0].line - 1,
      content: lines.slice(0, headings[0].line - 1).join("\n").trim(),
    });
  }

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const next = headings[i + 1];
    const lineStart = current.line;
    const lineEnd = next ? next.line - 1 : lines.length;
    const content = lines.slice(lineStart - 1, lineEnd).join("\n").trim();
    const prefix = `${"#".repeat(current.level)} `;
    const section = current.title.startsWith(prefix) ? current.title : current.title;
    sections.push({ section, lineStart, lineEnd, content });
  }

  return sections;
}

function tokenize(text: string): Set<string> {
  if (!text) return new Set<string>();
  const lowered = text.toLowerCase();
  const tokens = lowered.match(/[\p{L}\p{N}_/-]{2,}/gu) ?? [];
  return new Set(tokens);
}

function extractRoutes(queryLower: string): string[] {
  const matches = queryLower.match(/\/[a-z0-9/_-]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

function scoreSection(section: IndexedSection, queryTokens: Set<string>, routes: string[], queryLower: string): number {
  let score = 0;

  for (const token of queryTokens) {
    if (!section.tokenSet.has(token)) continue;
    score += token.length >= 8 ? 2 : 1;
  }

  for (const route of routes) {
    if (section.content.toLowerCase().includes(route)) score += 6;
  }

  if (queryLower.includes("баг")) score += 2;
  if (queryLower.includes("expected")) score += 1;
  if (queryLower.includes("заглушк") && section.content.toLowerCase().includes("заглуш")) score += 3;

  return score;
}

function buildFallbackSections(sections: IndexedSection[]): IndexedSection[] {
  return sections.slice(0, 8);
}
