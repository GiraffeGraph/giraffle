import Link from "next/link";
import { redirect } from "next/navigation";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import { createNoteAction, getNotesAction } from "@/server/api/notes";
import { getTemplatesAction } from "@/server/api/templates";

export default async function DashboardPage() {
  const [notes, templates] = await Promise.all([
    getNotesAction(),
    getTemplatesAction(),
  ]);

  async function handleCreateNote() {
    "use server";
    const noteId = await createNoteAction();
    redirect(`/notes/${noteId}`);
  }

  const templateSummaries = templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    icon: template.icon,
    variables: template.variables as Array<{
      name: string;
      label: string;
      type: "text" | "date" | "select";
      defaultValue?: string;
      options?: string[];
    }>,
  }));

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Your Notes</h1>
        <p className="dashboard-subtitle">
          Create, link, publish, and organize your knowledge graph.
        </p>
      </div>

      <div className="dashboard-quick-actions">
        <form action={handleCreateNote}>
          <button type="submit" className="dashboard-empty-btn">
            <span>+</span> Blank Note
          </button>
        </form>
        <TemplatePicker
          templates={templateSummaries}
          buttonLabel="Create From Template"
          buttonClassName="dashboard-secondary-btn"
        />
      </div>

      {notes.length === 0 ? (
        <div className="dashboard-empty">
          <div className="dashboard-empty-icon">Start</div>
          <p className="dashboard-empty-text">
            No notes yet. Create a blank note or use a seeded template.
          </p>
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
