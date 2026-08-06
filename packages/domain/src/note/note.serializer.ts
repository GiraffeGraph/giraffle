import { isRecord } from "../utils";
import type {
  BlockMark,
  BlockNodeContent,
  TiptapDocument,
  TiptapNode,
} from "./note.types";

/**
 * Convert a Tiptap JSON document to Markdown.
 * Markdown remains a derived representation; the editor block AST stays canonical.
 *
 * Supported block types:
 * - paragraph, heading, bulletList, orderedList, codeBlock, blockquote
 * - callout, toggle, image, horizontalRule, table, taskList, kanban
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

    case "taskList":
      return (node.content ?? [])
        .map((item) => taskItemToMarkdown(item as BlockNodeContent))
        .filter(Boolean)
        .join("\n");

    case "taskItem":
      return taskItemToMarkdown(node);

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
      const rows = extractTableRows(node);
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

    case "kanban":
      return kanbanToMarkdown(node);

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
        content: parseInlineMarkdown(headingMatch[2]),
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

    const taskListMatch = line.match(/^-\s+\[( |x|X)\]\s+(.*)$/);
    if (taskListMatch) {
      const items: BlockNodeContent[] = [];

      while (index < lines.length) {
        const taskLineMatch = lines[index].match(/^-\s+\[( |x|X)\]\s+(.*)$/);

        if (!taskLineMatch) {
          break;
        }

        items.push({
          type: "taskItem",
          attrs: {
            checked: taskLineMatch[1].toLowerCase() === "x",
          },
          content: [
            {
              type: "paragraph",
              content: parseInlineMarkdown(taskLineMatch[2] ?? ""),
            },
          ],
        });
        index++;
      }

      content.push({
        type: "taskList",
        content: items,
      });
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
            content: parseInlineMarkdown(quoteLines.join("\n")),
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
                ...parseInlineMarkdown(lines[index].replace(/^[-*+]\s+/, "")),
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
                ...parseInlineMarkdown(lines[index].replace(/^\d+\.\s+/, "")),
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
      const rows: string[][] = [parseMarkdownTableRow(line)];

      index += 2;

      while (index < lines.length && lines[index].includes("|")) {
        rows.push(parseMarkdownTableRow(lines[index]));
        index++;
      }

      const columnCount = Math.max(...rows.map((row) => row.length), 1);
      const normalizedRows = rows.map((row) =>
        Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] ?? "")
      );

      content.push({
        type: "table",
        content: normalizedRows.map((row, rowIndex) => ({
          type: "tableRow",
          content: row.map((cell) => ({
            type: rowIndex === 0 ? "tableHeader" : "tableCell",
            content: [
              {
                type: "paragraph",
                content: parseInlineMarkdown(cell),
              },
            ],
          })),
        })),
      });
      continue;
    }

    content.push({
      type: "paragraph",
      content: parseInlineMarkdown(line),
    });
    index++;
  }

  return { type: "doc", content };
}

const INLINE_MARKDOWN_PATTERN =
  /(\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\n]+)\)|\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]|\*([^*\n]+)\*|_([^_\n]+)_)/g;

function parseInlineMarkdown(text: string): TiptapNode[] {
  if (!text) {
    return [];
  }

  const nodes: TiptapNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const start = match.index ?? 0;
    pushTextNode(nodes, text.slice(lastIndex, start));

    if (match[2]) {
      pushTextNode(nodes, match[2], [{ type: "bold" }]);
    } else if (match[3]) {
      pushTextNode(nodes, match[3], [{ type: "bold" }]);
    } else if (match[4]) {
      pushTextNode(nodes, match[4], [{ type: "strike" }]);
    } else if (match[5]) {
      pushTextNode(nodes, match[5], [{ type: "code" }]);
    } else if (match[6] && match[7]) {
      pushTextNode(nodes, match[6], [
        { type: "link", attrs: { href: match[7].trim().split(/\s+/)[0] } },
      ]);
    } else if (match[8]) {
      const target = match[8].trim();
      const displayText = match[9]?.trim() || target;
      pushTextNode(nodes, displayText, [
        { type: "wikilink", attrs: { target, displayText } },
      ]);
    } else if (match[10]) {
      pushTextNode(nodes, match[10], [{ type: "italic" }]);
    } else if (match[11]) {
      pushTextNode(nodes, match[11], [{ type: "italic" }]);
    }

    lastIndex = start + match[0].length;
  }

  pushTextNode(nodes, text.slice(lastIndex));

  return nodes;
}

function pushTextNode(
  nodes: TiptapNode[],
  text: string,
  marks?: BlockMark[]
): void {
  if (!text) {
    return;
  }

  nodes.push(marks ? { type: "text", text, marks } : { type: "text", text });
}

function toTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [
      ["Column 1", "Column 2"],
      ["Value", "Value"],
    ];
  }

  return value.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row)]
  );
}

function extractTableRows(node: BlockNodeContent): string[][] {
  if (Array.isArray(node.attrs?.rows)) {
    return toTableRows(node.attrs.rows);
  }

  const rows = (node.content ?? [])
    .filter(
      (row): row is BlockNodeContent =>
        row.type === "tableRow" && Array.isArray(row.content)
    )
    .map((row) =>
      (row.content ?? [])
        .filter(
          (cell): cell is BlockNodeContent =>
            cell.type === "tableCell" || cell.type === "tableHeader"
        )
        .map((cell) => tableCellToMarkdown(cell))
    )
    .filter((row) => row.length > 0);

  return rows.length > 0 ? rows : toTableRows(undefined);
}

function tableCellToMarkdown(cell: BlockNodeContent): string {
  const parts = (cell.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return inlineToMarkdown(child.content);
      }

      if (child.type === "text" && "text" in child) {
        return child.text;
      }

      return nodeToMarkdown(child);
    })
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.join("<br>");
}

function parseMarkdownTableRow(line: string): string[] {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = normalized.split("|").map((cell) => cell.trim());

  return cells.length > 0 ? cells : [""];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function taskItemToMarkdown(node: BlockNodeContent): string {
  const checked = Boolean(node.attrs?.checked);
  const parts = (node.content ?? [])
    .map((child) => nodeToMarkdown(child as BlockNodeContent))
    .filter((part) => part.trim().length > 0);

  const [firstPart = "", ...restParts] = parts;
  const nested = restParts.map((part) =>
    part
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n")
  );

  return [`- [${checked ? "x" : " "}] ${firstPart}`, ...nested]
    .filter(Boolean)
    .join("\n");
}

function kanbanToMarkdown(node: BlockNodeContent): string {
  const title =
    typeof node.attrs?.title === "string" && node.attrs.title.trim()
      ? node.attrs.title
      : "Kanban";
  const columns = Array.isArray(node.attrs?.columns) ? node.attrs.columns : [];

  const sections = columns
    .filter((column): column is Record<string, unknown> => isRecord(column))
    .map((column) => {
      const heading =
        typeof column.title === "string" && column.title.trim()
          ? column.title
          : "Column";
      const cards = Array.isArray(column.cards) ? column.cards : [];
      const lines = cards
        .filter((card): card is Record<string, unknown> => isRecord(card))
        .map((card) =>
          typeof card.title === "string" && card.title.trim()
            ? `- ${card.title}`
            : "- "
        );

      return [`### ${heading}`, lines.join("\n") || "- "].join("\n");
    });

  return [`[Kanban] ${title}`, ...sections].join("\n\n");
}

