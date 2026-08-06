import Link from "next/link";
import { redirect } from "next/navigation";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { Button } from "@/components/ui/Button";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { formatDate } from "@/lib/utils";
import { createNoteAction, getNotesAction } from "@/server/api/notes";

export default async function NotesPage() {
  const notes = await getNotesAction();
  const pagePaths = buildPagePaths(notes);

  async function createNewPage() {
    "use server";

    const noteId = await createNoteAction();
    redirect(`/notes/${noteId}`);
  }

  const newPageForm = (
    <form action={createNewPage} className="notes-new-page-form">
      <Button type="submit">
        <span className="material-symbols-outlined" aria-hidden="true">
          add
        </span>
        New page
      </Button>
    </form>
  );

  return (
    <>
      <PageTopbar icon="description" label="Notes" actions={newPageForm} />
      <div className="app-page notes-index-page">
        <header className="workspace-heading notes-index-heading">
          <div className="workspace-heading-copy">
            <h1>All notes</h1>
            <p>
              {notes.length === 1
                ? "1 page in your workspace"
                : `${notes.length} pages in your workspace`}
            </p>
          </div>
        </header>

        {notes.length === 0 ? (
          <div className="notes-index-empty">
            <span className="material-symbols-outlined" aria-hidden="true">
              description
            </span>
            <h2>Create your first page</h2>
            <p>Start writing here. Nest pages inside each other when you need structure.</p>
            {newPageForm}
          </div>
        ) : (
          <section className="notes-index-list" aria-label="All notes">
            <div className="notes-index-list-head" aria-hidden="true">
              <span>Page</span>
              <span>Location</span>
              <span>Updated</span>
            </div>
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="notes-index-row"
              >
                <span className="notes-index-main">
                  <span className="notes-index-icon" aria-hidden="true">
                    {renderStoredIcon(note.icon, {
                      fallback: (
                        <span className="material-symbols-outlined">
                          description
                        </span>
                      ),
                      materialClassName: "material-symbols-outlined",
                    })}
                  </span>
                  <span className="notes-index-title">{note.title}</span>
                  {note.isPinned ? (
                    <span className="notes-index-pin" title="Pinned">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        push_pin
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="notes-index-location">
                  {note.parentId
                    ? pagePaths.get(note.parentId) ?? "Page"
                    : "Workspace"}
                </span>
                <time
                  className="notes-index-date"
                  dateTime={note.updatedAt.toISOString()}
                >
                  {formatDate(note.updatedAt)}
                </time>
              </Link>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

function buildPagePaths(
  pages: Array<{ id: string; title: string; parentId: string | null }>,
) {
  const pagesById = new Map(pages.map((page) => [page.id, page]));

  return new Map(
    pages.map((page) => {
      const parts: string[] = [];
      const visited = new Set<string>();
      let current: typeof page | undefined = page;

      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        parts.unshift(current.title);
        current = current.parentId ? pagesById.get(current.parentId) : undefined;
      }

      return [page.id, parts.join(" / ")] as const;
    }),
  );
}
