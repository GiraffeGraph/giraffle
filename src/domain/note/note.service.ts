"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { extractAndSaveLinks, resolveLinksForNote } from "@/domain/link/link.service";
import { normalizeWikilinkTarget } from "@/domain/link/wikilink.parser";
import { getAllFolders } from "@/domain/folder/folder.service";
import { normalizeNoteCategoryColor } from "@/domain/category/category.types";
import { recordOperation } from "@/domain/sync/operation-log.service";
import { syncNoteTags } from "@/domain/tag/tag.service";
import { slugify } from "@/lib/utils";
import {
  DEFAULT_NOTE_TITLE,
  EISENHOWER_QUADRANTS,
} from "./note.types";
import type {
  EisenhowerQuadrant,
  CreateNoteInput,
  InsertBlockInput,
  NoteReference,
  TiptapDocument,
  UpdateBlockInput,
  UpdateNoteInput,
} from "./note.types";
import {
  createEmptyDocument,
  insertBlockInDocument,
  moveBlockInDocument,
  documentToPersistedBlocks,
  persistedBlocksToDocument,
  removeBlockFromDocument,
  updateBlockInDocument,
} from "./block-tree";

async function assertOwnedNote(noteId: string, userId: string) {
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true, title: true, folderId: true, slug: true, isPinned: true },
  });

  if (!note) {
    throw new Error("Note not found");
  }

  return note;
}

async function assertOwnedFolder(folderId: string, userId: string) {
  const folder = await db.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });

  if (!folder) {
    throw new Error("Folder not found");
  }
}

async function assertOwnedCategory(categoryId: string, userId: string) {
  const category = await db.noteCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });

  if (!category) {
    throw new Error("Category not found");
  }
}

/**
 * Create a new note with optional initial content.
 */
export async function createNote(
  userId: string,
  input: CreateNoteInput = {}
): Promise<string> {
  if (input.folderId) {
    await assertOwnedFolder(input.folderId, userId);
  }

  if (input.categoryId) {
    await assertOwnedCategory(input.categoryId, userId);
  }

  const nextTitle = input.title ?? DEFAULT_NOTE_TITLE;
  let note: {
    id: string;
    title: string;
    folderId: string | null;
    slug: string | null;
  } | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const [slug, nextPosition] = await Promise.all([
      ensureUniqueNoteSlug(nextTitle),
      getNextNotePosition(userId, input.folderId ?? null),
    ]);

    try {
      note = await db.$transaction(async (tx) => {
        const createdNote = await tx.note.create({
          data: {
            title: nextTitle,
            slug,
            icon: input.icon,
            folderId: input.folderId,
            categoryId: input.categoryId,
            templateId: input.templateId,
            position: nextPosition,
            userId,
          },
        });

        await replaceNoteBlocks(tx, createdNote.id, createEmptyDocument());

        return createdNote;
      });
      break;
    } catch (error) {
      if (
        attempt < MAX_SLUG_ATTEMPTS - 1 &&
        isSlugUniqueConstraintError(error)
      ) {
        continue;
      }

      throw error;
    }
  }

  if (!note) {
    throw new Error("Failed to create note with a unique slug");
  }

  if (note.title !== DEFAULT_NOTE_TITLE) {
    await resolveLinksForNote(userId, note.id, note.title);
  }

  await recordOperation({
    userId,
    entityType: "note",
    entityId: note.id,
    actionType: "create",
    payload: {
      title: note.title,
      folderId: note.folderId,
      slug: note.slug,
    },
  });

  return note.id;
}

/**
 * Get a single note with all its blocks.
 */
export async function getNote(userId: string, noteId: string) {
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    include: {
      blocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      tags: {
        include: {
          tag: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
        },
      },
    },
  });

  if (!note) {
    return null;
  }

  return {
    ...note,
    tags: note.tags.map((noteTag) => noteTag.tag.name),
    category: note.category
      ? {
          id: note.category.id,
          name: note.category.name,
          color: normalizeNoteCategoryColor(note.category.color),
          icon: note.category.icon,
        }
      : null,
    document: persistedBlocksToDocument(
      note.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        content: block.content,
        attributes: block.attributes,
        parentId: block.parentId,
        position: block.position,
      }))
    ),
  };
}

/**
 * Get all non-archived notes, ordered by last update.
 */
export async function getNotes(userId: string) {
  const rows = await db.note.findMany({
    where: { userId, isArchived: false },
    orderBy: [{ isPinned: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      icon: true,
      folderId: true,
      position: true,
      isPinned: true,
      quadrant: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    quadrant: (EISENHOWER_QUADRANTS as readonly string[]).includes(row.quadrant ?? "")
      ? (row.quadrant as EisenhowerQuadrant)
      : null,
  }));
}

export async function searchNotesByTitle(
  userId: string,
  query: string,
  limit = 6
): Promise<NoteReference[]> {
  const normalizedQuery = normalizeWikilinkTarget(query);

  const notes = await db.note.findMany({
    where: {
      userId,
      isArchived: false,
      ...(normalizedQuery
        ? {
            title: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: normalizedQuery ? limit * 3 : limit,
    select: {
      id: true,
      title: true,
      slug: true,
      folderId: true,
      updatedAt: true,
    },
  });

  if (!normalizedQuery) {
    return notes;
  }

  const lowerQuery = normalizedQuery.toLowerCase();

  return notes
    .sort((left, right) => {
      const leftTitle = left.title.toLowerCase();
      const rightTitle = right.title.toLowerCase();
      const leftScore = getTitleMatchScore(leftTitle, lowerQuery);
      const rightScore = getTitleMatchScore(rightTitle, lowerQuery);

      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    })
    .slice(0, limit);
}

export async function findNoteByTitle(
  userId: string,
  title: string
): Promise<NoteReference | null> {
  const normalizedTitle = normalizeWikilinkTarget(title);

  if (!normalizedTitle) {
    return null;
  }

  return db.note.findFirst({
    where: {
      userId,
      isArchived: false,
      title: {
        equals: normalizedTitle,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      folderId: true,
    },
  });
}

/**
 * Update note metadata (title, icon, etc).
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput
): Promise<void> {
  const oldNote = await assertOwnedNote(noteId, userId);

  if (typeof input.folderId === "string") {
    await assertOwnedFolder(input.folderId, userId);
  }

  if (typeof input.categoryId === "string") {
    await assertOwnedCategory(input.categoryId, userId);
  }

  const needsSlugGeneration =
    (typeof input.title === "string" && input.title.trim().length > 0) ||
    typeof input.slug === "string" ||
    Boolean(input.isPublished);
  const shouldRecalculatePosition =
    Object.prototype.hasOwnProperty.call(input, "folderId") &&
    input.folderId !== oldNote.folderId &&
    typeof input.position !== "number";

  let updateData: UpdateNoteInput | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    updateData = { ...input };

    if (typeof input.title === "string" && input.title.trim()) {
      updateData.slug = await ensureUniqueNoteSlug(
        input.title,
        noteId,
        input.slug ?? oldNote.slug ?? undefined
      );
    } else if (typeof input.slug === "string") {
      updateData.slug = await ensureUniqueNoteSlug(input.slug, noteId);
    }

    if (shouldRecalculatePosition) {
      updateData.position = await getNextNotePosition(
        userId,
        input.folderId ?? null
      );
    }

    if (input.isPublished && !updateData.slug) {
      updateData.slug = await ensureUniqueNoteSlug(
        input.title ?? oldNote.title,
        noteId,
        oldNote.slug ?? undefined
      );
    }

    try {
      await db.note.update({
        where: { id: noteId },
        data: updateData,
      });
      break;
    } catch (error) {
      if (
        needsSlugGeneration &&
        attempt < MAX_SLUG_ATTEMPTS - 1 &&
        isSlugUniqueConstraintError(error)
      ) {
        continue;
      }

      throw error;
    }
  }

  if (!updateData) {
    throw new Error("Failed to update note");
  }

  if (input.title && input.title !== oldNote.title) {
    await resolveLinksForNote(userId, noteId, input.title);
  }

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "update",
    payload: updateData,
  });
}

/**
 * Save the full block content for a note from the editor.
 * Applies block-level mutations derived from the canonical document.
 * Also triggers link extraction.
 */
export async function saveNoteContent(
  userId: string,
  noteId: string,
  document: TiptapDocument
): Promise<void> {
  await assertOwnedNote(noteId, userId);

  const blockChanges = await db.$transaction(async (tx) => {
    const changes = await replaceNoteBlocks(tx, noteId, document);

    if (!changes.hasChanges) {
      return changes;
    }

    await tx.note.update({
      where: { id: noteId },
      data: { updatedAt: new Date() },
    });

    return changes;
  });

  if (!blockChanges.hasChanges) {
    return;
  }

  await Promise.all([
    extractAndSaveLinks(userId, noteId),
    syncNoteTags(userId, noteId, document),
  ]);

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "save-content",
    payload: {
      blockCount: document.content.length,
    },
  });
}

/**
 * Get all archived notes for a user.
 */
export async function getArchivedNotes(userId: string) {
  return db.note.findMany({
    where: { userId, isArchived: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      icon: true,
      folderId: true,
      updatedAt: true,
    },
  });
}

/**
 * Archive a note (soft delete).
 */
export async function archiveNote(
  userId: string,
  noteId: string
): Promise<void> {
  await assertOwnedNote(noteId, userId);

  await db.note.update({
    where: { id: noteId },
    data: { isArchived: true },
  });

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "archive",
  });
}

/**
 * Restore an archived note.
 */
export async function restoreNote(
  userId: string,
  noteId: string
): Promise<void> {
  await assertOwnedNote(noteId, userId);

  await db.note.update({
    where: { id: noteId },
    data: { isArchived: false },
  });

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "restore",
  });
}

/**
 * Permanently delete a note and all associated data.
 */
export async function deleteNote(
  userId: string,
  noteId: string
): Promise<void> {
  await assertOwnedNote(noteId, userId);
  await db.note.delete({ where: { id: noteId } });

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "delete",
  });
}

export async function getPublicNote(noteId: string) {
  const note = await db.note.findFirst({
    where: {
      id: noteId,
      isPublished: true,
      isArchived: false,
    },
    include: {
      blocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      tags: {
        include: {
          tag: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
        },
      },
    },
  });

  if (!note) {
    return null;
  }

  return {
    ...note,
    tags: note.tags.map((noteTag) => noteTag.tag.name),
    category: note.category
      ? {
          id: note.category.id,
          name: note.category.name,
          color: normalizeNoteCategoryColor(note.category.color),
          icon: note.category.icon,
        }
      : null,
    document: persistedBlocksToDocument(
      note.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        content: block.content,
        attributes: block.attributes,
        parentId: block.parentId,
        position: block.position,
      }))
    ),
  };
}

export async function getPublicNoteBySlug(slug: string) {
  return db.note.findFirst({
    where: {
      slug,
      isPublished: true,
      isArchived: false,
    },
    include: {
      blocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      tags: {
        include: {
          tag: true,
        },
      },
      folder: {
        select: {
          id: true,
          name: true,
          parentId: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
        },
      },
    },
  }).then((note) => {
    if (!note) {
      return null;
    }

    return {
      ...note,
      tags: note.tags.map((noteTag) => noteTag.tag.name),
      category: note.category
        ? {
            id: note.category.id,
            name: note.category.name,
            color: normalizeNoteCategoryColor(note.category.color),
            icon: note.category.icon,
          }
        : null,
      document: persistedBlocksToDocument(
        note.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          content: block.content,
          attributes: block.attributes,
          parentId: block.parentId,
          position: block.position,
        }))
      ),
    };
  });
}

export async function getNoteForExport(userId: string, noteId: string) {
  const note = await getNote(userId, noteId);

  if (!note) {
    return null;
  }

  const folders = await getAllFolders(userId);

  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    icon: note.icon,
    folderPath: buildFolderPath(folders, note.folderId),
    isPublished: note.isPublished,
    updatedAt: note.updatedAt,
    document: note.document,
    tags: note.tags ?? [],
  };
}

export async function getPublishedNotesForExport(userId: string) {
  const [notes, folders] = await Promise.all([
    db.note.findMany({
      where: {
        userId,
        isArchived: false,
        isPublished: true,
      },
      include: {
        blocks: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    }),
    getAllFolders(userId),
  ]);

  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    slug: note.slug,
    icon: note.icon,
    folderPath: buildFolderPath(folders, note.folderId),
    isPublished: note.isPublished,
    updatedAt: note.updatedAt,
    tags: note.tags.map((noteTag) => noteTag.tag.name),
    document: persistedBlocksToDocument(
      note.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        content: block.content,
        attributes: block.attributes,
        parentId: block.parentId,
        position: block.position,
      }))
    ),
  }));
}

export async function insertBlock(
  userId: string,
  noteId: string,
  input: InsertBlockInput
): Promise<TiptapDocument> {
  const note = await getOwnedNoteDocument(userId, noteId);
  const document = insertBlockInDocument(note.document, input.block, input);
  await saveNoteContent(userId, noteId, document);
  return document;
}

export async function updateBlock(
  userId: string,
  noteId: string,
  blockId: string,
  input: UpdateBlockInput
): Promise<TiptapDocument> {
  const note = await getOwnedNoteDocument(userId, noteId);
  const document = updateBlockInDocument(note.document, blockId, input);
  await saveNoteContent(userId, noteId, document);
  return document;
}

export async function moveBlock(
  userId: string,
  noteId: string,
  blockId: string,
  placement: {
    parentBlockId?: string | null;
    afterBlockId?: string | null;
  }
): Promise<TiptapDocument> {
  const note = await getOwnedNoteDocument(userId, noteId);
  const document = moveBlockInDocument(note.document, blockId, placement);
  await saveNoteContent(userId, noteId, document);
  return document;
}

export async function deleteBlock(
  userId: string,
  noteId: string,
  blockId: string
): Promise<TiptapDocument> {
  const note = await getOwnedNoteDocument(userId, noteId);
  const result = removeBlockFromDocument(note.document, blockId);

  if (!result.removedBlock) {
    throw new Error(`Block not found: ${blockId}`);
  }

  const nextDocument =
    result.document.content.length > 0 ? result.document : createEmptyDocument();

  await saveNoteContent(userId, noteId, nextDocument);
  return nextDocument;
}

export async function moveNote(
  userId: string,
  noteId: string,
  direction: "up" | "down"
): Promise<void> {
  await db.$transaction(async (tx) => {
    const note = await tx.note.findFirst({
      where: {
        id: noteId,
        userId,
        isArchived: false,
      },
      select: {
        id: true,
        folderId: true,
      },
    });

    if (!note) {
      throw new Error("Note not found");
    }

    const siblings = await tx.note.findMany({
      where: {
        userId,
        folderId: note.folderId,
        isArchived: false,
      },
      orderBy: [
        { isPinned: "desc" },
        { position: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        isPinned: true,
      },
    });

    const currentIndex = siblings.findIndex((candidate) => candidate.id === noteId);

    if (currentIndex === -1) {
      throw new Error("Note not found");
    }

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }

    const currentNote = siblings[currentIndex];
    const targetNote = siblings[targetIndex];

    if (!currentNote || !targetNote || currentNote.isPinned !== targetNote.isPinned) {
      return;
    }

    const reorderedNotes = [...siblings];
    const [removedNote] = reorderedNotes.splice(currentIndex, 1);
    reorderedNotes.splice(targetIndex, 0, removedNote);

    let nextPosition = 0;

    for (const sibling of reorderedNotes) {
      if (sibling.isPinned !== currentNote.isPinned) {
        continue;
      }

      await tx.note.update({
        where: { id: sibling.id },
        data: {
          position: nextPosition,
        },
      });

      nextPosition += 1;
    }
  });

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: `move-${direction}`,
  });
}

export async function relocateNote(
  userId: string,
  noteId: string,
  placement: {
    folderId?: string | null;
    afterNoteId?: string | null;
  }
): Promise<void> {
  await db.$transaction(async (tx) => {
    const note = await tx.note.findFirst({
      where: {
        id: noteId,
        userId,
        isArchived: false,
      },
      select: {
        id: true,
        folderId: true,
        isPinned: true,
      },
    });

    if (!note) {
      throw new Error("Note not found");
    }

    if (typeof placement.folderId === "string") {
      await assertOwnedFolder(placement.folderId, userId);
    }

    const targetNote =
      typeof placement.afterNoteId === "string"
        ? await tx.note.findFirst({
            where: {
              id: placement.afterNoteId,
              userId,
              isArchived: false,
            },
            select: {
              id: true,
              folderId: true,
              isPinned: true,
            },
          })
        : null;

    if (placement.afterNoteId && !targetNote) {
      throw new Error("Target note not found");
    }

    if (targetNote?.id === note.id) {
      return;
    }

    const destinationFolderId =
      targetNote?.folderId ??
      (Object.prototype.hasOwnProperty.call(placement, "folderId")
        ? placement.folderId ?? null
        : note.folderId);

    const currentSiblings = await tx.note.findMany({
      where: {
        userId,
        folderId: note.folderId,
        isArchived: false,
        isPinned: note.isPinned,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
      },
    });

    const currentSiblingIds = currentSiblings
      .map((sibling) => sibling.id)
      .filter((siblingId) => siblingId !== note.id);

    const destinationSiblings =
      destinationFolderId === note.folderId
        ? currentSiblingIds
        : (
            await tx.note.findMany({
              where: {
                userId,
                folderId: destinationFolderId,
                isArchived: false,
                isPinned: note.isPinned,
              },
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
              },
            })
          ).map((sibling) => sibling.id);

    const insertIndex =
      targetNote != null
        ? destinationSiblings.findIndex((siblingId) => siblingId === targetNote.id) + 1
        : destinationSiblings.length;

    const nextDestinationIds = [...destinationSiblings];
    nextDestinationIds.splice(insertIndex, 0, note.id);

    if (destinationFolderId !== note.folderId) {
      for (const [index, siblingId] of currentSiblingIds.entries()) {
        await tx.note.update({
          where: { id: siblingId },
          data: {
            position: index,
          },
        });
      }
    }

    for (const [index, siblingId] of nextDestinationIds.entries()) {
      await tx.note.update({
        where: { id: siblingId },
        data: {
          folderId: siblingId === note.id ? destinationFolderId : undefined,
          position: index,
        },
      });
    }
  });

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "relocate",
    payload: placement,
  });
}

type NoteMutationClient = Pick<Prisma.TransactionClient, "block" | "note">;

interface BlockMutationSummary {
  created: number;
  updated: number;
  deleted: number;
  hasChanges: boolean;
}

interface ExistingPersistedBlock {
  id: string;
  type: string;
  content: unknown;
  attributes: unknown;
  parentId: string | null;
  position: number;
}

async function replaceNoteBlocks(
  client: NoteMutationClient,
  noteId: string,
  document: TiptapDocument
) {
  const [persistedBlocks, existingBlocks] = await Promise.all([
    Promise.resolve(documentToPersistedBlocks(noteId, document)),
    client.block.findMany({
      where: { noteId },
      select: {
        id: true,
        type: true,
        content: true,
        attributes: true,
        parentId: true,
        position: true,
      },
    }),
  ]);

  const existingById = new Map(existingBlocks.map((block) => [block.id, block]));
  const incomingById = new Map(persistedBlocks.map((block) => [block.id, block]));

  const blocksToCreate = persistedBlocks.filter(
    (block) => !existingById.has(block.id)
  );
  const blocksToUpdate = persistedBlocks.filter((block) => {
    const existingBlock = existingById.get(block.id);

    return existingBlock ? hasBlockChanged(existingBlock, block) : false;
  });
  const blockIdsToDelete = existingBlocks
    .filter((block) => !incomingById.has(block.id))
    .map((block) => block.id);

  if (
    blocksToCreate.length === 0 &&
    blocksToUpdate.length === 0 &&
    blockIdsToDelete.length === 0
  ) {
    return {
      created: 0,
      updated: 0,
      deleted: 0,
      hasChanges: false,
    } satisfies BlockMutationSummary;
  }

  if (blocksToCreate.length > 0) {
    const blocksByDepth = groupBlocksByDepth(blocksToCreate);

    for (const depth of Array.from(blocksByDepth.keys()).sort((a, b) => a - b)) {
      const blocksAtDepth = blocksByDepth.get(depth) ?? [];

      await client.block.createMany({
        data: blocksAtDepth.map((block) => ({
          id: block.id,
          noteId: block.noteId,
          type: block.type,
          content: block.content as Prisma.InputJsonValue,
          attributes: block.attributes as Prisma.InputJsonValue,
          parentId: block.parentId,
          position: block.position,
        })),
      });
    }
  }

  const sortedBlocksToUpdate = [...blocksToUpdate].sort(
    (left, right) => left.depth - right.depth || left.position - right.position
  );

  for (const block of sortedBlocksToUpdate) {
    await client.block.update({
      where: { id: block.id },
      data: {
        type: block.type,
        content: block.content as Prisma.InputJsonValue,
        attributes: block.attributes as Prisma.InputJsonValue,
        parentId: block.parentId,
        position: block.position,
      },
    });
  }

  if (blockIdsToDelete.length > 0) {
    await client.block.deleteMany({
      where: {
        id: {
          in: blockIdsToDelete,
        },
      },
    });
  }

  return {
    created: blocksToCreate.length,
    updated: blocksToUpdate.length,
    deleted: blockIdsToDelete.length,
    hasChanges: true,
  } satisfies BlockMutationSummary;
}

function groupBlocksByDepth(
  blocks: ReturnType<typeof documentToPersistedBlocks>
) {
  const blocksByDepth = new Map<number, typeof blocks>();

  for (const block of blocks) {
    const siblings = blocksByDepth.get(block.depth) ?? [];
    siblings.push(block);
    blocksByDepth.set(block.depth, siblings);
  }

  return blocksByDepth;
}

function hasBlockChanged(
  existingBlock: ExistingPersistedBlock,
  nextBlock: ReturnType<typeof documentToPersistedBlocks>[number]
) {
  return (
    existingBlock.type !== nextBlock.type ||
    existingBlock.parentId !== nextBlock.parentId ||
    existingBlock.position !== nextBlock.position ||
    toComparableJson(existingBlock.content) !== toComparableJson(nextBlock.content) ||
    toComparableJson(existingBlock.attributes) !==
      toComparableJson(nextBlock.attributes)
  );
}

function toComparableJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalizeJsonValue(
          (value as Record<string, unknown>)[key]
        );
        return result;
      }, {});
  }

  return value ?? null;
}

function getTitleMatchScore(title: string, query: string) {
  if (title === query) {
    return 0;
  }

  if (title.startsWith(query)) {
    return 1;
  }

  if (title.includes(` ${query}`)) {
    return 2;
  }

  return 3;
}

async function getOwnedNoteDocument(userId: string, noteId: string) {
  const note = await getNote(userId, noteId);

  if (!note) {
    throw new Error("Note not found");
  }

  return note;
}

async function ensureUniqueNoteSlug(
  input: string,
  noteIdToExclude?: string,
  preferredSlug?: string
) {
  const baseSlug =
    slugify(preferredSlug ?? input) || slugify(DEFAULT_NOTE_TITLE) || "note";
  let candidateSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const existingNote = await db.note.findFirst({
      where: {
        slug: candidateSlug,
        ...(noteIdToExclude ? { id: { not: noteIdToExclude } } : {}),
      },
      select: { id: true },
    });

    if (!existingNote) {
      return candidateSlug;
    }

    candidateSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function isSlugUniqueConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("slug");
  }

  return target === "slug";
}

const MAX_SLUG_ATTEMPTS = 5;

async function getNextNotePosition(userId: string, folderId: string | null) {
  const lastNote = await db.note.findFirst({
    where: {
      userId,
      folderId,
      isArchived: false,
    },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: {
      position: true,
    },
  });

  return typeof lastNote?.position === "number" ? lastNote.position + 1 : 0;
}

// ─── Tower Matrix ─────────────────────────────────────────────

function extractBlockText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const node = content as Record<string, unknown>;
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    return (node.content as unknown[]).map(extractBlockText).join("");
  }
  return "";
}

/**
 * Get all non-archived notes enriched with todo summary for the Tower Matrix.
 */
export async function getNotesWithTodoSummary(userId: string) {
  const rows = await db.note.findMany({
    where: { userId, isArchived: false },
    orderBy: [{ isPinned: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      icon: true,
      quadrant: true,
      blocks: {
        where: { type: "taskItem" },
        select: { id: true, attributes: true },
      },
    },
  });

  return rows.map((row) => {
    const todos = row.blocks.map((b) => {
      const attrs = (b.attributes ?? {}) as Record<string, unknown>;
      return {
        checked: attrs.checked === true,
        quadrant: (EISENHOWER_QUADRANTS as readonly string[]).includes(String(attrs.quadrant ?? ""))
          ? (attrs.quadrant as EisenhowerQuadrant)
          : null,
      };
    });

    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      quadrant: (EISENHOWER_QUADRANTS as readonly string[]).includes(row.quadrant ?? "")
        ? (row.quadrant as EisenhowerQuadrant)
        : null,
      todoTotal: todos.length,
      todoCompleted: todos.filter((t) => t.checked).length,
      todoByQuadrant: Object.fromEntries(
        EISENHOWER_QUADRANTS.map((q) => [q, todos.filter((t) => t.quadrant === q).length])
      ) as Record<EisenhowerQuadrant, number>,
    };
  });
}

/**
 * Get taskItem blocks for a note (used in the Tower Matrix inner panel).
 */
export async function getNoteTodoBlocks(userId: string, noteId: string) {
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    select: {
      blocks: {
        where: { type: "taskItem" },
        select: { id: true, content: true, attributes: true, position: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!note) return [];

  return note.blocks.map((b) => {
    const attrs = (b.attributes ?? {}) as Record<string, unknown>;
    return {
      id: b.id,
      text: extractBlockText(b.content),
      checked: attrs.checked === true,
      quadrant: (EISENHOWER_QUADRANTS as readonly string[]).includes(String(attrs.quadrant ?? ""))
        ? (attrs.quadrant as EisenhowerQuadrant)
        : null,
      position: b.position,
    };
  });
}

/**
 * Set the quadrant of a taskItem block (Tower Matrix inner matrix).
 */
export async function setTodoBlockQuadrant(
  userId: string,
  blockId: string,
  quadrant: EisenhowerQuadrant | null
): Promise<void> {
  const block = await db.block.findFirst({
    where: { id: blockId, note: { userId } },
    select: { attributes: true },
  });
  if (!block) throw new Error("Block not found");
  const attrs = (block.attributes ?? {}) as Record<string, unknown>;
  await db.block.update({
    where: { id: blockId },
    data: { attributes: { ...attrs, quadrant } },
  });
}

/**
 * Toggle the checked state of a taskItem block.
 */
export async function toggleTodoBlock(
  userId: string,
  blockId: string,
  checked: boolean
): Promise<void> {
  const block = await db.block.findFirst({
    where: { id: blockId, note: { userId } },
    select: { attributes: true },
  });
  if (!block) throw new Error("Block not found");
  const attrs = (block.attributes ?? {}) as Record<string, unknown>;
  await db.block.update({
    where: { id: blockId },
    data: { attributes: { ...attrs, checked } },
  });
}

function buildFolderPath(
  folders: Awaited<ReturnType<typeof getAllFolders>>,
  folderId: string | null
) {
  if (!folderId) {
    return [];
  }

  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const folder = foldersById.get(currentId);

    if (!folder) {
      break;
    }

    path.unshift(folder.name);
    currentId = folder.parentId;
  }

  return path;
}
