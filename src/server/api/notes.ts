"use server";

import { createNote, getNotes, getNote, updateNote, saveNoteContent, archiveNote, deleteNote } from "@/domain/note/note.service";
import { getBacklinks } from "@/domain/link/link.service";
import type { TiptapDocument, UpdateNoteInput, CreateNoteInput } from "@/domain/note/note.types";
import { revalidatePath } from "next/cache";

export async function createNoteAction(input?: CreateNoteInput) {
  const noteId = await createNote(input);
  revalidatePath("/");
  return noteId;
}

export async function getNotesAction() {
  return getNotes();
}

export async function getNoteAction(noteId: string) {
  return getNote(noteId);
}

export async function updateNoteAction(noteId: string, input: UpdateNoteInput) {
  await updateNote(noteId, input);
  revalidatePath("/");
  revalidatePath(`/notes/${noteId}`);
}

export async function saveNoteContentAction(noteId: string, document: TiptapDocument) {
  await saveNoteContent(noteId, document);
  revalidatePath(`/notes/${noteId}`);
}

export async function archiveNoteAction(noteId: string) {
  await archiveNote(noteId);
  revalidatePath("/");
}

export async function deleteNoteAction(noteId: string) {
  await deleteNote(noteId);
  revalidatePath("/");
}

export async function getBacklinksAction(noteId: string) {
  return getBacklinks(noteId);
}
