"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { extractAndSaveLinks, resolveLinksForNote } from "@/domain/link/link.service";
import { normalizeWikilinkTarget } from "@/domain/link/wikilink.parser";
import { getAllFolders } from "@/domain/folder/folder.service";
import { syncNoteTags } from "@/domain/tag/tag.service";
import {
  DEFAULT_NOTE_TITLE,
} from "./note.types";
import type {
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
    select: { id: true, title: true },
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

  const note = await db.$transaction(async (tx) => {
    const createdNote = await tx.note.create({
      data: {
        title: input.title ?? DEFAULT_NOTE_TITLE,
        icon: input.icon,
        folderId: input.folderId,
        templateId: input.templateId,
        userId,
      },
    });

    await replaceNoteBlocks(tx, createdNote.id, createEmptyDocument());

    return createdNote;
  });

  if (note.title !== DEFAULT_NOTE_TITLE) {
    await resolveLinksForNote(userId, note.id, note.title);
  }

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
    },
  });

  if (!note) {
    return null;
  }

  return {
    ...note,
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
  };
}

/**
 * Get all non-archived notes, ordered by last update.
 */
export async function getNotes(userId: string) {
  return db.note.findMany({
    where: { userId, isArchived: false },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      icon: true,
      folderId: true,
      updatedAt: true,
      createdAt: true,
    },
  });
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

  await db.note.update({
    where: { id: noteId },
    data: input,
  });

  if (input.title && input.title !== oldNote.title) {
    await resolveLinksForNote(userId, noteId, input.title);
  }
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
    },
  });

  if (!note) {
    return null;
  }

  return {
    ...note,
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
  };
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
