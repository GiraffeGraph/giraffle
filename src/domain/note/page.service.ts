"use server";

import { Prisma } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/lib/db";
import { extractAndSaveLinks, resolveLinksForNote } from "@/domain/link/link.service";
import { normalizeWikilinkTarget } from "@/domain/link/wikilink.parser";
import { recordOperation } from "@/domain/sync/operation-log.service";
import { isRecord } from "@/lib/utils";
import {
  DEFAULT_NOTE_TITLE,
  EISENHOWER_QUADRANTS,
  MATRIX_SLOTS,
} from "./note.types";
import type {
  MatrixSlot,
  CreateNoteInput,
  InsertBlockInput,
  NoteReference,
  PageBreadcrumb,
  PageTreeNode,
  TiptapDocument,
  UpdateNoteInput,
} from "./note.types";
import {
  createEmptyDocument,
  insertBlockInDocument,
  documentToPersistedBlocks,
  persistedBlocksToDocument,
} from "./block-tree";
import { blocksToMarkdown } from "./note.serializer";

const SEARCH_TEXT_MAX_LENGTH = 50_000;

function deriveSearchText(document: TiptapDocument): string {
  try {
    return blocksToMarkdown(document).slice(0, SEARCH_TEXT_MAX_LENGTH);
  } catch {
    return "";
  }
}

async function assertOwnedNote(noteId: string, userId: string) {
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true, title: true, parentId: true, isPinned: true },
  });

  if (!note) {
    throw new Error("Note not found");
  }

  return note;
}

async function assertOwnedParent(parentId: string, userId: string) {
  const parent = await db.note.findFirst({
    where: { id: parentId, userId, boardTaskSource: null },
    select: { id: true },
  });

  if (!parent) {
    throw new Error("Parent page not found");
  }
}

/**
 * Walk up from the intended parent; a page may not be moved inside its own
 * subtree or the tree would become an unreachable cycle.
 */
async function assertNotDescendant(
  client: Pick<Prisma.TransactionClient, "note">,
  userId: string,
  noteId: string,
  targetParentId: string
) {
  let currentId: string | null = targetParentId;

  while (currentId) {
    if (currentId === noteId) {
      throw new Error("Cannot move a page into its own descendant");
    }

    const current: { parentId: string | null } | null = await client.note.findFirst({
      where: { id: currentId, userId },
      select: { parentId: true },
    });

    currentId = current?.parentId ?? null;
  }
}

/**
 * Collect a page and every descendant, so archive and restore move whole
 * subtrees instead of stranding children.
 */
async function collectSubtreeIds(
  client: Pick<Prisma.TransactionClient, "note">,
  userId: string,
  noteId: string
): Promise<string[]> {
  const ids = [noteId];
  let frontier = [noteId];

  while (frontier.length > 0) {
    const children = await client.note.findMany({
      where: { userId, parentId: { in: frontier } },
      select: { id: true },
    });

    frontier = children.map((child) => child.id);
    ids.push(...frontier);
  }

  return ids;
}

/**
 * Create a new note with optional initial content.
 */
export async function createNote(
  userId: string,
  input: CreateNoteInput = {}
): Promise<string> {
  if (input.parentId) {
    await assertOwnedParent(input.parentId, userId);
  }

  const nextTitle = input.title ?? DEFAULT_NOTE_TITLE;
  const nextPosition = await getNextNotePosition(userId, input.parentId ?? null);
  const note = await db.$transaction(async (tx) => {
    const createdNote = await tx.note.create({
      data: {
        title: nextTitle,
        icon: input.icon,
        parentId: input.parentId,
        position: nextPosition,
        userId,
      },
    });

    await replaceNoteBlocks(tx, createdNote.id, createEmptyDocument());

    return createdNote;
  });

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
      parentId: note.parentId,
    },
  });

  return note.id;
}

/**
 * Get a single note with all its blocks.
 */
export async function getNote(userId: string, noteId: string) {
  const note = await db.note.findFirst({
    where: { id: noteId, userId, boardTaskSource: null },
    include: {
      pagePriority: { select: { slot: true } },
      blocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!note) {
    return null;
  }

  const { pagePriority, ...page } = note;
  return {
    ...page,
    quadrant: (MATRIX_SLOTS as readonly string[]).includes(pagePriority?.slot ?? "")
      ? (pagePriority?.slot as MatrixSlot)
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
    where: { userId, isArchived: false, boardTaskSource: null },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      icon: true,
      parentId: true,
      position: true,
      isPinned: true,
      pagePriority: { select: { slot: true } },
      updatedAt: true,
      createdAt: true,
    },
  });

  return rows.sort(byPinnedThenPosition).map(({ pagePriority, ...row }) => ({
    ...row,
    quadrant: (MATRIX_SLOTS as readonly string[]).includes(pagePriority?.slot ?? "")
      ? (pagePriority?.slot as MatrixSlot)
      : null,
  }));
}

/**
 * Get every non-archived page as a nested tree for the sidebar. The whole set
 * is fetched once and linked in memory; a page whose parent is missing from the
 * result is treated as a root so nothing becomes unreachable.
 */
export async function getPageTree(userId: string): Promise<PageTreeNode[]> {
  const rows = (
    await db.note.findMany({
      where: { userId, isArchived: false, boardTaskSource: null },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        icon: true,
        parentId: true,
        position: true,
        isPinned: true,
        updatedAt: true,
      },
    })
  ).sort(byPinnedThenPosition);

  const nodesById = new Map<string, PageTreeNode>(
    rows.map((row) => [row.id, { ...row, children: [] }])
  );
  const roots: PageTreeNode[] = [];

  for (const row of rows) {
    const node = nodesById.get(row.id);

    if (!node) {
      continue;
    }

    const parent = row.parentId ? nodesById.get(row.parentId) : null;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Ancestors of a page, outermost first, excluding the page itself. The walk is
 * bounded by the visited set so a corrupted parent link cannot loop forever.
 */
export async function getPageAncestors(
  userId: string,
  noteId: string
): Promise<PageBreadcrumb[]> {
  const ancestors: PageBreadcrumb[] = [];
  const visited = new Set<string>([noteId]);

  let currentId: string | null = (
    await db.note.findFirst({
      where: { id: noteId, userId },
      select: { parentId: true },
    })
  )?.parentId ?? null;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const parent: (PageBreadcrumb & { parentId: string | null }) | null =
      await db.note.findFirst({
        where: { id: currentId, userId },
        select: { id: true, title: true, icon: true, parentId: true },
      });

    if (!parent) {
      break;
    }

    ancestors.unshift({ id: parent.id, title: parent.title, icon: parent.icon });
    currentId = parent.parentId;
  }

  return ancestors;
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
      boardTaskSource: null,
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
      parentId: true,
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
      boardTaskSource: null,
      title: {
        equals: normalizedTitle,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      title: true,
      parentId: true,
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

  if (typeof input.parentId === "string") {
    if (input.parentId === noteId) {
      throw new Error("A page cannot be its own parent");
    }

    await assertOwnedParent(input.parentId, userId);
    await assertNotDescendant(db, userId, noteId, input.parentId);
  }

  const updateData: UpdateNoteInput = { ...input };
  const shouldRecalculatePosition =
    Object.prototype.hasOwnProperty.call(input, "parentId") &&
    input.parentId !== oldNote.parentId &&
    typeof input.position !== "string";

  if (shouldRecalculatePosition) {
    updateData.position = await getNextNotePosition(
      userId,
      input.parentId ?? null
    );
  }

  await db.note.update({
    where: { id: noteId },
    data: updateData,
  });

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

  const searchText = deriveSearchText(document);

  const blockChanges = await db.$transaction(async (tx) => {
    const changes = await replaceNoteBlocks(tx, noteId, document);

    if (!changes.hasChanges) {
      // Even if the canonical blocks did not change, refresh the searchText
      // so historic notes get backfilled the first time they are reopened.
      await tx.note.update({
        where: { id: noteId },
        data: { searchText },
      });
      return changes;
    }

    await tx.note.update({
      where: { id: noteId },
      data: { updatedAt: new Date(), searchText },
    });

    return changes;
  });

  if (!blockChanges.hasChanges) {
    return;
  }

  await extractAndSaveLinks(userId, noteId);

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
    where: { userId, isArchived: true, boardTaskSource: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      icon: true,
      parentId: true,
      updatedAt: true,
    },
  });
}

/**
 * Archive a note and its subtree (soft delete).
 */
export async function archiveNote(
  userId: string,
  noteId: string
): Promise<void> {
  await assertOwnedNote(noteId, userId);

  await db.$transaction(async (tx) => {
    const subtreeIds = await collectSubtreeIds(tx, userId, noteId);

    await tx.note.updateMany({
      where: { id: { in: subtreeIds }, userId },
      data: { isArchived: true },
    });
  });

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "archive",
  });
}

/**
 * Restore an archived note and its subtree. A page whose parent is still
 * archived is lifted to the root, otherwise it would restore out of sight.
 */
export async function restoreNote(
  userId: string,
  noteId: string
): Promise<void> {
  const note = await assertOwnedNote(noteId, userId);

  await db.$transaction(async (tx) => {
    const subtreeIds = await collectSubtreeIds(tx, userId, noteId);

    await tx.note.updateMany({
      where: { id: { in: subtreeIds }, userId },
      data: { isArchived: false },
    });

    if (note.parentId) {
      const parent = await tx.note.findFirst({
        where: { id: note.parentId, userId },
        select: { isArchived: true },
      });

      if (!parent || parent.isArchived) {
        await tx.note.update({
          where: { id: noteId },
          data: { parentId: null },
        });
      }
    }
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

export async function getNoteForExport(userId: string, noteId: string) {
  const note = await getNote(userId, noteId);

  if (!note) {
    return null;
  }

  return {
    id: note.id,
    title: note.title,
    updatedAt: note.updatedAt,
    document: note.document,
  };
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
        boardTaskSource: null,
      },
      select: {
        id: true,
        parentId: true,
        isPinned: true,
      },
    });

    if (!note) {
      throw new Error("Note not found");
    }

    const siblings = await siblingPositions(tx, userId, note.parentId, note.isPinned);
    const currentIndex = siblings.findIndex((candidate) => candidate.id === noteId);

    if (currentIndex === -1) {
      throw new Error("Note not found");
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }

    // Step over the neighbour: land between it and whatever is beyond it.
    const neighbour = siblings[targetIndex] as SiblingPosition;
    const beyond =
      direction === "up" ? siblings[targetIndex - 1] : siblings[targetIndex + 1];
    const [before, after] =
      direction === "up"
        ? [beyond?.position ?? null, neighbour.position]
        : [neighbour.position, beyond?.position ?? null];

    await tx.note.update({
      where: { id: noteId },
      data: { position: generateKeyBetween(before, after) },
    });
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
    parentId?: string | null;
    afterNoteId?: string | null;
  }
): Promise<void> {
  await db.$transaction(async (tx) => {
    const note = await tx.note.findFirst({
      where: {
        id: noteId,
        userId,
        isArchived: false,
        boardTaskSource: null,
      },
      select: {
        id: true,
        parentId: true,
        isPinned: true,
      },
    });

    if (!note) {
      throw new Error("Note not found");
    }

    if (typeof placement.parentId === "string") {
      await assertOwnedParent(placement.parentId, userId);
    }

    const targetNote =
      typeof placement.afterNoteId === "string"
        ? await tx.note.findFirst({
            where: {
              id: placement.afterNoteId,
              userId,
              isArchived: false,
              boardTaskSource: null,
            },
            select: {
              id: true,
              parentId: true,
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

    const destinationParentId =
      targetNote?.parentId ??
      (Object.prototype.hasOwnProperty.call(placement, "parentId")
        ? placement.parentId ?? null
        : note.parentId);

    if (destinationParentId === note.id) {
      throw new Error("A page cannot be its own parent");
    }

    if (destinationParentId && destinationParentId !== note.parentId) {
      await assertNotDescendant(tx, userId, note.id, destinationParentId);
    }

    // One row moves: the new key sits between the drop target and whatever
    // follows it, so no sibling has to be renumbered.
    const destinationSiblings = (
      await siblingPositions(tx, userId, destinationParentId, note.isPinned)
    ).filter((sibling) => sibling.id !== note.id);

    const insertIndex =
      targetNote != null
        ? destinationSiblings.findIndex((sibling) => sibling.id === targetNote.id) + 1
        : destinationSiblings.length;

    const before = destinationSiblings[insertIndex - 1]?.position ?? null;
    const after = destinationSiblings[insertIndex]?.position ?? null;

    await tx.note.update({
      where: { id: note.id },
      data: {
        parentId: destinationParentId,
        position: generateKeyBetween(before, after),
      },
    });
  });

  await recordOperation({
    userId,
    entityType: "note",
    entityId: noteId,
    actionType: "relocate",
    payload: placement,
  });
}

type NoteMutationClient = Pick<
  Prisma.TransactionClient,
  "block" | "note" | "taskMetadata"
>;

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

  await syncTaskMetadata(client, noteId, persistedBlocks);

  return {
    created: blocksToCreate.length,
    updated: blocksToUpdate.length,
    deleted: blockIdsToDelete.length,
    hasChanges: true,
  } satisfies BlockMutationSummary;
}

async function syncTaskMetadata(
  client: NoteMutationClient,
  noteId: string,
  blocks: ReturnType<typeof documentToPersistedBlocks>,
): Promise<void> {
  const taskBlocks = blocks.filter((block) => block.type === "taskItem");
  const taskIds = taskBlocks.map((block) => block.id);

  await client.taskMetadata.deleteMany({
    where: {
      block: { noteId },
      ...(taskIds.length > 0 ? { blockId: { notIn: taskIds } } : {}),
    },
  });

  for (const block of taskBlocks) {
    const attributes = isRecord(block.attributes) ? block.attributes : {};
    const priority = EISENHOWER_QUADRANTS.includes(
      String(attributes.quadrant ?? "") as (typeof EISENHOWER_QUADRANTS)[number],
    )
      ? String(attributes.quadrant)
      : null;
    const durationMinutes =
      typeof attributes.durationMinutes === "number" && attributes.durationMinutes > 0
        ? Math.trunc(attributes.durationMinutes)
        : null;
    const description =
      typeof attributes.description === "string" ? attributes.description : null;

    await client.taskMetadata.upsert({
      where: { blockId: block.id },
      create: {
        blockId: block.id,
        completed: attributes.checked === true,
        priority,
        durationMinutes,
        description,
      },
      update: { completed: attributes.checked === true },
    });
  }
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

  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalizeJsonValue(value[key]);
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
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    select: {
      blocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          content: true,
          attributes: true,
          parentId: true,
          position: true,
        },
      },
    },
  });
  if (!note) throw new Error("Note not found");
  return { document: persistedBlocksToDocument(note.blocks) };
}

type PositionClient = Pick<Prisma.TransactionClient, "note">;

interface SiblingPosition {
  id: string;
  position: string;
  isPinned: boolean;
}

/**
 * Siblings of one parent in display order. Fractional keys are compared as
 * plain strings here rather than in SQL, so database collation cannot reorder
 * them behind our back.
 */
async function siblingPositions(
  client: PositionClient,
  userId: string,
  parentId: string | null,
  isPinned?: boolean
): Promise<SiblingPosition[]> {
  const siblings = await client.note.findMany({
    where: {
      userId,
      parentId,
      isArchived: false,
      boardTaskSource: null,
      ...(typeof isPinned === "boolean" ? { isPinned } : {}),
    },
    select: { id: true, position: true, isPinned: true },
  });

  return siblings.sort(comparePosition);
}

function byPinnedThenPosition(
  left: { isPinned: boolean; position: string },
  right: { isPinned: boolean; position: string }
): number {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
  return comparePosition(left, right);
}

function comparePosition(
  left: { position: string },
  right: { position: string }
): number {
  return left.position < right.position ? -1 : left.position > right.position ? 1 : 0;
}

async function getNextNotePosition(
  userId: string,
  parentId: string | null,
  client: PositionClient = db
) {
  const siblings = await siblingPositions(client, userId, parentId);
  return generateKeyBetween(siblings.at(-1)?.position ?? null, null);
}

