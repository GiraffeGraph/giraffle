import { PageTopbar } from "@/components/ui/PageTopbar";
import { SpotterWorkspace } from "@/components/spotter/SpotterWorkspace";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";
import { getSpotterSessionAction } from "@/server/api/spotter";

export default async function SpotterPage({
  searchParams,
}: PageProps<"/spotter">) {
  const { session } = await searchParams;
  const activeSessionId = typeof session === "string" ? session : null;
  const [notes, folders, activeSession] = await Promise.all([
    getNotesAction(),
    getAllFoldersAction(),
    activeSessionId ? getSpotterSessionAction(activeSessionId) : null,
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
      <PageTopbar icon="smart_toy" label="Spotter" actions={topbarActions} />
      <SpotterWorkspace
        key={activeSession?.id ?? "new"}
        initialSessionId={activeSession?.id ?? null}
        initialMessages={
          activeSession?.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          })) ?? []
        }
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
