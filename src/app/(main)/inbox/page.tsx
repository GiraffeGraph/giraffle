import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { formatDate } from "@/lib/utils";
import { getNotesAction } from "@/server/api/notes";

export default async function InboxPage() {
  const notes = await getNotesAction();
  const inboxNotes = notes.filter((note) => !note.folderId);

  return (
    <>
      <PageTopbar icon="inbox" label="Inbox" />
      <div className="dashboard search-page app-page">

      <section className="search-section">
        <div className="dashboard-section-head search-section-head">
          <span className="dashboard-section-kicker">Notes</span>
          <span className="search-section-count">{inboxNotes.length}</span>
        </div>

        <div className="search-result-grid">
          {inboxNotes.length === 0 ? (
            <div className="dashboard-empty">
              <p className="dashboard-empty-text">
                Your inbox is empty right now. Notes you create without a folder will appear here.
              </p>
            </div>
          ) : (
            inboxNotes.map((note) => (
              <Link key={note.id} href={`/notes/${note.id}`} className="search-result-card">
                <span className="search-result-title">{note.title}</span>
                <span className="search-result-meta">
                  {note.isPinned ? "Pinned · " : ""}
                  Last updated {formatDate(note.updatedAt)}
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
