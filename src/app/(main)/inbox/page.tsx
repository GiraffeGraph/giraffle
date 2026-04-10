import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { formatDate } from "@/lib/utils";
import { getNotesAction } from "@/server/api/notes";

export default async function InboxPage() {
  const notes = await getNotesAction();
  const inboxNotes = notes.filter((note) => !note.folderId);

  return (
    <>
      <PageTopbar icon="inbox" label="Gelen kutusu" />
      <div className="dashboard search-page app-page">

      <section className="search-section">
        <div className="dashboard-section-head search-section-head">
          <span className="dashboard-section-kicker">Notlar</span>
          <span className="search-section-count">{inboxNotes.length}</span>
        </div>

        <div className="search-result-grid">
          {inboxNotes.length === 0 ? (
            <div className="dashboard-empty">
              <p className="dashboard-empty-text">
                Gelen kutusu şu an boş. Klasörsüz oluşturduğun notlar burada görünecek.
              </p>
            </div>
          ) : (
            inboxNotes.map((note) => (
              <Link key={note.id} href={`/notes/${note.id}`} className="search-result-card">
                <span className="search-result-title">{note.title}</span>
                <span className="search-result-meta">
                  {note.isPinned ? "Pinli · " : ""}
                  Son güncelleme {formatDate(note.updatedAt)}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
    </>
  );
}
