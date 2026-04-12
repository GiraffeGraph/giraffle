import { notFound } from "next/navigation";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNoteCategoriesAction } from "@/server/api/categories";
import { getNoteAction, getBacklinksAction } from "@/server/api/notes";
import { NoteEditorPage } from "@/components/notes/NoteEditorPage";
import { getNoteFeedAssignmentsAction } from "@/server/api/feeds";

interface NotePageProps {
  params: Promise<{ noteId: string }>;
}

export default async function NotePage({ params }: NotePageProps) {
  const { noteId } = await params;
  const [note, backlinks, folders, categories, feedAssignments] = await Promise.all([
    getNoteAction(noteId),
    getBacklinksAction(noteId),
    getAllFoldersAction(),
    getNoteCategoriesAction(),
    getNoteFeedAssignmentsAction(noteId),
  ]);

  if (!note) {
    notFound();
  }

  const noteData = {
    id: note.id,
    title: note.title,
    slug: note.slug,
    icon: note.icon,
    folderId: note.folderId,
    category: note.category ?? null,
    isPinned: note.isPinned,
    isPublished: note.isPublished,
    tags: note.tags ?? [],
    document: note.document,
  };

  return (
    <NoteEditorPage
      note={noteData}
      folders={folders}
      categories={categories}
      backlinks={backlinks}
      feedAssignments={feedAssignments}
    />
  );
}
