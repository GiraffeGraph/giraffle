"use server";

import { db } from "@/lib/db";
import { extractWikilinksFromContent } from "./wikilink.parser";
import type { BacklinkResult, UnresolvedLink } from "./link.types";

/**
 * Extract links from a note's blocks and persist them.
 * Called on every note save to keep the link index up to date.
 * Replaces all existing links for the note (full reindex per save).
 */
export async function extractAndSaveLinks(noteId: string): Promise<void> {
  // Get all blocks for this note
  const blocks = await db.block.findMany({
    where: { noteId },
    select: { id: true, content: true },
  });

  // Delete existing links for this note
  await db.link.deleteMany({ where: { sourceNoteId: noteId } });

  // Extract wikilinks from each block
  const linksToCreate: {
    sourceNoteId: string;
    sourceBlockId: string;
    targetRaw: string;
    linkType: string;
  }[] = [];

  for (const block of blocks) {
    const content = block.content as Record<string, unknown>;
    const wikilinks = extractWikilinksFromContent(content);

    for (const wl of wikilinks) {
      // Deduplicate within same block
      const exists = linksToCreate.some(
        (l) => l.sourceBlockId === block.id && l.targetRaw === wl.target
      );
      if (!exists) {
        linksToCreate.push({
          sourceNoteId: noteId,
          sourceBlockId: block.id,
          targetRaw: wl.target,
          linkType: "wikilink",
        });
      }
    }
  }

  // Try to resolve targets to existing note IDs
  if (linksToCreate.length > 0) {
    const targetNames = [...new Set(linksToCreate.map((l) => l.targetRaw))];

    const matchingNotes = await db.note.findMany({
      where: {
        title: { in: targetNames, mode: "insensitive" },
        isArchived: false,
      },
      select: { id: true, title: true },
    });

    const titleToId = new Map<string, string>();
    for (const note of matchingNotes) {
      titleToId.set(note.title.toLowerCase(), note.id);
    }

    await db.link.createMany({
      data: linksToCreate.map((l) => ({
        ...l,
        targetNoteId: titleToId.get(l.targetRaw.toLowerCase()) ?? null,
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * Get all backlinks pointing to a specific note.
 * Uses the pre-computed link index, not full-text scan.
 */
export async function getBacklinks(noteId: string): Promise<BacklinkResult[]> {
  const links = await db.link.findMany({
    where: { targetNoteId: noteId },
    include: {
      sourceNote: { select: { id: true, title: true } },
    },
  });

  return links.map((link) => ({
    sourceNoteId: link.sourceNoteId,
    sourceNoteTitle: link.sourceNote.title,
    sourceBlockId: link.sourceBlockId,
    targetRaw: link.targetRaw,
    linkType: link.linkType as BacklinkResult["linkType"],
  }));
}

/**
 * Get all unresolved links across the workspace.
 * These are wikilinks that don't match any existing note title.
 */
export async function getUnresolvedLinks(): Promise<UnresolvedLink[]> {
  const unresolvedLinks = await db.link.findMany({
    where: { targetNoteId: null },
    select: { targetRaw: true, sourceNoteId: true },
  });

  // Group by target
  const grouped = new Map<string, Set<string>>();
  for (const link of unresolvedLinks) {
    const existing = grouped.get(link.targetRaw) ?? new Set();
    existing.add(link.sourceNoteId);
    grouped.set(link.targetRaw, existing);
  }

  return Array.from(grouped.entries()).map(([targetRaw, sourceNoteIds]) => ({
    targetRaw,
    sourceNoteIds: Array.from(sourceNoteIds),
    count: sourceNoteIds.size,
  }));
}

/**
 * Resolve links after a note is created or renamed.
 * Updates any unresolved links that now match the note title.
 */
export async function resolveLinksForNote(
  noteId: string,
  noteTitle: string
): Promise<number> {
  const result = await db.link.updateMany({
    where: {
      targetRaw: { equals: noteTitle, mode: "insensitive" },
      targetNoteId: null,
    },
    data: { targetNoteId: noteId },
  });

  return result.count;
}
