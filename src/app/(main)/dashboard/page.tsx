import Link from "next/link";
import { redirect } from "next/navigation";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import { createNoteAction, getNotesAction } from "@/server/api/notes";
import { getTemplatesAction } from "@/server/api/templates";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const [notes, templates] = await Promise.all([
    getNotesAction(),
    getTemplatesAction(),
  ]);
  const noteCount = notes.length;
  const templateCount = templates.length;

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
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Notların</h1>
          <p className="dashboard-subtitle">
            Bilgi ağını oluştur, bağla, yayımla ve düzenle.
          </p>
        </div>

        <div className="dashboard-stat-row">
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{noteCount}</span>
            <span className="dashboard-stat-label">toplam not</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{templateCount}</span>
            <span className="dashboard-stat-label">hazır şablon</span>
          </div>
        </div>

        <div className="dashboard-quick-actions">
          <form action={handleCreateNote}>
            <button type="submit" className="dashboard-empty-btn">
              <span>+</span> Boş Not
            </button>
          </form>
          <TemplatePicker
            templates={templateSummaries}
            buttonLabel="Şablondan Oluştur"
            buttonClassName="dashboard-secondary-btn"
          />
        </div>
      </section>

      {notes.length === 0 ? (
        <div className="dashboard-empty">
          <div className="dashboard-empty-icon">Başla</div>
          <p className="dashboard-empty-text">
            Henüz not yok. Boş bir not oluştur ya da hazır bir şablon seç.
          </p>
        </div>
      ) : (
        <>
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Son Güncellenenler</span>
          </div>
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
        </>
      )}
    </div>
  );
}
