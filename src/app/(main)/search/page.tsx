import Link from "next/link";
import type { ParsedWorkspaceSearchQuery } from "@/domain/search/search.service";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { formatDate } from "@/lib/utils";
import { searchWorkspaceNotesAction } from "@/server/api/search";

const SEARCH_OPERATOR_EXAMPLES = [
  'path:"Product"',
  "title:weekly",
  "is:pinned",
  '"launch plan"',
  "/roadmap|plan/i",
] as const;

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

function buildAppliedFilters(query: ParsedWorkspaceSearchQuery) {
  const filters: string[] = [];

  for (const path of query.pathFilters) filters.push(`path:${path}`);
  for (const title of query.titleFilters) filters.push(`title:${title}`);
  for (const phrase of query.phrases) filters.push(`"${phrase}"`);
  if (query.isPinned === true) filters.push("is:pinned");
  for (const token of query.negativeTokens) filters.push(`-${token}`);
  for (const path of query.excludedPaths) filters.push(`-path:${path}`);
  for (const title of query.excludedTitles) filters.push(`-title:${title}`);

  return filters;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const searchResult = await searchWorkspaceNotesAction(query, {
    limit: query ? 80 : 24,
  });
  const appliedFilters = buildAppliedFilters(searchResult.parsed);

  return (
    <>
      <PageTopbar
        icon="search"
        label="Search"
        meta={
          query ? (
            <span className="page-topbar-nowrap">
              {searchResult.hits.length} results
            </span>
          ) : null
        }
      />
      <div className="search-page app-page notes-index-page">
        <header className="workspace-heading notes-index-heading">
          <div className="workspace-heading-copy">
            <h1>Search notes</h1>
            <p>Find a page by title, content, or where it lives.</p>
          </div>
        </header>

        <form action="/search" className="search-form search-form--primary">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            name="q"
            defaultValue={query}
            className="search-input"
            placeholder="Search your workspace"
            autoFocus
            aria-label="Search notes"
          />
          <button type="submit">Search</button>
        </form>

        <details className="search-advanced">
          <summary>Advanced search</summary>
          <div className="search-advanced-content">
            <p>Use filters only when a regular search is not enough.</p>
            <div className="search-filter-row">
              {SEARCH_OPERATOR_EXAMPLES.map((example) => (
                <Link
                  key={example}
                  href={`/search?q=${encodeURIComponent(example)}`}
                  className="search-filter-example"
                >
                  {example}
                </Link>
              ))}
            </div>
          </div>
        </details>

        {appliedFilters.length > 0 ? (
          <div className="search-applied-filters" aria-label="Applied filters">
            {appliedFilters.map((filter) => (
              <span key={filter}>{filter}</span>
            ))}
          </div>
        ) : null}

        <section className="search-section">
          <div className="dashboard-section-head search-section-head">
            <span className="dashboard-section-kicker">
              {query ? "Results" : "Recently updated"}
            </span>
            <span className="search-section-count">{searchResult.hits.length}</span>
          </div>

          {searchResult.regexError ? (
            <div className="search-inline-error">
              Invalid regular expression: {searchResult.regexError}
            </div>
          ) : null}

          <div className="search-result-grid">
            {searchResult.hits.length === 0 ? (
              <div className="dashboard-empty">
                <p className="dashboard-empty-text">
                  No matching notes. Try fewer words or remove a filter.
                </p>
              </div>
            ) : (
              searchResult.hits.map((note) => (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className="search-result-card search-result-card--simple"
                >
                  <span className="search-result-main">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      description
                    </span>
                    <span className="search-result-title">{note.title}</span>
                  </span>
                  {note.snippet ? (
                    <span className="search-result-snippet">{note.snippet}</span>
                  ) : null}
                  <span className="search-result-meta">
                    {note.parentPath ?? "Workspace"}
                    {note.isPinned ? " · Pinned" : ""}
                    {` · ${formatDate(note.updatedAt)}`}
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
