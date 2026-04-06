import Link from "next/link";
import { redirect } from "next/navigation";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import { createNoteAction, getNotesAction } from "@/server/api/notes";
import { getTemplatesAction } from "@/server/api/templates";
import { formatDate } from "@/lib/utils";

export default async function InboxPage() {
  const [notes, templates] = await Promise.all([
    getNotesAction(),
    getTemplatesAction(),
  ]);

  const inboxNotes = notes.filter((note) => !note.folderId);

  async function handleCreateNote() {
    "use server";
    const noteId = await createNoteAction();
    redirect(`/notes/${noteId}`);
  }

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">Varsayılan yerleşim</div>
          <h1 className="dashboard-title">Gelen kutusu</h1>
          <p className="dashboard-subtitle">
            Klasöre taşınmamış notlar önce burada toplanır.
          </p>
        </div>

        <div className="dashboard-quick-actions">
          <form action={handleCreateNote}>
            <button type="submit" className="dashboard-empty-btn">
              Yeni not
            </button>
          </form>
          <TemplatePicker
            templates={templates.map((template) => ({
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
            }))}
            buttonLabel="Şablondan not"
            buttonClassName="dashboard-secondary-btn"
          />
        </div>
      </section>

      {inboxNotes.length === 0 ? (
        <div className="dashboard-empty">
          <p className="dashboard-empty-text">
            Gelen kutusu boş. Yeni notlar varsayılan olarak burada başlar.
          </p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {inboxNotes.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`} className="dashboard-note-card">
              <div className="dashboard-note-card-icon">{note.icon ?? "Not"}</div>
              <div className="dashboard-note-card-body">
                <div className="dashboard-note-card-title">
                  {note.isPinned ? "Pinli · " : ""}
                  {note.title}
                </div>
                <div className="dashboard-note-card-date">
                  {formatDate(new Date(note.updatedAt))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
