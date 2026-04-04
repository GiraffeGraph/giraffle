import { notFound } from "next/navigation";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNoteAction, getBacklinksAction } from "@/server/api/notes";
import { NoteEditorPage } from "@/components/notes/NoteEditorPage";

interface NotePageProps {
  params: Promise<{ noteId: string }>;
}

export default async function NotePage({ params }: NotePageProps) {
  const { noteId } = await params;
  const [note, backlinks, folders] = await Promise.all([
    getNoteAction(noteId),
    getBacklinksAction(noteId),
    getAllFoldersAction(),
  ]);

  if (!note) {
    notFound();
  }

  const noteData = {
    id: note.id,
    title: note.title,
    icon: note.icon,
    folderId: note.folderId,
    isPublished: note.isPublished,
    tags: note.tags ?? [],
    document: note.document,
  };

  return (
    <NoteEditorPage
      note={noteData}
      folders={folders}
      backlinks={backlinks}
    />
  );
}
