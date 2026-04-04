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
      title: String(formData.get("title") ?? "").trim() || "Yeni onerilen degisiklik",
      summary: String(formData.get("summary") ?? "").trim() || undefined,
      markdown: String(formData.get("markdown") ?? "").trim(),
    });
  }

  return (
    <div className="dashboard proposals-page">
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">AI proposal workflow</div>
          <h1 className="dashboard-title">Oneri kuyrugu</h1>
          <p className="dashboard-subtitle">
            Onerileri direkt editor state yerine review edilip apply edilecek patchler olarak yonet.
          </p>
        </div>
      </section>

      <div className="templates-layout">
        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Yeni onerilen belge</span>
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
              <span>Oneri basligi</span>
              <input name="title" placeholder="Oneri basligi" />
            </label>
            <label className="settings-field">
              <span>Ozet</span>
              <textarea name="summary" rows={3} placeholder="Neyi degistiriyor?" />
            </label>
            <label className="settings-field">
              <span>Onerilen Markdown</span>
              <textarea name="markdown" rows={12} placeholder="# Yeni icerik" required />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Oneri olustur
            </button>
          </form>
        </section>

        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Bekleyen oneriler</span>
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
