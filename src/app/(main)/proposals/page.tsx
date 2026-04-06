import Link from "next/link";
import { createReplaceDocumentProposalAction, getWorkspaceProposalsAction } from "@/server/api/proposals";
import { getNotesAction } from "@/server/api/notes";

export default async function ProposalsPage() {
  const [proposals, notes] = await Promise.all([
    getWorkspaceProposalsAction(),
    getNotesAction(),
  ]);

  async function handleCreateProposal(formData: FormData) {
    "use server";
    await createReplaceDocumentProposalAction({
      noteId: String(formData.get("noteId") ?? ""),
      title: String(formData.get("title") ?? "").trim() || "Yeni önerilen değişiklik",
      summary: String(formData.get("summary") ?? "").trim() || undefined,
      markdown: String(formData.get("markdown") ?? "").trim(),
    });
  }

  return (
    <div className="dashboard proposals-page">
      <div className="templates-layout">
        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Yeni önerilen belge</span>
          </div>
          <form action={handleCreateProposal} className="settings-panel">
            <label className="settings-field">
              <span>Not</span>
              <select name="noteId" required>
                {notes.map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>Öneri başlığı</span>
              <input name="title" placeholder="Öneri başlığı" />
            </label>
            <label className="settings-field">
              <span>Özet</span>
              <textarea name="summary" rows={3} placeholder="Neyi değiştiriyor?" />
            </label>
            <label className="settings-field">
              <span>Önerilen Markdown</span>
              <textarea name="markdown" rows={12} placeholder="# Yeni içerik" required />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Öneri oluştur
            </button>
          </form>
        </section>

        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Bekleyen öneriler</span>
          </div>
          <div className="search-result-grid">
            {proposals.map((proposal) => (
              <Link
                key={proposal.id}
                href={`/notes/${proposal.noteId}`}
                className="search-result-card"
              >
                <span className="search-result-title">{proposal.title}</span>
                <span className="search-result-meta">
                  {proposal.note.title} · {proposal.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
