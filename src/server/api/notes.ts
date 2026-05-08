"use server";

import { revalidatePath } from "next/cache";
import { getBacklinks } from "@/domain/link/link.service";
import {
  addTodoToNote,
  archiveNote,
  createCalendarTodo,
  createNote,
  deleteCalendarTodo,
  deleteNote,
  findNoteByTitle,
  getArchivedNotes,
  getNote,
  getNoteForExport,
  getNotes,
  getNotesWithTodoSummary,
  getNoteTodoBlocks,
  getPublicNoteBySlug,
  getPublishedNotesForExport,
  getTodosForCalendar,
  getUnscheduledTodos,
  moveNote,
  relocateNote,
  restoreNote,
  saveNoteContent,
  searchNotesByTitle,
  setTodoBlockQuadrant,
  setTodoDueDate,
  setTodoDuration,
  toggleCalendarTodo,
  toggleTodoBlock,
  updateCalendarTodoText,
  updateNote,
} from "@/domain/note/note.service";
import { buildNoteExportArtifact } from "@/domain/note/note.export";
import type {
  CreateNoteInput,
  EisenhowerQuadrant,
  MatrixSlot,
  NoteReference,
  TiptapDocument,
  UpdateNoteInput,
} from "@/domain/note/note.types";
import { normalizeWikilinkTarget } from "@/domain/link/wikilink.parser";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function createNoteAction(input?: CreateNoteInput) {
  const { userId } = await requireAuthenticatedUser();
  const noteId = await createNote(userId, input);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/inbox");
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
  revalidatePath("/inbox");
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
  revalidatePath(`/notes/${noteId}`);
  revalidatePath(`/p/${noteId}`);
}

export async function archiveNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  await archiveNote(userId, noteId);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/inbox");
  revalidatePath("/archive");
}

export async function getArchivedNotesAction() {
  const { userId } = await requireAuthenticatedUser();
  return getArchivedNotes(userId);
}

export async function restoreNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  await restoreNote(userId, noteId);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/inbox");
  revalidatePath("/archive");
}

export async function moveNoteAction(
  noteId: string,
  direction: "up" | "down"
) {
  const { userId } = await requireAuthenticatedUser();
  await moveNote(userId, noteId, direction);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/inbox");
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
  revalidatePath("/inbox");
  revalidatePath(`/notes/${noteId}`);
}

export async function deleteNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteNote(userId, noteId);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/inbox");
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
  revalidatePath("/inbox");
  revalidatePath(`/notes/${noteId}`);

  return {
    id: noteId,
    title,
    folderId: folderId ?? null,
  };
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

export async function getNotesWithTodoSummaryAction() {
  const { userId } = await requireAuthenticatedUser();
  return getNotesWithTodoSummary(userId);
}

export async function assignNoteToQuadrantAction(
  noteId: string,
  quadrant: MatrixSlot | null
) {
  const { userId } = await requireAuthenticatedUser();
  await updateNote(userId, noteId, { quadrant });
  revalidatePath("/tower-matrix");
}

export async function getNoteTodosAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getNoteTodoBlocks(userId, noteId);
}

export async function assignTodoToQuadrantAction(
  blockId: string,
  quadrant: EisenhowerQuadrant | null
) {
  const { userId } = await requireAuthenticatedUser();
  await setTodoBlockQuadrant(userId, blockId, quadrant);
  revalidatePath("/tower-matrix");
}

export async function toggleTodoAction(blockId: string, checked: boolean) {
  const { userId } = await requireAuthenticatedUser();
  await toggleTodoBlock(userId, blockId, checked);
}

export async function addTodoToNoteAction(noteId: string, text: string) {
  const { userId } = await requireAuthenticatedUser();
  await addTodoToNote(userId, noteId, text);
  revalidatePath("/tower-matrix");
}

// ─── Stride Calendar Actions ──────────────────────────────────

export async function getCalendarTodosAction(start: Date, end: Date) {
  const { userId } = await requireAuthenticatedUser();
  return getTodosForCalendar(userId, start, end);
}

export async function getUnscheduledTodosAction() {
  const { userId } = await requireAuthenticatedUser();
  return getUnscheduledTodos(userId);
}

export async function setTodoDueDateAction(
  blockId: string,
  dueDate: Date | null
) {
  const { userId } = await requireAuthenticatedUser();
  await setTodoDueDate(userId, blockId, dueDate);
  revalidatePath("/stride");
}

export async function toggleCalendarTodoAction(
  blockId: string,
  checked: boolean
) {
  const { userId } = await requireAuthenticatedUser();
  await toggleCalendarTodo(userId, blockId, checked);
}

export async function setTodoDurationAction(
  blockId: string,
  durationMinutes: number
) {
  const { userId } = await requireAuthenticatedUser();
  await setTodoDuration(userId, blockId, durationMinutes);
}

export async function updateCalendarTodoTextAction(
  blockId: string,
  text: string
) {
  const { userId } = await requireAuthenticatedUser();
  await updateCalendarTodoText(userId, blockId, text);
}

export async function deleteCalendarTodoAction(blockId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteCalendarTodo(userId, blockId);
}

export async function createCalendarTodoAction(
  text: string,
  dueDate: Date,
  durationMinutes: number
) {
  const { userId } = await requireAuthenticatedUser();
  return createCalendarTodo(userId, text, dueDate, durationMinutes);
}
