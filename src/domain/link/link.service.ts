"use server";

import { db } from "@/lib/db";
import { isRecord } from "@giraffle/domain";
import { extractWikilinksFromContent } from "@giraffle/domain";
import type { BacklinkResult } from "@giraffle/domain";

/**
 * Extract links from a note's blocks and persist them.
 * Called on every note save to keep the link index up to date.
 * Replaces all existing links for the note (full reindex per save).
 */
export async function extractAndSaveLinks(
  userId: string,
  noteId: string
): Promise<void> {
  const blocks = await db.block.findMany({
    where: {
      noteId,
      note: {
        userId,
      },
    },
    select: { id: true, content: true },
  });

  // Keep non-editor links (e.g. Savanna-created links) intact.
  // The editor re-index should only replace wikilink-derived rows.
  await db.link.deleteMany({ where: { sourceNoteId: noteId, linkType: "wikilink" } });

  const linksToCreate: {
    sourceNoteId: string;
    sourceBlockId: string;
    targetRaw: string;
    linkType: string;
  }[] = [];

  for (const block of blocks) {
    if (!isRecord(block.content)) continue;
    const wikilinks = extractWikilinksFromContent(block.content);

    for (const wikilink of wikilinks) {
      const exists = linksToCreate.some(
        (link) =>
          link.sourceBlockId === block.id && link.targetRaw === wikilink.target
      );

      if (!exists) {
        linksToCreate.push({
          sourceNoteId: noteId,
          sourceBlockId: block.id,
          targetRaw: wikilink.target,
          linkType: "wikilink",
        });
      }
    }
  }

  if (linksToCreate.length === 0) {
    return;
  }

  const targetNames = [...new Set(linksToCreate.map((link) => link.targetRaw))];

  const matchingNotes = await db.note.findMany({
    where: {
      userId,
      title: { in: targetNames, mode: "insensitive" },
      isArchived: false,
      boardTaskSource: null,
    },
    select: { id: true, title: true },
  });

  const titleToId = new Map<string, string>();
  for (const note of matchingNotes) {
    titleToId.set(note.title.toLowerCase(), note.id);
  }

  await db.link.createMany({
    data: linksToCreate.map((link) => ({
      ...link,
      targetNoteId: titleToId.get(link.targetRaw.toLowerCase()) ?? null,
    })),
    skipDuplicates: true,
  });
}

/**
 * Get all backlinks pointing to a specific note.
 * Uses the pre-computed link index, not full-text scan.
 */
export async function getBacklinks(
  userId: string,
  noteId: string
): Promise<BacklinkResult[]> {
  const links = await db.link.findMany({
    where: {
      targetNoteId: noteId,
      sourceNote: { userId },
      targetNote: { userId },
    },
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
 * Resolve links after a note is created or renamed.
 * Updates any unresolved links that now match the note title.
 */
export async function resolveLinksForNote(
  userId: string,
  noteId: string,
  noteTitle: string
): Promise<number> {
  const matchingLinks = await db.link.findMany({
    where: {
      targetRaw: { equals: noteTitle, mode: "insensitive" },
      targetNoteId: null,
      sourceNote: { userId },
    },
    select: { id: true },
  });

  if (matchingLinks.length === 0) {
    return 0;
  }

  const result = await db.link.updateMany({
    where: {
      id: {
        in: matchingLinks.map((link) => link.id),
      },
    },
    data: { targetNoteId: noteId },
  });

  return result.count;
}
