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
import { BlockControls } from "./block-controls";
import { assignBlockIds, ID_BEARING_NODES, isIdBearing } from "./editor-document";
import { EDITOR_STYLES } from "./editor-styles";
import { SlashMenu } from "./slash-menu";
import { editorCssVariables, editorMetricVariables, type EditorTheme } from "./theme";
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
        // The line a dragged block will land on. ProseMirror already draws it
        // while `view.dragging` is set, so the drag handle only has to say
        // what is moving.
        dropcursor: { color: "var(--giraffle-link)", width: 2, class: "giraffle-drop-line" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({
        // Only a paragraph is offered the hint, and the stylesheet narrows that
        // to the top level: inside a list or a quote the block a person is in
        // already says what to type.
        placeholder: ({ node }) =>
          node.type.name === "paragraph" ? "Write, or press '/' for commands" : "",
      }),
      BlockId,
      BlockControls,
      SlashMenu,
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
    const variables = { ...editorMetricVariables(), ...editorCssVariables(theme) };
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
  }, [theme]);

  return (
    <div className="giraffle-shell">
      <style>{EDITOR_STYLES}</style>
      <EditorContent editor={editor} className="giraffle-editor-host" />
      <div className="giraffle-toolbar">
        <button type="button" onClick={attach}>
          Add image
        </button>
      </div>
    </div>
  );
}
