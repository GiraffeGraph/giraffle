import Link from "next/link";
import { getPublishedExportsAction } from "@/server/api/notes";

export default async function PublishPage() {
  const exports = await getPublishedExportsAction();

  return (
    <div className="dashboard publish-page">
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">Yayın</div>
          <h1 className="dashboard-title">Yayımdaki notlar</h1>
          <p className="dashboard-subtitle">
            Slug, yayın yolu ve dışa aktarılan çıktıyı tek yerden gör.
          </p>
        </div>
      </section>

      <div className="search-result-grid">
        {exports.length === 0 ? (
          <div className="dashboard-empty">Yayında not yok.</div>
        ) : (
          exports.map((artifact) => (
            <div key={artifact.noteId} className="search-result-card publish-card">
              <span className="search-result-title">{artifact.title}</span>
              <span className="search-result-meta">{artifact.publishPath}</span>
              <div className="publish-card-actions">
                <Link href={`/published/${artifact.publishPath.replace(/\.mdx$/, "")}`}>
                  Açık bağlantı
                </Link>
                <Link href={`/notes/${artifact.noteId}`}>Notu aç</Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
