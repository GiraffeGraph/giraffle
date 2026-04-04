import Link from "next/link";
import { getNotesForTagAction } from "@/server/api/tags";

interface TagPageProps {
  params: Promise<{ tagName: string }>;
}

export default async function TagPage({ params }: TagPageProps) {
  const { tagName } = await params;
  const notes = await getNotesForTagAction(tagName);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">#{tagName}</h1>
        <p className="dashboard-subtitle">
          Indexed notes using this tag.
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="dashboard-empty">
          <p className="dashboard-empty-text">No notes found for this tag.</p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="dashboard-note-card"
            >
              <div className="dashboard-note-card-icon">{note.icon ?? "Note"}</div>
              <div className="dashboard-note-card-title">{note.title}</div>
              <div className="dashboard-note-card-date">
                {new Date(note.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
