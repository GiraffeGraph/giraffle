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

