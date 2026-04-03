// ─── Link Types ───────────────────────────────────────────────
export const LINK_TYPES = ["wikilink", "url", "tag"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export interface Link {
  id: string;
  sourceNoteId: string;
  sourceBlockId: string | null;
  targetRaw: string;
  targetNoteId: string | null;
  linkType: LinkType;
  createdAt: Date;
}

export interface WikilinkMatch {
  raw: string;            // full match including [[ ]]
  target: string;         // normalized note name
  displayText: string;    // alias after | or same as target
  startIndex: number;
  endIndex: number;
}

export interface BacklinkResult {
  sourceNoteId: string;
  sourceNoteTitle: string;
  sourceBlockId: string | null;
  targetRaw: string;
  linkType: LinkType;
}

export interface UnresolvedLink {
  targetRaw: string;
  sourceNoteIds: string[];
  count: number;
}
