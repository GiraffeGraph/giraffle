import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getWorkspaceProposalsAction } from "@/server/api/proposals";

export default async function ProposalsPage() {
  const proposals = await getWorkspaceProposalsAction();

  return (
    <>
      <PageTopbar icon="auto_awesome" label="Öneriler" />
      <div className="dashboard proposals-page app-page">

      {proposals.length === 0 ? (
        <div className="dashboard-empty">
          <p className="dashboard-empty-text">Henüz öneri yok.</p>
        </div>
      ) : (
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
      )}
    </div>
    </>
  );
}
