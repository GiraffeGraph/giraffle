import { notFound, redirect } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import { getPublicNote } from "@/domain/note/note.service";

interface PublishedNotePageProps {
  params: Promise<{ noteId: string }>;
}

export default async function PublishedNotePage({
  params,
}: PublishedNotePageProps) {
  const { noteId } = await params;
  const note = await getPublicNote(noteId);

  if (!note) {
    notFound();
  }

  if (note.slug) {
    redirect(`/published/${note.slug}`);
  }

  return (
    <div className="published-page">
      <div className="published-shell">
        <div className="published-meta">
          <div className="published-label">Published Note</div>
          <h1 className="published-title">{note.title}</h1>
        </div>
        <Editor initialContent={note.document} editable={false} />
      </div>
    </div>
  );
}
