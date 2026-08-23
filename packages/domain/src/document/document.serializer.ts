import type {
  BlockMark,
  BlockNodeContent,
  TiptapDocument,
  TiptapNode,
} from "./document.types";

/**
 * Convert a Tiptap JSON document to Markdown.
 * Markdown remains a derived representation; the editor block AST stays canonical.
 *
 * Supported block types match the extensions loaded by the app's Tiptap editor.
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

    case "callout": {
      const emoji = typeof node.attrs?.emoji === "string" ? node.attrs.emoji : "💡";
      // Blocks inside a quote keep the blank line between them, or a reader
      // runs two paragraphs together.
      const inner = (node.content ?? []).map(nodeToMarkdown).join("\n\n");
      return inner
        .split("\n")
        .map((line, index) => (index === 0 ? `> ${emoji} ${line}` : `> ${line}`))
        .join("\n");
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

    case "horizontalRule":
      return "---";

    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      return `![${alt}](${src})`;
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
 * Future work can swap this boundary to remark/mdast without changing the document model.
 */
export function markdownToBlocks(markdown: string): TiptapDocument {
  const lines = markdown.split("\n");
  const lineAt = (position: number) => lines[position] ?? "";
  const content: BlockNodeContent[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lineAt(index);

    if (line.trim() === "") {
      index++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      content.push({
        type: "heading",
        attrs: { level: (headingMatch[1] ?? "").length },
        content: parseInlineMarkdown(headingMatch[2] ?? ""),
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
        const taskLineMatch = lineAt(index).match(/^-\s+\[( |x|X)\]\s+(.*)$/);

        if (!taskLineMatch) {
          break;
        }

        items.push({
          type: "taskItem",
          attrs: {
            checked: (taskLineMatch[1] ?? "").toLowerCase() === "x",
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

      while (index < lines.length && !lineAt(index).trim().startsWith("```")) {
        codeLines.push(lineAt(index));
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

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];

      while (index < lines.length && lineAt(index).startsWith("> ")) {
        quoteLines.push(lineAt(index).slice(2));
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

      while (index < lines.length && /^[-*+]\s+/.test(lineAt(index))) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                ...parseInlineMarkdown(lineAt(index).replace(/^[-*+]\s+/, "")),
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

      while (index < lines.length && /^\d+\.\s+/.test(lineAt(index))) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                ...parseInlineMarkdown(lineAt(index).replace(/^\d+\.\s+/, "")),
              ],
            },
          ],
        });
        index++;
      }

      content.push({ type: "orderedList", content: items });
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
