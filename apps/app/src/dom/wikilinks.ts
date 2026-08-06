import { parseWikilinks } from "@giraffle/domain";

export interface WikilinkRange {
  from: number;
  to: number;
  target: string;
}

/**
 * Where `[[Target]]` sits inside one text node. The brackets stay in the text:
 * the vault rebuilds backlinks by running `parseWikilinks` over the document's
 * plain text, so rewriting them into a mark would break every backlink.
 */
export function wikilinkRanges(text: string): WikilinkRange[] {
  return parseWikilinks(text)
    .filter((match) => match.target.length > 0)
    .map((match) => ({
      from: match.startIndex,
      to: match.endIndex,
      target: match.target,
    }));
}
