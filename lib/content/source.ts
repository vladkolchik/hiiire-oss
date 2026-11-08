import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import matter from "gray-matter";

import { parseContentItem, validateContentCollection } from "./validation.ts";
import type { ContentItem } from "./types.ts";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load: (input: string) => unknown };

const MATTER_OPTIONS = {
  engines: {
    yaml: {
      parse: (input: string) => yaml.load(input) ?? {},
    },
  },
};

type SourceFolder = {
  contentType: ContentItem["contentType"];
  folder: string;
};

const SOURCE_FOLDERS: SourceFolder[] = [
  { contentType: "blog", folder: "blog" },
  { contentType: "knowledge-base", folder: "knowledge-base" },
];

export function readContentCollection(): ContentItem[] {
  const items = SOURCE_FOLDERS.flatMap((source) => readContentFolder(source));
  const validation = validateContentCollection(items);

  if (!validation.ok) {
    throw new Error(validation.issues.join("\n"));
  }

  return items;
}

function readContentFolder(source: SourceFolder): ContentItem[] {
  const folderPath = path.join(CONTENT_ROOT, source.folder);

  if (!fs.existsSync(folderPath)) {
    return [];
  }

  return fs
    .readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readContentFile(source, path.join(folderPath, entry.name)));
}

function readContentFile(source: SourceFolder, filePath: string): ContentItem {
  const sourcePath = path.relative(process.cwd(), filePath).replaceAll("\\", "/");

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw, MATTER_OPTIONS);
    const slug = path.basename(filePath, ".md");

    return parseContentItem(
      {
        ...parsed.data,
        body: parsed.content.trim(),
      },
      {
        expectedContentType: source.contentType,
        expectedSlug: slug,
        sourcePath,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(`${sourcePath}:`)) {
      throw error;
    }
    throw new Error(`${sourcePath}: ${message}`);
  }
}
