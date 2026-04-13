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
    return "No content preview is available for this template yet.";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}
