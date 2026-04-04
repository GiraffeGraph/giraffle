import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import { getFolderAction } from "@/server/api/folders";
import { createNoteAction } from "@/server/api/notes";
import { getTemplatesAction } from "@/server/api/templates";
import { formatDate } from "@/lib/utils";

interface FolderPageProps {
  params: Promise<{ folderId: string }>;
}

export default async function FolderPage({ params }: FolderPageProps) {
  const { folderId } = await params;
  const [folder, templates] = await Promise.all([
    getFolderAction(folderId),
    getTemplatesAction(),
  ]);

  if (!folder) {
    notFound();
  }

  const resolvedFolder = folder;

  async function handleCreateNote() {
    "use server";
    const noteId = await createNoteAction({
      folderId: resolvedFolder.id,
    });
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
        <h1 className="dashboard-title">{resolvedFolder.name}</h1>
        <p className="dashboard-subtitle">
          {resolvedFolder.notes.length} not · {resolvedFolder.children.length} alt
          klasör
        </p>
      </div>

      <div className="dashboard-quick-actions">
        <form action={handleCreateNote}>
          <button type="submit" className="dashboard-empty-btn">
            <span>+</span> Burada Yeni Not
          </button>
        </form>
        <TemplatePicker
          templates={templateSummaries}
          folderId={resolvedFolder.id}
          buttonLabel="Bu Klasörde Şablon"
          buttonClassName="dashboard-secondary-btn"
        />
      </div>

      {resolvedFolder.children.length > 0 ? (
        <div className="folder-children-grid">
          {resolvedFolder.children.map((childFolder) => (
            <Link
              key={childFolder.id}
              href={`/folders/${childFolder.id}`}
              className="dashboard-note-card"
            >
              <div className="dashboard-note-card-icon">{childFolder.icon ?? "Kls"}</div>
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
              <div className="dashboard-note-card-icon">{note.icon ?? "Not"}</div>
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
