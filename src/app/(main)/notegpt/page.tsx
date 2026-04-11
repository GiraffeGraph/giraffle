import { PageTopbar } from "@/components/ui/PageTopbar";
import { NoteGptWorkspace } from "@/components/notegpt/NoteGptWorkspace";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";

export default async function NoteGptPage() {
  const [notes, folders] = await Promise.all([
    getNotesAction(),
    getAllFoldersAction(),
  ]);

  const topbarActions = (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        padding: "2px 9px", borderRadius: "999px",
        background: "var(--surface-glass-soft)",
        border: "1px solid var(--border-soft)",
        fontSize: "11px", fontWeight: 700,
        color: "var(--text-secondary)",
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: "12px" }} aria-hidden="true">description</span>
        {notes.length} not
      </span>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        padding: "2px 9px", borderRadius: "999px",
        background: "var(--surface-glass-soft)",
        border: "1px solid var(--border-soft)",
        fontSize: "11px", fontWeight: 700,
        color: "var(--text-secondary)",
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: "12px" }} aria-hidden="true">folder</span>
        {folders.length} klasör
      </span>
    </div>
  );

  return (
    <>
      <PageTopbar icon="smart_toy" label="NoteGPT" actions={topbarActions} />
      <NoteGptWorkspace
      notes={notes.map((note) => ({
        id: note.id,
        title: note.title,
        icon: note.icon,
        folderId: note.folderId ?? null,
        updatedAtLabel: note.updatedAt.toISOString(),
      }))}
      folders={folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        parentId: folder.parentId ?? null,
      }))}
    />
    </>
  );
}
