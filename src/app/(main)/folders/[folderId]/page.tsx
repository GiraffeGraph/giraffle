import Link from "next/link";
import { notFound } from "next/navigation";
import { getFolderAction } from "@/server/api/folders";
import { formatDate } from "@/lib/utils";

interface FolderPageProps {
  params: Promise<{ folderId: string }>;
}

export default async function FolderPage({ params }: FolderPageProps) {
  const { folderId } = await params;
  const folder = await getFolderAction(folderId);

  if (!folder) {
    notFound();
  }

  const resolvedFolder = folder;

  return (
    <div className="dashboard">
      {resolvedFolder.children.length > 0 ? (
        <div className="folder-children-grid">
          {resolvedFolder.children.map((childFolder) => (
            <Link
              key={childFolder.id}
              href={`/folders/${childFolder.id}`}
              className="dashboard-note-card"
            >
              <div className="dashboard-note-card-icon">
                {childFolder.icon ?? <span className="material-symbols-outlined" aria-hidden="true">folder</span>}
              </div>
              <div className="dashboard-note-card-title">{childFolder.name}</div>
            </Link>
          ))}
        </div>
      ) : null}

      {resolvedFolder.notes.length === 0 ? (
        <div className="dashboard-empty">
          <p className="dashboard-empty-text">Bu klasörde henüz not yok.</p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {resolvedFolder.notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="dashboard-note-card"
            >
              <div className="dashboard-note-card-icon">
                {note.icon ?? <span className="material-symbols-outlined" aria-hidden="true">description</span>}
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
  );
}
