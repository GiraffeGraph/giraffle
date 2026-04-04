import Link from "next/link";
import { getAllFoldersAction } from "@/server/api/folders";
import { getUnresolvedLinksAction } from "@/server/api/graph";
import { getNotesAction } from "@/server/api/notes";
import { getTemplatesAction } from "@/server/api/templates";

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

  return (
    <div className="dashboard search-page">
      <section className="dashboard-hero search-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">Arama</div>
          <h1 className="dashboard-title">Calisma alani aramasi</h1>
          <p className="dashboard-subtitle">
            Notlar, klasorler, sablonlar ve cozulmemis baglantilar arasinda ara.
          </p>
        </div>

        <form className="search-form">
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            className="search-input"
            placeholder="Baslik, etiket, sablon veya link ara..."
          />
          <select name="scope" defaultValue={scope} className="search-select">
            <option value="all">Tum sonuclar</option>
            <option value="notes">Notlar</option>
            <option value="folders">Klasorler</option>
            <option value="templates">Sablonlar</option>
            <option value="unresolved">Cozulmemis linkler</option>
          </select>
          <button type="submit" className="dashboard-empty-btn">
            Ara
          </button>
        </form>
      </section>

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
        <SearchSection title="Klasorler" count={folderResults.length}>
          {folderResults.map((folder) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="search-result-card"
            >
              <span className="search-result-title">{folder.name}</span>
              <span className="search-result-meta">Klasor</span>
            </Link>
          ))}
        </SearchSection>
      )}

      {(scope === "all" || scope === "templates") && (
        <SearchSection title="Sablonlar" count={templateResults.length}>
          {templateResults.map((template) => (
            <Link
              key={template.id}
              href={`/templates?selected=${template.id}`}
              className="search-result-card"
            >
              <span className="search-result-title">{template.name}</span>
              <span className="search-result-meta">{template.category}</span>
            </Link>
          ))}
        </SearchSection>
      )}

      {(scope === "all" || scope === "unresolved") && (
        <SearchSection
          title="Cozulmemis baglantilar"
          count={unresolvedResults.length}
        >
          {unresolvedResults.map((item) => (
            <div key={item.targetRaw} className="search-result-card">
              <span className="search-result-title">{item.targetRaw}</span>
              <span className="search-result-meta">{item.count} notta geciyor</span>
            </div>
          ))}
        </SearchSection>
      )}
    </div>
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
      <div className="dashboard-section-head">
        <span className="dashboard-section-kicker">
          {title} ({count})
        </span>
      </div>
      <div className="search-result-grid">
        {count === 0 ? <div className="dashboard-empty">Sonuc yok.</div> : children}
      </div>
    </section>
  );
}
