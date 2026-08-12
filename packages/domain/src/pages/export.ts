import { blocksToMarkdown } from "../document/document.serializer";
import type { TiptapDocument } from "../document/document.types";

export interface PageExportInput {
  id: string;
  title: string;
  updatedAt: number;
  document: TiptapDocument;
}

export interface PageExportArtifact {
  pageId: string;
  title: string;
  markdown: string;
  mdx: string;
}

export function buildPageExportArtifact(page: PageExportInput): PageExportArtifact {
  const markdown = blocksToMarkdown(page.document);
  const frontmatter = [
    "---",
    `title: "${escapeFrontmatter(page.title)}"`,
    `pageId: "${page.id}"`,
    `updatedAt: "${new Date(page.updatedAt).toISOString()}"`,
    "---",
  ].join("\n");

  return {
    pageId: page.id,
    title: page.title,
    markdown,
    mdx: `${frontmatter}\n\n${markdown}`.trim(),
  };
}

function escapeFrontmatter(value: string): string {
  return value.replaceAll('"', '\\"');
}
