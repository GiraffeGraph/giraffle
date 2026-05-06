import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getSavannaNoteEditorAction } from "@/server/api/savanna";
import type {
  BlockMark,
  TiptapNode,
  TiptapDocument,
} from "@/domain/note/note.types";

interface NoteEmbedPageProps {
  params: Promise<{ noteId: string }>;
}

const EMBED_STYLES = `
  :root { color-scheme: dark; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
    background: #14130f;
    color: #e8e6e0;
    font-size: 14px;
    line-height: 1.55;
  }
  .svn-embed-shell {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100vh;
  }
  .svn-embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
  }
  .svn-embed-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: #f4f1ea;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .svn-embed-title-icon { font-size: 14px; flex-shrink: 0; }
  .svn-embed-body {
    overflow: auto;
    padding: 12px 16px;
  }
  .svn-embed-body p { margin: 0 0 8px; }
  .svn-embed-body h1 { font-size: 18px; margin: 14px 0 6px; font-weight: 700; }
  .svn-embed-body h2 { font-size: 16px; margin: 12px 0 6px; font-weight: 700; }
  .svn-embed-body h3 { font-size: 14px; margin: 10px 0 6px; font-weight: 700; }
  .svn-embed-body img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 6px 0; }
  .svn-embed-body a { color: #e1a63e; }
  .svn-embed-body ul, .svn-embed-body ol { margin: 0 0 8px; padding-left: 22px; }
  .svn-embed-body li { margin: 2px 0; }
  .svn-embed-body code {
    background: rgba(255, 255, 255, 0.06);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .svn-embed-body pre {
    background: rgba(255, 255, 255, 0.04);
    padding: 10px;
    border-radius: 6px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }
  .svn-embed-body blockquote {
    margin: 8px 0;
    padding-left: 10px;
    border-left: 3px solid rgba(225, 166, 62, 0.4);
    color: #c5c2b8;
  }
  .svn-embed-empty {
    color: #7a766c;
    font-style: italic;
  }
`;

function applyMarks(content: React.ReactNode, marks: BlockMark[] | undefined) {
  if (!marks || marks.length === 0) return content;
  let node = content;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        node = <strong>{node}</strong>;
        break;
      case "italic":
        node = <em>{node}</em>;
        break;
      case "underline":
        node = <u>{node}</u>;
        break;
      case "strike":
        node = <s>{node}</s>;
        break;
      case "code":
        node = <code>{node}</code>;
        break;
      case "link": {
        const href =
          typeof mark.attrs?.href === "string" ? mark.attrs.href : "#";
        node = (
          <a href={href} target="_top" rel="noopener noreferrer">
            {node}
          </a>
        );
        break;
      }
    }
  }
  return node;
}

function renderNode(node: TiptapNode, key: string | number): React.ReactNode {
  if (node.type === "text" && "text" in node) {
    return <Fragment key={key}>{applyMarks(node.text, node.marks)}</Fragment>;
  }

  const childContent = (node as { content?: TiptapNode[] }).content;
  const children = Array.isArray(childContent)
    ? childContent.map((child, idx) => renderNode(child, idx))
    : null;

  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{children}</Fragment>;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading": {
      const level = Number(node.attrs?.level) || 1;
      const Tag = (`h${Math.min(Math.max(level, 1), 3)}` as "h1" | "h2" | "h3");
      return <Tag key={key}>{children}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "taskList":
      return (
        <ul key={key} style={{ listStyle: "none", paddingLeft: 4 }}>
          {children}
        </ul>
      );
    case "taskItem": {
      const checked = Boolean(node.attrs?.checked);
      return (
        <li key={key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <input type="checkbox" checked={checked} readOnly style={{ marginTop: 4 }} />
          <span>{children}</span>
        </li>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={key} src={src} alt={alt} />;
    }
    default:
      return children ? <div key={key}>{children}</div> : null;
  }
}

function renderDocument(doc: TiptapDocument | undefined): React.ReactNode {
  if (!doc || typeof doc !== "object") return null;
  const root = doc as { type?: string; content?: TiptapNode[] };
  if (!Array.isArray(root.content) || root.content.length === 0) return null;
  return root.content.map((node, idx) => renderNode(node, idx));
}

export default async function NoteEmbedPage({ params }: NoteEmbedPageProps) {
  const { noteId } = await params;
  const note = await getSavannaNoteEditorAction(noteId);

  if (!note) {
    notFound();
  }

  const rendered = renderDocument(note.document);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EMBED_STYLES }} />
      <div className="svn-embed-shell">
        <header className="svn-embed-header">
          <div className="svn-embed-title">
            {note.icon ? (
              <span className="svn-embed-title-icon">{note.icon}</span>
            ) : null}
            <span>{note.title || "Untitled"}</span>
          </div>
        </header>
        <div className="svn-embed-body">
          {rendered ?? <div className="svn-embed-empty">Empty note</div>}
        </div>
      </div>
    </>
  );
}
