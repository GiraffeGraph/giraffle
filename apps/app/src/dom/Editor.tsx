"use dom";

import { generateId, type TiptapDocument } from "@giraffle/domain";
import { Extension } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { DOMProps } from "expo/dom";
import { useCallback, useEffect, useState } from "react";
import { assignBlockIds, ID_BEARING_NODES, isIdBearing } from "./editor-document";
import { editorCssVariables, type EditorTheme } from "./theme";
import { wikilinkRanges } from "./wikilinks";

export interface EditorAttachment {
  src: string;
  alt: string;
}

export interface EditorProps {
  /** Seeds the editor. Later revisions are not pushed back in; see below. */
  document: TiptapDocument;
  theme: EditorTheme;
  onChange: (document: TiptapDocument) => void;
  onOpenLink: (target: string) => void;
  onFocusChange: (focused: boolean) => void;
  onError: (message: string) => void;
  /**
   * The web realm has no access to the photo library or the file system, so
   * picking runs natively and the chosen file comes back as a source the
   * document can hold.
   */
  onRequestAttachment: (accept: string[]) => Promise<EditorAttachment | null>;
  dom?: DOMProps;
}

const WIKILINK_ATTRIBUTE = "data-wikilink-target";

/**
 * Keeps a stable `id` on every block. Ids survive a round trip through the
 * editor as `data-id`, and blocks typed after load get one from the same mint
 * the host uses.
 */
const BlockId = Extension.create({
  name: "giraffleBlockId",

  addGlobalAttributes() {
    return [
      {
        types: [...ID_BEARING_NODES],
        attributes: {
          id: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
            renderHTML: (attributes: Record<string, unknown>) =>
              typeof attributes.id === "string" ? { "data-id": attributes.id } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("giraffleBlockId"),
        appendTransaction: (transactions, _previous, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;

          const seen = new Set<string>();
          let transaction = state.tr;
          let changed = false;

          state.doc.descendants((node, position) => {
            if (!isIdBearing(node.type.name)) return;
            const current = typeof node.attrs.id === "string" ? node.attrs.id : "";
            if (current.length > 0 && !seen.has(current)) {
              seen.add(current);
              return;
            }
            let next = generateId();
            while (seen.has(next)) next = generateId();
            seen.add(next);
            transaction = transaction.setNodeMarkup(
              position,
              undefined,
              { ...node.attrs, id: next },
              node.marks,
            );
            changed = true;
          });

          return changed ? transaction : null;
        },
      }),
    ];
  },
});

/**
 * Marks `[[Target]]` spans without rewriting them. The vault rebuilds backlinks
 * from the document's plain text, so the brackets have to stay in the text.
 */
const Wikilink = Extension.create({
  name: "giraffleWikilink",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("giraffleWikilink"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, position) => {
              if (!node.isText || typeof node.text !== "string") return;
              for (const range of wikilinkRanges(node.text)) {
                decorations.push(
                  Decoration.inline(position + range.from, position + range.to, {
                    class: "giraffle-wikilink",
                    [WIKILINK_ATTRIBUTE]: range.target,
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const STYLES = `
html, body, #root {
  margin: 0;
  height: 100%;
  background: var(--giraffle-bg);
}
#root {
  display: flex;
  flex-direction: column;
}
.giraffle-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--giraffle-bg);
  color: var(--giraffle-ink);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-text-size-adjust: 100%;
}
.giraffle-editor {
  flex: 1;
  outline: none;
  padding: 2px 0 24px;
  overflow-wrap: anywhere;
  caret-color: var(--giraffle-ink);
}
.giraffle-editor p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--giraffle-muted);
  float: left;
  height: 0;
  pointer-events: none;
}
.giraffle-editor a { color: var(--giraffle-link); }
.giraffle-editor .giraffle-wikilink {
  color: var(--giraffle-link);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.giraffle-editor img { max-width: 100%; height: auto; }
.giraffle-editor blockquote {
  margin: 0;
  padding-left: 12px;
  border-left: 3px solid var(--giraffle-muted);
  color: var(--giraffle-muted);
}
.giraffle-editor pre {
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  background: color-mix(in srgb, var(--giraffle-ink) 8%, transparent);
}
.giraffle-editor ul[data-type='taskList'] { list-style: none; padding-left: 4px; }
.giraffle-editor ul[data-type='taskList'] li { display: flex; gap: 8px; align-items: flex-start; }
.giraffle-editor ul[data-type='taskList'] li > label { user-select: none; }
.giraffle-editor ul[data-type='taskList'] li > div { flex: 1; }
.giraffle-toolbar {
  position: sticky;
  bottom: 0;
  display: flex;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  background: transparent;
}
.giraffle-toolbar button {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--giraffle-muted) 45%, transparent);
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  color: var(--giraffle-muted);
  background: transparent;
}
`;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300) || "Editor error";
}

export default function Editor({
  document: incoming,
  theme,
  onChange,
  onOpenLink,
  onFocusChange,
  onError,
  onRequestAttachment,
}: EditorProps) {
  // The host holds the document and re-sends it after every save. Adopting
  // those revisions would reset the selection mid-keystroke, so the incoming
  // value seeds the editor once and the editor owns it from there.
  const [seed] = useState(() => assignBlockIds(incoming));

  const openLink = useCallback(
    (target: string) => {
      if (target.length > 0) onOpenLink(target);
    },
    [onOpenLink],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Links open on the native side; the web realm never navigates.
        link: { openOnClick: false, autolink: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({ placeholder: "Start writing…" }),
      BlockId,
      Wikilink,
    ],
    content: seed,
    editorProps: {
      attributes: {
        class: "giraffle-editor",
        role: "textbox",
        "aria-label": "Page content",
        "aria-multiline": "true",
      },
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target;
          if (!(target instanceof globalThis.Element)) return false;
          const wikilink = target.closest(`[${WIKILINK_ATTRIBUTE}]`);
          if (wikilink) {
            event.preventDefault();
            openLink(wikilink.getAttribute(WIKILINK_ATTRIBUTE) ?? "");
            return true;
          }
          const anchor = target.closest("a[href]");
          if (anchor) {
            event.preventDefault();
            openLink(anchor.getAttribute("href") ?? "");
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getJSON() as TiptapDocument);
    },
    onFocus: () => onFocusChange(true),
    onBlur: () => onFocusChange(false),
  });

  useEffect(() => {
    const report = (event: ErrorEvent) => onError(describe(event.error ?? event.message));
    const rejected = (event: PromiseRejectionEvent) => onError(describe(event.reason));
    window.addEventListener("error", report);
    window.addEventListener("unhandledrejection", rejected);
    return () => {
      window.removeEventListener("error", report);
      window.removeEventListener("unhandledrejection", rejected);
    };
  }, [onError]);

  const attach = useCallback(() => {
    if (!editor) return;
    onRequestAttachment(["image/*"])
      .then((attachment) => {
        if (attachment) {
          editor.chain().focus().setImage({ src: attachment.src, alt: attachment.alt }).run();
        }
      })
      .catch((error: unknown) => onError(describe(error)));
  }, [editor, onError, onRequestAttachment]);

  // Written to the document root, not just the shell: the webview paints html
  // and body itself, and a custom property set lower down never reaches them.
  useEffect(() => {
    const root = document.documentElement;
    const variables = editorCssVariables(theme);
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
  }, [theme]);

  return (
    <div className="giraffle-shell">
      <style>{STYLES}</style>
      <EditorContent editor={editor} />
      <div className="giraffle-toolbar">
        <button type="button" onClick={attach}>
          Add image
        </button>
      </div>
    </div>
  );
}
