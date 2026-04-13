import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import { getPublicNoteBySlugAction } from "@/server/api/notes";

interface PublishedSlugPageProps {
  params: Promise<{
    slugParts: string[];
  }>;
}

export default async function PublishedSlugPage({
  params,
}: PublishedSlugPageProps) {
  const { slugParts } = await params;
  const slug = slugParts.at(-1);

  if (!slug) {
    notFound();
  }

  const note = await getPublicNoteBySlugAction(slug);

  if (!note) {
    notFound();
  }

  return (
    <div className="published-page">
      <div className="published-shell">
        <div className="published-meta">
          <div className="published-label">Published Note</div>
          <h1 className="published-title">{note.title}</h1>
          {note.tags.length > 0 ? (
            <div className="published-tags">
              {note.tags.map((tag) => (
                <span key={tag} className="published-tag">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Editor initialContent={note.document} editable={false} />
      </div>
    </div>
  );
}
