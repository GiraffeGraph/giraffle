import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { getNotesForTagAction } from "@/server/api/tags";
import { formatDate } from "@/lib/utils";

interface TagPageProps {
  params: Promise<{ tagName: string }>;
}

export default async function TagPage({ params }: TagPageProps) {
  const { tagName } = await params;
  const notes = await getNotesForTagAction(tagName);

  return (
    <>
      <PageTopbar icon="label" label={`#${tagName}`} />
      <div className="dashboard">
      {notes.length === 0 ? (
        <div className="dashboard-empty">
          <p className="dashboard-empty-text">No notes were found for this tag.</p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="dashboard-note-card"
            >
              <div className="dashboard-note-card-icon">
                {renderStoredIcon(note.icon, {
                  fallback: <span className="material-symbols-outlined" aria-hidden="true">description</span>,
                  materialClassName: "material-symbols-outlined",
                  emojiStyle: { fontSize: "22px", lineHeight: 1 },
                })}
              </div>
              <div className="dashboard-note-card-title">{note.title}</div>
              <div className="dashboard-note-card-date">
                {formatDate(new Date(note.updatedAt))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
