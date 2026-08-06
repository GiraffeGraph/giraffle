import { blocksToMarkdown } from "./note.serializer";
import type { TiptapDocument } from "./note.types";

export interface NoteExportInput {
  id: string;
  title: string;
  updatedAt: Date;
  document: TiptapDocument;
}

export interface NoteExportArtifact {
  noteId: string;
  title: string;
  markdown: string;
  mdx: string;
}

export function buildNoteExportArtifact(note: NoteExportInput): NoteExportArtifact {
  const markdown = blocksToMarkdown(note.document);
  const frontmatter = [
    "---",
    `title: "${escapeFrontmatter(note.title)}"`,
    `noteId: "${note.id}"`,
    `updatedAt: "${note.updatedAt.toISOString()}"`,
    "---",
  ].join("\n");

  return {
    noteId: note.id,
    title: note.title,
    markdown,
    mdx: `${frontmatter}\n\n${markdown}`.trim(),
  };
}

function escapeFrontmatter(value: string): string {
  return value.replaceAll('"', '\\"');
}
