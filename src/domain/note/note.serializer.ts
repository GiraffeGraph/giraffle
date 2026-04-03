import type { TiptapDocument, BlockNodeContent } from "./note.types";

/**
 * Convert a Tiptap JSON document to Markdown.
 * MVP: handles paragraph, heading, bulletList, orderedList, codeBlock, blockquote, horizontalRule.
 * Wikilinks are preserved as [[target]] syntax.
 */
export function blocksToMarkdown(doc: TiptapDocument): string {
  if (!doc.content || doc.content.length === 0) return "";
  return doc.content.map(nodeToMarkdown).join("\n\n");
}

function nodeToMarkdown(node: BlockNodeContent): string {
  switch (node.type) {
    case "paragraph":
      return inlineToMarkdown(node.content);

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = "#".repeat(level);
      return `${prefix} ${inlineToMarkdown(node.content)}`;
    }

    case "bulletList":
      return (node.content ?? [])
        .map((item) => {
          const inner = ("content" in item && item.content ? item.content : []).map(nodeToMarkdown).join("\n");
          return `- ${inner}`;
        })
        .join("\n");

    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => {
          const inner = ("content" in item && item.content ? item.content : []).map(nodeToMarkdown).join("\n");
          return `${i + 1}. ${inner}`;
        })
        .join("\n");

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = inlineToMarkdown(node.content);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case "blockquote":
      return (node.content ?? [])
        .map((child) => `> ${nodeToMarkdown(child)}`)
        .join("\n");

    case "horizontalRule":
      return "---";

    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      return `![${alt}](${src})`;
    }

    default:
      return inlineToMarkdown(node.content);
  }
}

function inlineToMarkdown(
  content?: (BlockNodeContent)[]
): string {
  if (!content) return "";

  return content
    .map((node) => {
      if (node.type !== "text" || !("text" in node)) {
        return nodeToMarkdown(node);
      }

      let text = (node as { text: string }).text;
      const marks = node.marks ?? [];

      for (const mark of marks) {
        switch (mark.type) {
          case "bold":
            text = `**${text}**`;
            break;
          case "italic":
            text = `*${text}*`;
            break;
          case "code":
            text = `\`${text}\``;
            break;
          case "strike":
            text = `~~${text}~~`;
            break;
          case "link":
            text = `[${text}](${mark.attrs?.href ?? ""})`;
            break;
          case "wikilink":
            text = `[[${mark.attrs?.target ?? text}]]`;
            break;
        }
      }

      return text;
    })
    .join("");
}

/**
 * Parse Markdown into a Tiptap JSON document.
 * MVP: basic line-by-line parsing for headings, lists, code blocks, blockquotes, paragraphs.
 * This is not a full Markdown parser — it establishes the architecture boundary
 * for future round-trip support (e.g., using mdast/remark).
 */
export function markdownToBlocks(markdown: string): TiptapDocument {
  const lines = markdown.split("\n");
  const content: BlockNodeContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: [{ type: "text", text: headingMatch[2] }],
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      content.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      content.push({
        type: "codeBlock",
        attrs: { language: lang || null },
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      i++; // skip closing ```
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      content.push({
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: quoteLines.join("\n") }],
          },
        ],
      });
      continue;
    }

    // Bullet list
    if (/^[-*+]\s+/.test(line)) {
      const items: BlockNodeContent[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: lines[i].replace(/^[-*+]\s+/, "") }],
            },
          ],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: BlockNodeContent[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: lines[i].replace(/^\d+\.\s+/, "") },
              ],
            },
          ],
        });
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // Default: paragraph
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    });
    i++;
  }

  return { type: "doc", content };
}
