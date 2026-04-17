import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { searchWorkspaceNotesAction } from "@/server/api/search";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    scope?: string;
  }>;
}

function getSearchModeLabel(mode: "recent" | "hybrid" | "regex") {
  if (mode === "recent") {
    return "Recent notes";
  }

  if (mode === "regex") {
    return "Regex mode";
  }

  return "Hybrid mode";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const searchResult = await searchWorkspaceNotesAction(query, {
    limit: query ? 80 : 32,
  });

  return (
    <>
      <PageTopbar
        icon="search"
        label="Search"
        meta={
          <span style={{ whiteSpace: "nowrap" }}>
            {searchResult.hits.length} results · {getSearchModeLabel(searchResult.mode)}
          </span>
        }
      />
      <div className="dashboard search-page app-page">
        <section className="search-section">
          <div className="dashboard-section-head search-section-head">
            <span className="dashboard-section-kicker">Notes</span>
            <span className="search-section-count">{searchResult.hits.length}</span>
          </div>

          {searchResult.regexError ? (
            <div className="dashboard-empty">
              Regex hatası: {searchResult.regexError}
            </div>
          ) : null}

          <div className="search-result-grid">
            {searchResult.hits.length === 0 ? (
              <div className="dashboard-empty">
                Sonuç bulunamadı. <strong>/search /pattern/i</strong> veya düz metinle yeniden deneyin.
              </div>
            ) : (
              searchResult.hits.map((note) => (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className="search-result-card"
                >
                  <span className="search-result-title">{note.title}</span>
                  <span className="search-result-meta">
                    {note.mode === "regex" ? "Regex" : note.mode === "hybrid" ? "Hybrid" : "Recent"}
                    {" · "}
                    score {note.score}
                    {note.isPinned ? " · pinned" : ""}
                  </span>
                  <span className="search-result-meta" style={{ lineHeight: 1.5 }}>
                    {note.snippet}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
