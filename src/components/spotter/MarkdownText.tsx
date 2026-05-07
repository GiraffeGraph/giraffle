import styles from "./SpotterWorkspace.module.css";

interface MarkdownTextProps {
  text: string;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; language: string | null; code: string };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  const readParagraph = () => {
    const paragraph: string[] = [];
    while (index < lines.length) {
      const line = lines[index] ?? "";
      if (!line.trim()) break;
      if (/^```/.test(line) || /^#{1,3}\s+/.test(line) || /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) break;
      paragraph.push(line.trim());
      index += 1;
    }
    if (paragraph.length > 0) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*(\w+)?/);
    if (fence) {
      const language = fence[1] ?? null;
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language, code: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      });
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^\s*[-*]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]!.trim());
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^\s*\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(item[1]!.trim());
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    readParagraph();
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[2]) {
      nodes.push(<strong key={nodes.length}>{match[2]}</strong>);
    } else if (match[4]) {
      nodes.push(<code key={nodes.length}>{match[4]}</code>);
    } else if (match[6] && match[7]) {
      nodes.push(
        <a key={nodes.length} href={match[7]} target="_blank" rel="noreferrer">
          {match[6]}
        </a>,
      );
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownText({ text }: MarkdownTextProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={styles.markdownText}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = `h${block.level}` as "h1" | "h2" | "h3";
          return <Heading key={index}>{renderInline(block.text)}</Heading>;
        }
        if (block.type === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={index}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
            </ol>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={index} className={styles.markdownCodeBlock}>
              {block.language && <span>{block.language}</span>}
              <code>{block.code}</code>
            </pre>
          );
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}
