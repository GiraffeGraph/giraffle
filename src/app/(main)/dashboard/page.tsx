import Link from "next/link";
import { getNotesAction } from "@/server/api/notes";
import { createNoteAction } from "@/server/api/notes";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const notes = await getNotesAction();

  async function handleCreateNote() {
    "use server";
    const noteId = await createNoteAction();
    redirect(`/notes/${noteId}`);
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Your Notes</h1>
        <p className="dashboard-subtitle">
          Create, link, and organize your knowledge
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="dashboard-empty">
          <div className="dashboard-empty-icon">🦒</div>
          <p className="dashboard-empty-text">
            No notes yet. Start building your knowledge graph.
          </p>
          <form action={handleCreateNote}>
            <button type="submit" className="dashboard-empty-btn">
              <span>+</span> Create First Note
            </button>
          </form>
        </div>
      ) : (
        <div className="dashboard-grid">
          {notes.map((note: { id: string; title: string; icon: string | null; updatedAt: Date }) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="dashboard-note-card"
            >
              <div className="dashboard-note-card-icon">
                {note.icon ?? "📄"}
              </div>
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
