import type { BlockNodeContent, TiptapDocument } from "@giraffle/domain";

export interface TocHeading {
  level: number;
  text: string;
  blockId: string | null;
}

export interface NoteChunk {
  index: number;
  title: string;
  level: number;
  document: TiptapDocument;
  wordCount: number;
  isContinuation: boolean;
}

const CHUNK_HEADING_LEVELS = new Set([1, 2, 3]);
const AVERAGE_READING_WPM = 220;
const TARGET_WORDS_PER_PAGE = 120;

function extractHeadingText(node: BlockNodeContent): string {
  if (!node.content) return "";
  return node.content
    .filter((child): child is { type: "text"; text: string } => child.type === "text")
    .map((child) => child.text)
    .join("")
    .trim();
}

function countNodeWords(node: BlockNodeContent | { type: "text"; text: string }): number {
  if ("text" in node && typeof node.text === "string") {
    const trimmed = node.text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }
  const block = node as BlockNodeContent;
  if (!block.content) return 0;
  let sum = 0;
  for (const child of block.content) {
    sum += countNodeWords(child);
  }
  return sum;
}

export function splitDocumentIntoChunks(doc: TiptapDocument): NoteChunk[] {
  const chunks: NoteChunk[] = [];
  let bucket: BlockNodeContent[] = [];
  let bucketWords = 0;
  let currentTitle = "Page 1";
  let currentLevel = 0;
  let nextIsContinuation = false;

  const flush = (isContinuation: boolean) => {
    if (bucket.length === 0) return;
    chunks.push({
      index: chunks.length,
      title: currentTitle,
      level: currentLevel,
      document: { type: "doc", content: bucket },
      wordCount: bucketWords,
      isContinuation,
    });
    bucket = [];
    bucketWords = 0;
  };

  for (const node of doc.content) {
    const level =
      node.type === "heading" && typeof node.attrs?.level === "number"
        ? node.attrs.level
        : null;
    const isChunkHeading = level !== null && CHUNK_HEADING_LEVELS.has(level);

    if (isChunkHeading) {
      flush(nextIsContinuation);
      currentTitle = extractHeadingText(node) || "Untitled section";
      currentLevel = level as number;
      nextIsContinuation = false;
    }

    const nodeWords = countNodeWords(node);

    if (
      bucket.length > 0 &&
      !isChunkHeading &&
      bucketWords + nodeWords > TARGET_WORDS_PER_PAGE
    ) {
      flush(nextIsContinuation);
      nextIsContinuation = true;
    }

    bucket.push(node);
    bucketWords += nodeWords;
  }

  flush(nextIsContinuation);

  if (chunks.length === 0) {
    chunks.push({
      index: 0,
      title: "Empty note",
      level: 0,
      document: doc,
      wordCount: 0,
      isContinuation: false,
    });
  }

  return chunks;
}

export function estimateReadingMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.round(wordCount / AVERAGE_READING_WPM));
}

export interface PageOption {
  id: string;
  title: string;
  parentId: string | null;
}

/**
 * Full ancestor label of a page, e.g. "Project / Research / Notes".
 */
export function buildPageLabel(page: PageOption, pages: PageOption[]) {
  const pagesById = new Map(pages.map((candidate) => [candidate.id, candidate]));
  const labels = [page.title];
  const visited = new Set([page.id]);
  let currentParentId = page.parentId;

  while (currentParentId && !visited.has(currentParentId)) {
    const parent = pagesById.get(currentParentId);

    if (!parent) {
      break;
    }

    visited.add(parent.id);
    labels.unshift(parent.title);
    currentParentId = parent.parentId;
  }

  return labels.join(" / ");
}

/**
 * Pages that may become the parent of `pageId`: everything except the page
 * itself and its own descendants, which would create a cycle.
 */
export function selectableParentPages(pageId: string, pages: PageOption[]) {
  const childrenByParent = new Map<string, PageOption[]>();

  for (const page of pages) {
    if (!page.parentId) continue;
    const siblings = childrenByParent.get(page.parentId) ?? [];
    siblings.push(page);
    childrenByParent.set(page.parentId, siblings);
  }

  const blocked = new Set([pageId]);
  const frontier = [pageId];

  while (frontier.length > 0) {
    const currentId = frontier.pop() as string;

    for (const child of childrenByParent.get(currentId) ?? []) {
      if (blocked.has(child.id)) continue;
      blocked.add(child.id);
      frontier.push(child.id);
    }
  }

  return pages.filter((page) => !blocked.has(page.id));
}

export function extractHeadings(doc: TiptapDocument): TocHeading[] {
  const headings: TocHeading[] = [];
  for (const node of doc.content) {
    if (node.type === "heading" && node.content) {
      const level =
        typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      const text = node.content
        .filter((n): n is { type: "text"; text: string } => n.type === "text")
        .map((n) => n.text)
        .join("");
      const blockId =
        typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
      if (text.trim()) {
        headings.push({ level, text, blockId });
      }
    }
  }
  return headings;
}
