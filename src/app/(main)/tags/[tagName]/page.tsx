import Link from "next/link";
import { getNotesForTagAction } from "@/server/api/tags";
import { formatDate } from "@/lib/utils";

interface TagPageProps {
  params: Promise<{ tagName: string }>;
}

export default async function TagPage({ params }: TagPageProps) {
  const { tagName } = await params;
  const notes = await getNotesForTagAction(tagName);

  return (
    <div className="dashboard">
      {notes.length === 0 ? (
        <div className="dashboard-empty">
          <p className="dashboard-empty-text">Bu etiket için not bulunamadı.</p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="dashboard-note-card"
            >
              <div className="dashboard-note-card-icon">{note.icon ?? "Not"}</div>
              <div className="dashboard-note-card-title">{note.title}</div>
              <div className="dashboard-note-card-date">
                {formatDate(new Date(note.updatedAt))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
