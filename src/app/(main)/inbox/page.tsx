import Link from "next/link";
import { AppPageHeader } from "@/components/ui/AppPageHeader";
import { getNotesAction } from "@/server/api/notes";
import { formatDate } from "@/lib/utils";

export default async function InboxPage() {
  const notes = await getNotesAction();
  const inboxNotes = notes.filter((note) => !note.folderId);

  return (
    <div className="dashboard app-page">
      <AppPageHeader
        eyebrow="Yakalama"
        title="Gelen kutusu"
        description="Klasörsüz notlar önce burada toplanır. Düzenlemeden önce hızlı yakalama alanı olarak kullan."
        meta={`${inboxNotes.length} not`}
      />

      {inboxNotes.length === 0 ? (
        <div className="dashboard-empty">
          <p className="dashboard-empty-text">
            Gelen kutusu boş. Yeni notlar varsayılan olarak burada başlar.
          </p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {inboxNotes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="dashboard-note-card"
            >
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
