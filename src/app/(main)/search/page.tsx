import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getAllFoldersAction } from "@/server/api/folders";
import { getUnresolvedLinksAction } from "@/server/api/graph";
import { getNotesAction } from "@/server/api/notes";
import { getTemplatesAction } from "@/server/api/templates";
import { getTemplateCategoryLabel } from "@/lib/template-category";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    scope?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const scope = params.scope ?? "all";

  const [notes, folders, templates, unresolved] = await Promise.all([
    getNotesAction(),
    getAllFoldersAction(),
    getTemplatesAction(),
    getUnresolvedLinksAction(),
  ]);

  const noteResults = notes.filter((note) =>
    query ? note.title.toLowerCase().includes(query) : true
  );
  const folderResults = folders.filter((folder) =>
    query ? folder.name.toLowerCase().includes(query) : true
  );
  const templateResults = templates.filter((template) =>
    query
      ? `${template.name} ${template.description ?? ""}`
          .toLowerCase()
          .includes(query)
      : true
  );
  const unresolvedResults = unresolved.filter((item) =>
    query ? item.targetRaw.toLowerCase().includes(query) : true
  );
  const totalResults =
    noteResults.length +
    folderResults.length +
    templateResults.length +
    unresolvedResults.length;

  return (
    <>
      <PageTopbar icon=”search” label=”Arama” currentPath=”/search” />
      <div className=”dashboard search-page app-page”>

      {(scope === "all" || scope === "notes") && (
        <SearchSection title="Notlar" count={noteResults.length}>
          {noteResults.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`} className="search-result-card">
              <span className="search-result-title">{note.title}</span>
              <span className="search-result-meta">
                {note.isPinned ? "Pinli" : "Not"}
              </span>
            </Link>
          ))}
        </SearchSection>
      )}

      {(scope === "all" || scope === "folders") && (
        <SearchSection title="Klasörler" count={folderResults.length}>
          {folderResults.map((folder) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="search-result-card"
            >
              <span className="search-result-title">{folder.name}</span>
              <span className="search-result-meta">Klasör</span>
            </Link>
          ))}
        </SearchSection>
      )}

      {(scope === "all" || scope === "templates") && (
        <SearchSection title="Şablonlar" count={templateResults.length}>
          {templateResults.map((template) => (
            <Link
              key={template.id}
              href={`/templates?selected=${template.id}`}
              className="search-result-card"
            >
              <span className="search-result-title">{template.name}</span>
              <span className="search-result-meta">
                {getTemplateCategoryLabel(template.category)}
              </span>
            </Link>
          ))}
        </SearchSection>
      )}

      {(scope === "all" || scope === "unresolved") && (
        <SearchSection
          title="Çözülmemiş bağlantılar"
          count={unresolvedResults.length}
        >
          {unresolvedResults.map((item) => (
            <div key={item.targetRaw} className="search-result-card">
              <span className="search-result-title">{item.targetRaw}</span>
              <span className="search-result-meta">{item.count} notta geçiyor</span>
            </div>
          ))}
        </SearchSection>
      )}
    </div>
    </>
  );
}

function SearchSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="search-section">
      <div className="dashboard-section-head search-section-head">
        <span className="dashboard-section-kicker">{title}</span>
        <span className="search-section-count">{count}</span>
      </div>
      <div className="search-result-grid">
        {count === 0 ? <div className="dashboard-empty">Sonuç yok.</div> : children}
      </div>
    </section>
  );
}
