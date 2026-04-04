"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { extractAndSaveLinks, resolveLinksForNote } from "@/domain/link/link.service";
import type {
  CreateNoteInput,
  TiptapDocument,
  UpdateNoteInput,
} from "./note.types";
import {
  createEmptyDocument,
  documentToPersistedBlocks,
  persistedBlocksToDocument,
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
        title: input.title ?? "Untitled",
        icon: input.icon,
        folderId: input.folderId,
        templateId: input.templateId,
        userId,
      },
    });

    await replaceNoteBlocks(tx, createdNote.id, createEmptyDocument());

    return createdNote;
  });

  if (note.title !== "Untitled") {
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
    },
  });

  if (!note) {
    return null;
  }

  return {
    ...note,
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
 * Replaces all existing blocks (full save, not incremental).
 * Also triggers link extraction.
 */
export async function saveNoteContent(
  userId: string,
  noteId: string,
  document: TiptapDocument
): Promise<void> {
  await assertOwnedNote(noteId, userId);

  await db.$transaction(async (tx) => {
    await replaceNoteBlocks(tx, noteId, document);

    await tx.note.update({
      where: { id: noteId },
      data: { updatedAt: new Date() },
    });
  });

  await extractAndSaveLinks(userId, noteId);
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

type NoteMutationClient = Pick<typeof db, "block" | "note">;

async function replaceNoteBlocks(
  client: NoteMutationClient,
  noteId: string,
  document: TiptapDocument
) {
  const persistedBlocks = documentToPersistedBlocks(noteId, document);

  await client.block.deleteMany({ where: { noteId } });

  if (persistedBlocks.length === 0) {
    return;
  }

  const blocksByDepth = new Map<number, typeof persistedBlocks>();

  for (const block of persistedBlocks) {
    const siblings = blocksByDepth.get(block.depth) ?? [];
    siblings.push(block);
    blocksByDepth.set(block.depth, siblings);
  }

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
