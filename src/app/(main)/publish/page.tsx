import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getPublishedExportsAction } from "@/server/api/notes";

export default async function PublishPage() {
  const exports = await getPublishedExportsAction();

  return (
    <>
      <PageTopbar icon="publish" label="Publications" />
      <div className="dashboard publish-page app-page">

      <div className="search-result-grid">
        {exports.length === 0 ? (
          <div className="dashboard-empty">No published notes yet.</div>
        ) : (
          exports.map((artifact) => (
            <div key={artifact.noteId} className="search-result-card publish-card">
              <span className="search-result-title">{artifact.title}</span>
              <span className="search-result-meta">{artifact.publishPath}</span>
              <div className="publish-card-actions">
                <Link href={`/published/${artifact.publishPath.replace(/\.mdx$/, "")}`}>
                  Open link
                </Link>
                <Link href={`/notes/${artifact.noteId}`}>Open note</Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    </>
  );
}
