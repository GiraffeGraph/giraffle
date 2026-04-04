import { notFound } from "next/navigation";
import { getNoteAction, getBacklinksAction } from "@/server/api/notes";
import { NoteEditorPage } from "@/components/notes/NoteEditorPage";

interface NotePageProps {
  params: Promise<{ noteId: string }>;
}

export default async function NotePage({ params }: NotePageProps) {
  const { noteId } = await params;
  const note = await getNoteAction(noteId);

  if (!note) {
    notFound();
  }

  const backlinks = await getBacklinksAction(noteId);

  const noteData = {
    id: note.id,
    title: note.title,
    icon: note.icon,
    document: note.document,
  };

  return (
    <NoteEditorPage
      note={noteData}
      backlinks={backlinks}
    />
  );
}
