import Link from "next/link";
import { AppPageHeader } from "@/components/ui/AppPageHeader";
import { getNotesAction } from "@/server/api/notes";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const notes = await getNotesAction();

  return (
    <div className="dashboard app-page">
      <AppPageHeader
        eyebrow="Çalışma alanı"
        title="Pano"
        description="Son dokunulan notlara, taslaklara ve çalışma alanının ana akışına hızlıca geri dön."
        meta={`${notes.length} not`}
      />

      {notes.length === 0 ? (
        <div className="dashboard-empty">
          <div className="dashboard-empty-icon">Boş</div>
          <p className="dashboard-empty-text">
            Henüz not yok. Boş bir not oluştur ya da hazır bir şablon seç.
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
              <div className="dashboard-note-card-icon">{note.icon ?? "Not"}</div>
              <div className="dashboard-note-card-body">
                <div className="dashboard-note-card-title">{note.title}</div>
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
