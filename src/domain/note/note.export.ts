import { blocksToMarkdown } from "./note.serializer";
import type { TiptapDocument } from "./note.types";
import { slugify } from "@/lib/utils";

export interface NoteExportInput {
  id: string;
  title: string;
  slug?: string | null;
  icon: string | null;
  folderPath: string[];
  isPublished: boolean;
  updatedAt: Date;
  document: TiptapDocument;
}

export interface NoteExportArtifact {
  noteId: string;
  title: string;
  markdown: string;
  mdx: string;
  publishPath: string;
}

export function buildNoteExportArtifact(
  note: NoteExportInput
): NoteExportArtifact {
  const markdown = blocksToMarkdown(note.document);
  const publishPath = buildPublishPath(
    note.folderPath,
    note.slug ?? note.title,
    note.id
  );
  const frontmatter = [
    "---",
    `title: "${escapeFrontmatter(note.title)}"`,
    `noteId: "${note.id}"`,
    `published: ${note.isPublished ? "true" : "false"}`,
    `updatedAt: "${note.updatedAt.toISOString()}"`,
    "---",
  ].join("\n");

  return {
    noteId: note.id,
    title: note.title,
    markdown,
    mdx: `${frontmatter}\n\n${markdown}`.trim(),
    publishPath,
  };
}

export function buildPublishPath(
  folderPath: string[],
  slugOrTitle: string,
  noteId: string
): string {
  const safeFolderPath = folderPath
    .map((segment) => slugify(segment))
    .filter(Boolean);
  const safeFileName = slugify(slugOrTitle) || noteId;

  return [...safeFolderPath, `${safeFileName}.mdx`].join("/");
}

function escapeFrontmatter(value: string): string {
  return value.replaceAll('"', '\\"');
}
