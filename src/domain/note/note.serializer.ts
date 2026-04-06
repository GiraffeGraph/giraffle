import type { BlockNodeContent, TiptapDocument, TiptapNode } from "./note.types";

/**
 * Convert a Tiptap JSON document to Markdown.
 * Markdown remains a derived representation; the editor block AST stays canonical.
 *
 * Supported block types:
 * - paragraph, heading, bulletList, orderedList, codeBlock, blockquote
 * - callout, toggle, image, horizontalRule, table
 */
export function blocksToMarkdown(doc: TiptapDocument): string {
  if (!doc.content || doc.content.length === 0) {
    return "";
  }

  return doc.content.map(nodeToMarkdown).join("\n\n");
}

function nodeToMarkdown(node: BlockNodeContent): string {
  switch (node.type) {
    case "paragraph":
      return inlineToMarkdown(node.content);

    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const prefix = "#".repeat(Math.min(Math.max(level, 1), 6));
      return `${prefix} ${inlineToMarkdown(node.content)}`;
    }

    case "bulletList":
      return (node.content ?? [])
        .map((item) => {
          const inner = ("content" in item && item.content ? item.content : [])
            .map(nodeToMarkdown)
            .join("\n");
          return `- ${inner}`;
        })
        .join("\n");

    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => {
          const inner = ("content" in item && item.content ? item.content : [])
            .map(nodeToMarkdown)
            .join("\n");
          return `${index + 1}. ${inner}`;
        })
        .join("\n");

    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      const code = inlineToMarkdown(node.content);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case "blockquote":
      return (node.content ?? [])
        .map((child) => `> ${nodeToMarkdown(child)}`)
        .join("\n");

    case "callout": {
      const tone = String(node.attrs?.tone ?? "info").toUpperCase();
      const title = String(node.attrs?.title ?? "Callout");
      const body = (node.content ?? []).map(nodeToMarkdown).join("\n\n");
      const quotedBody = body
        ? body.split("\n").map((line) => `> ${line}`).join("\n")
        : "> ";
      return `> [!${tone}] ${title}\n${quotedBody}`;
    }

    case "toggle": {
      const summary = String(node.attrs?.summary ?? "Toggle");
      const body = (node.content ?? []).map(nodeToMarkdown).join("\n\n");
      return `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${body}\n\n</details>`;
    }

    case "horizontalRule":
      return "---";

    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      return `![${alt}](${src})`;
    }

    case "table": {
      const rows = toTableRows(node.attrs?.rows);
      const [header, ...body] = rows;
      const headerLine = `| ${header.join(" | ")} |`;
      const dividerLine = `| ${header.map(() => "---").join(" | ")} |`;
      const bodyLines = body.map((row) => `| ${row.join(" | ")} |`).join("\n");
      const caption =
        typeof node.attrs?.caption === "string" && node.attrs.caption.trim()
          ? `\n\n> ${node.attrs.caption}`
          : "";

      return `${headerLine}\n${dividerLine}${
        bodyLines ? `\n${bodyLines}` : ""
      }${caption}`;
    }

    default:
      return inlineToMarkdown(node.content);
  }
}

function inlineToMarkdown(content?: TiptapNode[]): string {
  if (!content) {
    return "";
  }

  return content
    .map((node) => {
      if (node.type !== "text" || !("text" in node)) {
        return nodeToMarkdown(node);
      }

      let text = node.text;
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
 * This remains intentionally small and explicit rather than pretending to be a full parser.
 * Future work can swap this boundary to remark/mdast without changing the note domain.
 */
export function markdownToBlocks(markdown: string): TiptapDocument {
  const lines = markdown.split("\n");
  const content: BlockNodeContent[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: [{ type: "text", text: headingMatch[2] }],
      });
      index++;
      continue;
    }

    const imageMatch = line.match(/^!\[(.*)\]\((.+)\)$/);
    if (imageMatch) {
      content.push({
        type: "image",
        attrs: {
          alt: imageMatch[1],
          src: imageMatch[2],
        },
      });
      index++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      content.push({ type: "horizontalRule" });
      index++;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      index++;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index++;
      }

      if (index < lines.length) {
        index++;
      }

      content.push({
        type: "codeBlock",
        attrs: { language: language || null },
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    const calloutMatch = line.match(/^>\s+\[!([A-Za-z]+)\]\s*(.*)$/);
    if (calloutMatch) {
      const tone = calloutMatch[1].toLowerCase();
      const title = calloutMatch[2].trim() || "Callout";
      const bodyLines: string[] = [];
      index++;

      while (index < lines.length && lines[index].startsWith(">")) {
        bodyLines.push(lines[index].replace(/^>\s?/, ""));
        index++;
      }

      const nestedDocument = markdownToBlocks(bodyLines.join("\n"));
      content.push({
        type: "callout",
        attrs: { tone, title },
        content:
          nestedDocument.content.length > 0
            ? nestedDocument.content
            : [{ type: "paragraph" }],
      });
      continue;
    }

    if (line.trim() === "<details>") {
      index++;
      const summaryLine = lines[index] ?? "";
      const summaryMatch = summaryLine.match(/^<summary>(.*)<\/summary>$/);
      const summary = summaryMatch?.[1]?.trim() || "Toggle";

      if (summaryMatch) {
        index++;
      }

      const bodyLines: string[] = [];
      while (index < lines.length && lines[index].trim() !== "</details>") {
        bodyLines.push(lines[index]);
        index++;
      }

      if (index < lines.length) {
        index++;
      }

      const nestedDocument = markdownToBlocks(bodyLines.join("\n"));
      content.push({
        type: "toggle",
        attrs: { summary },
        content:
          nestedDocument.content.length > 0
            ? nestedDocument.content
            : [{ type: "paragraph" }],
      });
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].startsWith("> ")) {
        quoteLines.push(lines[index].slice(2));
        index++;
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

    if (/^[-*+]\s+/.test(line)) {
      const items: BlockNodeContent[] = [];

      while (index < lines.length && /^[-*+]\s+/.test(lines[index])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: lines[index].replace(/^[-*+]\s+/, "") },
              ],
            },
          ],
        });
        index++;
      }

      content.push({ type: "bulletList", content: items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: BlockNodeContent[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: lines[index].replace(/^\d+\.\s+/, "") },
              ],
            },
          ],
        });
        index++;
      }

      content.push({ type: "orderedList", content: items });
      continue;
    }

    const looksLikeTable =
      line.includes("|") &&
      index + 1 < lines.length &&
      /^\|\s*[-: ]+\|/.test(lines[index + 1].trim());

    if (looksLikeTable) {
      const rows: string[][] = [
        line
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean),
      ];

      index += 2;

      while (index < lines.length && lines[index].includes("|")) {
        rows.push(
          lines[index]
            .split("|")
            .map((cell) => cell.trim())
            .filter(Boolean)
        );
        index++;
      }

      content.push({
        type: "table",
        attrs: {
          rows: rows.length > 0 ? rows : toTableRows(undefined),
        },
      });
      continue;
    }

    content.push({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    });
    index++;
  }

  return { type: "doc", content };
}

function toTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [
      ["Sütun 1", "Sütun 2"],
      ["Değer", "Değer"],
    ];
  }

  return value.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row)]
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
