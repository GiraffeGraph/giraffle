import Link from "next/link";
import { getPublishedExportsAction } from "@/server/api/notes";

export default async function PublishPage() {
  const exports = await getPublishedExportsAction();

  return (
    <div className="dashboard publish-page">
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">Publish</div>
          <h1 className="dashboard-title">Yayindaki notlar</h1>
          <p className="dashboard-subtitle">
            Slug, publish path ve downstream export ciktisini tek yerden gor.
          </p>
        </div>
      </section>

      <div className="search-result-grid">
        {exports.length === 0 ? (
          <div className="dashboard-empty">Yayinda not yok.</div>
        ) : (
          exports.map((artifact) => (
            <div key={artifact.noteId} className="search-result-card publish-card">
              <span className="search-result-title">{artifact.title}</span>
              <span className="search-result-meta">{artifact.publishPath}</span>
              <div className="publish-card-actions">
                <Link href={`/published/${artifact.publishPath.replace(/\.mdx$/, "")}`}>
                  Public route
                </Link>
                <Link href={`/notes/${artifact.noteId}`}>Notu ac</Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
