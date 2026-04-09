"use server";

import { revalidatePath } from "next/cache";
import { archiveNote, createNote, relocateNote, updateNote } from "@/domain/note/note.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

function revalidateLibraryViews(noteIds: string[] = []) {
  revalidatePath("/library");
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/published");

  for (const noteId of noteIds) {
    revalidatePath(`/notes/${noteId}`);
    revalidatePath(`/p/${noteId}`);
  }
}

export async function createLibraryNoteAction(input?: {
  folderId?: string | null;
  categoryId?: string | null;
}) {
  const { userId } = await requireAuthenticatedUser();
  const noteId = await createNote(userId, {
    folderId: input?.folderId ?? undefined,
    categoryId: input?.categoryId ?? undefined,
  });

  revalidateLibraryViews([noteId]);
  return noteId;
}

export async function relocateLibraryNoteAction(
  noteId: string,
  input: {
    folderId?: string | null;
    afterNoteId?: string | null;
  }
) {
  const { userId } = await requireAuthenticatedUser();
  await relocateNote(userId, noteId, input);
  revalidateLibraryViews([noteId]);
}

export async function setLibraryNotesPublishedAction(
  noteIds: string[],
  isPublished: boolean
) {
  const { userId } = await requireAuthenticatedUser();
  const dedupedNoteIds = Array.from(new Set(noteIds)).filter(Boolean);

  await Promise.all(
    dedupedNoteIds.map((noteId) =>
      updateNote(userId, noteId, {
        isPublished,
      })
    )
  );

  revalidateLibraryViews(dedupedNoteIds);
}

export async function archiveLibraryNotesAction(noteIds: string[]) {
  const { userId } = await requireAuthenticatedUser();
  const dedupedNoteIds = Array.from(new Set(noteIds)).filter(Boolean);

  await Promise.all(dedupedNoteIds.map((noteId) => archiveNote(userId, noteId)));

  revalidateLibraryViews(dedupedNoteIds);
}
