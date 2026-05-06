import Link from "next/link";
import type { ParsedWorkspaceSearchQuery } from "@/domain/search/search.service";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { searchWorkspaceNotesAction } from "@/server/api/search";

const SEARCH_OPERATOR_EXAMPLES = [
  'folder:"Product"',
  'title:weekly',
  'is:pinned',
  '"launch plan"',
  '/roadmap|plan/i',
] as const;

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

function buildAppliedFilterPills(query: ParsedWorkspaceSearchQuery) {
  const pills: string[] = [];

  for (const folder of query.folderFilters) pills.push(`folder:${folder}`);
  for (const title of query.titleFilters) pills.push(`title:${title}`);
  for (const phrase of query.phrases) pills.push(`"${phrase}"`);
  if (query.isPinned === true) pills.push("is:pinned");
  for (const token of query.negativeTokens) pills.push(`-${token}`);
  for (const folder of query.excludedFolders) pills.push(`-folder:${folder}`);
  for (const title of query.excludedTitles) pills.push(`-title:${title}`);

  return pills;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const searchResult = await searchWorkspaceNotesAction(query, {
    limit: query ? 80 : 32,
  });
  const appliedFilters = buildAppliedFilterPills(searchResult.parsed);

  return (
    <>
      <PageTopbar
        icon="search"
        label="Search"
        meta={
          <span style={{ whiteSpace: "nowrap" }}>
            {searchResult.hits.length} ranked · {getSearchModeLabel(searchResult.mode)}
          </span>
        }
      />
      <div className="dashboard search-page app-page">
        <form action="/search" className="search-form" style={{ marginTop: 0 }}>
          <input
            name="q"
            defaultValue={query}
            className="search-input"
            placeholder="Search notes, folders, regex…"
          />
          <input type="hidden" name="scope" value="notes" />
          <button type="submit">Search</button>
        </form>

        <div className="dashboard-quick-actions" style={{ marginTop: "12px" }}>
          {SEARCH_OPERATOR_EXAMPLES.map((example) => (
            <Link key={example} href={`/search?q=${encodeURIComponent(example)}&scope=notes`} className="dashboard-secondary-btn">
              {example}
            </Link>
          ))}
        </div>

        {appliedFilters.length > 0 ? (
          <div className="dashboard-quick-actions" style={{ marginTop: "12px" }}>
            {appliedFilters.map((filter) => (
              <span key={filter} className="dashboard-secondary-btn" style={{ cursor: "default" }}>
                {filter}
              </span>
            ))}
          </div>
        ) : null}

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
                Sonuç bulunamadı.
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
                    {" · score "}
                    {note.score}
                    {note.isPinned ? " · pinned" : ""}
                    {note.folderPath ? ` · ${note.folderPath}` : ""}
                  </span>
                  {note.reasons.length > 0 ? (
                    <span className="search-result-meta">
                      {note.reasons.map((reason) => reason.label).join(" · ")}
                    </span>
                  ) : null}
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
