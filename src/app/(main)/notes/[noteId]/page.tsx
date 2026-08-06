import { notFound } from "next/navigation";
import { getNoteAction, getBacklinksAction, getNotesAction } from "@/server/api/notes";
import { NoteEditorPage } from "@/components/notes/NoteEditorPage";

interface NotePageProps {
  params: Promise<{ noteId: string }>;
}

export default async function NotePage({ params }: NotePageProps) {
  const { noteId } = await params;
  const [note, backlinks, pages] = await Promise.all([
    getNoteAction(noteId),
    getBacklinksAction(noteId),
    getNotesAction(),
  ]);

  if (!note) {
    notFound();
  }

  const noteData = {
    id: note.id,
    title: note.title,
    icon: note.icon,
    parentId: note.parentId,
    isPinned: note.isPinned,
    document: note.document,
  };

  return (
    <NoteEditorPage
      note={noteData}
      pages={pages}
      backlinks={backlinks}
    />
  );
}
