import { PageTopbar } from "@/components/ui/PageTopbar";
import { AgentPanel } from "@/components/spotter/AgentPanel";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";

export default async function SpotterPage() {
  const [notes, folders] = await Promise.all([getNotesAction(), getAllFoldersAction()]);

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
        {notes.length} notes
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
        {folders.length} folders
      </span>
    </div>
  );

  return (
    <>
      <PageTopbar icon="smart_toy" label="Spotter" actions={topbarActions} />
      <AgentPanel />
    </>
  );
}
