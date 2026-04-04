"use server";

import { revalidatePath } from "next/cache";
import { getBacklinks } from "@/domain/link/link.service";
import {
  archiveNote,
  createNote,
  deleteNote,
  getNote,
  getNotes,
  saveNoteContent,
  updateNote,
} from "@/domain/note/note.service";
import type {
  CreateNoteInput,
  TiptapDocument,
  UpdateNoteInput,
} from "@/domain/note/note.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function createNoteAction(input?: CreateNoteInput) {
  const { userId } = await requireAuthenticatedUser();
  const noteId = await createNote(userId, input);
  revalidatePath("/dashboard");
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
  revalidatePath(`/notes/${noteId}`);
}

export async function saveNoteContentAction(
  noteId: string,
  document: TiptapDocument
) {
  const { userId } = await requireAuthenticatedUser();
  await saveNoteContent(userId, noteId, document);
  revalidatePath("/dashboard");
  revalidatePath(`/notes/${noteId}`);
}

export async function archiveNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  await archiveNote(userId, noteId);
  revalidatePath("/dashboard");
}

export async function deleteNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteNote(userId, noteId);
  revalidatePath("/dashboard");
}

export async function getBacklinksAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getBacklinks(userId, noteId);
}
