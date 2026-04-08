import { blocksToMarkdown } from "@/domain/note/note.serializer";
import { templateBlocksToDocument } from "./template.document";

export function buildTemplatePreviewFromBlocks(
  blocks: unknown,
  maxLength = 180
) {
  const text = blocksToMarkdown(templateBlocksToDocument(blocks))
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "Bu şablon için henüz içerik önizlemesi yok.";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}
