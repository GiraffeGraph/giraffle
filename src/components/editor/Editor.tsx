"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlock from "@tiptap/extension-code-block";
import { WikilinkMark, SlashCommandExtension } from "./extensions";
import type { TiptapDocument } from "@/domain/note/note.types";
import { useCallback, useEffect, useRef } from "react";

interface EditorProps {
  initialContent?: TiptapDocument;
  onSave?: (content: TiptapDocument) => void;
  editable?: boolean;
}

export function Editor({ initialContent, onSave, editable = true }: EditorProps) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlock.configure({
        HTMLAttributes: {
          class: "graffle-code-block",
        },
      }),
      Placeholder.configure({
        placeholder: 'Type "/" for commands, or start writing...',
        emptyEditorClass: "is-editor-empty",
      }),
      WikilinkMark,
      SlashCommandExtension,
    ],
    content: initialContent ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    editable,
    editorProps: {
      attributes: {
        class: "graffle-editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      // Debounced auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const json = editor.getJSON() as TiptapDocument;
        onSave?.(json);
      }, 1000);
    },
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Handle wikilink clicks
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.dataset.type === "wikilink" && target.dataset.target) {
        e.preventDefault();
        // Navigate to the linked note (handled by parent)
        const wikilinkTarget = target.dataset.target;
        const event = new CustomEvent("wikilink-navigate", {
          detail: { target: wikilinkTarget },
          bubbles: true,
        });
        target.dispatchEvent(event);
      }
    },
    []
  );

  if (!editor) {
    return (
      <div className="editor-loading">
        <div className="editor-loading-skeleton" />
        <div className="editor-loading-skeleton short" />
        <div className="editor-loading-skeleton" />
      </div>
    );
  }

  return (
    <div className="graffle-editor" onClick={handleClick}>
      <EditorContent editor={editor} />
    </div>
  );
}
