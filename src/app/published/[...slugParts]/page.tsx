import { notFound } from "next/navigation";
import { PublishedNoteView } from "@/components/published/PublishedNoteView";
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

  return <PublishedNoteView title={note.title} document={note.document} />;
}
