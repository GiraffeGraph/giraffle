"use server";

import { db } from "@/lib/db";
import type { CreateNoteInput, UpdateNoteInput, TiptapDocument } from "./note.types";
import { extractAndSaveLinks, resolveLinksForNote } from "@/domain/link/link.service";

/**
 * Create a new note with optional initial content.
 */
export async function createNote(input: CreateNoteInput = {}): Promise<string> {
  const note = await db.note.create({
    data: {
      title: input.title ?? "Untitled",
      icon: input.icon,
      folderId: input.folderId,
      templateId: input.templateId,
    },
  });

  // Create a default empty paragraph block
  await db.block.create({
    data: {
      noteId: note.id,
      type: "paragraph",
      content: { type: "paragraph", content: [] },
      position: 0,
    },
  });

  // If note has a title, resolve any pending wikilinks
  if (input.title && input.title !== "Untitled") {
    await resolveLinksForNote(note.id, input.title);
  }

  return note.id;
}

/**
 * Get a single note with all its blocks.
 */
export async function getNote(noteId: string) {
  const note = await db.note.findUnique({
    where: { id: noteId },
    include: {
      blocks: {
        orderBy: { position: "asc" },
      },
    },
  });

  return note;
}

/**
 * Get all non-archived notes, ordered by last update.
 */
export async function getNotes() {
  return db.note.findMany({
    where: { isArchived: false },
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
  noteId: string,
  input: UpdateNoteInput
): Promise<void> {
  const oldNote = await db.note.findUnique({
    where: { id: noteId },
    select: { title: true },
  });

  await db.note.update({
    where: { id: noteId },
    data: input,
  });

  // If title changed, re-resolve links
  if (input.title && input.title !== oldNote?.title) {
    await resolveLinksForNote(noteId, input.title);
  }
}

/**
 * Save the full block content for a note from the editor.
 * Replaces all existing blocks (full save, not incremental).
 * Also triggers link extraction.
 */
export async function saveNoteContent(
  noteId: string,
  document: TiptapDocument
): Promise<void> {
  // Delete existing blocks
  await db.block.deleteMany({ where: { noteId } });

  // Flatten the Tiptap document into blocks
  if (document.content && document.content.length > 0) {
    const blocksData = document.content.map((node, index) => ({
      noteId,
      type: node.type as string,
      content: node as object,
      attributes: (node.attrs ?? {}) as object,
      position: index,
    }));

    await db.block.createMany({ data: blocksData });
  }

  // Update note's updatedAt
  await db.note.update({
    where: { id: noteId },
    data: { updatedAt: new Date() },
  });

  // Re-extract and save links
  await extractAndSaveLinks(noteId);
}

/**
 * Archive a note (soft delete).
 */
export async function archiveNote(noteId: string): Promise<void> {
  await db.note.update({
    where: { id: noteId },
    data: { isArchived: true },
  });
}

/**
 * Restore an archived note.
 */
export async function restoreNote(noteId: string): Promise<void> {
  await db.note.update({
    where: { id: noteId },
    data: { isArchived: false },
  });
}

/**
 * Permanently delete a note and all associated data.
 */
export async function deleteNote(noteId: string): Promise<void> {
  await db.note.delete({ where: { id: noteId } });
}
