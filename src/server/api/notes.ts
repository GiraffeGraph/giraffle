"use server";

import { revalidatePath } from "next/cache";
import { getBacklinks } from "@/domain/link/link.service";
import {
  archiveNote,
  createNote,
  deleteBlock,
  deleteNote,
  findNoteByTitle,
  getNote,
  getNoteForExport,
  getNotes,
  getPublicNoteBySlug,
  getPublishedNotesForExport,
  insertBlock,
  moveBlock,
  moveNote,
  relocateNote,
  saveNoteContent,
  searchNotesByTitle,
  updateBlock,
  updateNote,
} from "@/domain/note/note.service";
import { buildNoteExportArtifact } from "@/domain/note/note.export";
import type {
  InsertBlockInput,
  CreateNoteInput,
  NoteReference,
  TiptapDocument,
  UpdateBlockInput,
  UpdateNoteInput,
} from "@/domain/note/note.types";
import { normalizeWikilinkTarget } from "@/domain/link/wikilink.parser";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function createNoteAction(input?: CreateNoteInput) {
  const { userId } = await requireAuthenticatedUser();
  const noteId = await createNote(userId, input);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  return noteId;
}

export async function getNotesAction() {
  const { userId } = await requireAuthenticatedUser();
  return getNotes(userId);
}

export async function getNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getNote(userId, noteId);
}

export async function updateNoteAction(noteId: string, input: UpdateNoteInput) {
  const { userId } = await requireAuthenticatedUser();
  await updateNote(userId, noteId, input);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath(`/notes/${noteId}`);
  revalidatePath(`/p/${noteId}`);
  revalidatePath("/published");
}

export async function saveNoteContentAction(
  noteId: string,
  document: TiptapDocument
) {
  const { userId } = await requireAuthenticatedUser();
  await saveNoteContent(userId, noteId, document);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/tags");
  revalidatePath(`/notes/${noteId}`);
  revalidatePath(`/p/${noteId}`);
}

export async function archiveNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  await archiveNote(userId, noteId);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
}

export async function moveNoteAction(
  noteId: string,
  direction: "up" | "down"
) {
  const { userId } = await requireAuthenticatedUser();
  await moveNote(userId, noteId, direction);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath(`/notes/${noteId}`);
}

export async function relocateNoteAction(
  noteId: string,
  placement: {
    folderId?: string | null;
    afterNoteId?: string | null;
  }
) {
  const { userId } = await requireAuthenticatedUser();
  await relocateNote(userId, noteId, placement);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath(`/notes/${noteId}`);
}

export async function deleteNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteNote(userId, noteId);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
}

export async function getBacklinksAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getBacklinks(userId, noteId);
}

export async function searchNotesByTitleAction(
  query: string
): Promise<NoteReference[]> {
  const { userId } = await requireAuthenticatedUser();
  return searchNotesByTitle(userId, query);
}

export async function findNoteByTitleAction(
  title: string
): Promise<NoteReference | null> {
  const { userId } = await requireAuthenticatedUser();
  return findNoteByTitle(userId, title);
}

export async function createNoteFromWikilinkAction(
  rawTitle: string,
  folderId?: string | null
): Promise<NoteReference> {
  const { userId } = await requireAuthenticatedUser();
  const title = normalizeWikilinkTarget(rawTitle);

  if (!title) {
    throw new Error("Wikilink title is required");
  }

  const existingNote = await findNoteByTitle(userId, title);

  if (existingNote) {
    return existingNote;
  }

  const noteId = await createNote(userId, {
    title,
    folderId: folderId ?? undefined,
  });

  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath(`/notes/${noteId}`);

  return {
    id: noteId,
    title,
    folderId: folderId ?? null,
  };
}

export async function insertBlockAction(
  noteId: string,
  input: InsertBlockInput
) {
  const { userId } = await requireAuthenticatedUser();
  const document = await insertBlock(userId, noteId, input);
  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/graph");
  return document;
}

export async function updateBlockAction(
  noteId: string,
  blockId: string,
  input: UpdateBlockInput
) {
  const { userId } = await requireAuthenticatedUser();
  const document = await updateBlock(userId, noteId, blockId, input);
  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/graph");
  return document;
}

export async function moveBlockAction(
  noteId: string,
  blockId: string,
  placement: {
    parentBlockId?: string | null;
    afterBlockId?: string | null;
  }
) {
  const { userId } = await requireAuthenticatedUser();
  const document = await moveBlock(userId, noteId, blockId, placement);
  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/graph");
  return document;
}

export async function deleteBlockAction(noteId: string, blockId: string) {
  const { userId } = await requireAuthenticatedUser();
  const document = await deleteBlock(userId, noteId, blockId);
  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/graph");
  return document;
}

export async function getNoteExportAction(
  noteId: string,
  format: "markdown" | "mdx"
) {
  const { userId } = await requireAuthenticatedUser();
  const note = await getNoteForExport(userId, noteId);

  if (!note) {
    throw new Error("Note not found");
  }

  const artifact = buildNoteExportArtifact(note);
  return format === "mdx" ? artifact.mdx : artifact.markdown;
}

export async function getPublishedExportsAction() {
  const { userId } = await requireAuthenticatedUser();
  const notes = await getPublishedNotesForExport(userId);
  return notes.map(buildNoteExportArtifact);
}

export async function getPublicNoteBySlugAction(slug: string) {
  return getPublicNoteBySlug(slug);
}
