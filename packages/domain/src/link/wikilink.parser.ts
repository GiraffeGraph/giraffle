import { isRecord } from "../utils";
import type { WikilinkMatch } from "./link.types";

// Matches [[Target]] or [[Target|Display Text]]
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Parse all wikilinks from a text string.
 * Returns structured match objects with position info.
 */
export function parseWikilinks(text: string): WikilinkMatch[] {
  const matches: WikilinkMatch[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  WIKILINK_REGEX.lastIndex = 0;

  while ((match = WIKILINK_REGEX.exec(text)) !== null) {
    const target = (match[1] ?? "").trim();
    const displayText = match[2]?.trim() || target;

    matches.push({
      raw: match[0],
      target: normalizeWikilinkTarget(target),
      displayText,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}

/**
 * Normalize a wikilink target for consistent matching.
 * - Trims whitespace
 * - Collapses multiple spaces
 * - Preserves original casing (case-insensitive matching done at query time)
 */
export function normalizeWikilinkTarget(target: string): string {
  return target.trim().replace(/\s+/g, " ");
}

/**
 * Extract all wikilink targets from a Tiptap JSON document.
 * Recursively walks the content tree to find all text with wikilink marks
 * or raw [[...]] syntax in text nodes.
 */
export function extractWikilinksFromContent(
  content: Record<string, unknown>
): WikilinkMatch[] {
  const allMatches: WikilinkMatch[] = [];

  function walk(node: Record<string, unknown>) {
    // Check text nodes for raw wikilink syntax
    if (node.type === "text" && typeof node.text === "string") {
      const matches = parseWikilinks(node.text);
      allMatches.push(...matches);
    }

    // Check for wikilink marks on text nodes
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (
          mark.type === "wikilink" &&
          mark.attrs &&
          typeof mark.attrs.target === "string"
        ) {
          allMatches.push({
            raw: `[[${mark.attrs.target}]]`,
            target: normalizeWikilinkTarget(mark.attrs.target),
            displayText: (mark.attrs.displayText as string) || mark.attrs.target,
            startIndex: 0,
            endIndex: 0,
          });
        }
      }
    }

    // Recurse into children
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        if (isRecord(child)) walk(child);
      }
    }
  }

  walk(content);
  return allMatches;
}

/**
 * Check if a string contains any wikilinks.
 */
export function containsWikilinks(text: string): boolean {
  WIKILINK_REGEX.lastIndex = 0;
  return WIKILINK_REGEX.test(text);
}
