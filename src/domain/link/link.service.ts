"use server";

import { db } from "@/lib/db";
import { extractWikilinksFromContent } from "./wikilink.parser";
import type {
  BacklinkResult,
  GraphProjection,
  UnresolvedLink,
} from "./link.types";

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

  await db.link.deleteMany({ where: { sourceNoteId: noteId } });

  const linksToCreate: {
    sourceNoteId: string;
    sourceBlockId: string;
    targetRaw: string;
    linkType: string;
  }[] = [];

  for (const block of blocks) {
    const content = block.content as Record<string, unknown>;
    const wikilinks = extractWikilinksFromContent(content);

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
 * Get all unresolved links across the workspace.
 * These are wikilinks that don't match any existing note title.
 */
export async function getUnresolvedLinks(
  userId: string
): Promise<UnresolvedLink[]> {
  const unresolvedLinks = await db.link.findMany({
    where: {
      targetNoteId: null,
      sourceNote: { userId },
    },
    select: { targetRaw: true, sourceNoteId: true },
  });

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

export async function getGraphProjection(
  userId: string
): Promise<GraphProjection> {
  const [notes, links] = await Promise.all([
    db.note.findMany({
      where: {
        userId,
        isArchived: false,
      },
      select: {
        id: true,
        title: true,
        icon: true,
        isPublished: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    db.link.findMany({
      where: {
        sourceNote: {
          userId,
          isArchived: false,
        },
        targetNoteId: {
          not: null,
        },
      },
      select: {
        sourceNoteId: true,
        targetNoteId: true,
        targetRaw: true,
      },
    }),
  ]);

  const degreeByNoteId = new Map<string, number>();

  for (const link of links) {
    degreeByNoteId.set(
      link.sourceNoteId,
      (degreeByNoteId.get(link.sourceNoteId) ?? 0) + 1
    );

    if (link.targetNoteId) {
      degreeByNoteId.set(
        link.targetNoteId,
        (degreeByNoteId.get(link.targetNoteId) ?? 0) + 1
      );
    }
  }

  return {
    nodes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      icon: note.icon,
      degree: degreeByNoteId.get(note.id) ?? 0,
      isPublished: note.isPublished,
    })),
    edges: links
      .filter((link) => typeof link.targetNoteId === "string")
      .map((link) => ({
        source: link.sourceNoteId,
        target: link.targetNoteId as string,
        label: link.targetRaw,
      })),
  };
}
