"use client";

import type { Editor as TiptapEditor } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlock from "@tiptap/extension-code-block";
import {
  BlockIdExtension,
  WikilinkMark,
  defaultSlashCommands,
} from "./extensions";
import { SlashCommandMenu } from "./toolbar/SlashCommandMenu";
import type { TiptapDocument } from "@/domain/note/note.types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SlashMenuState {
  query: string;
  range: {
    from: number;
    to: number;
  };
  position: {
    top: number;
    left: number;
  };
}

interface EditorProps {
  initialContent?: TiptapDocument;
  onSave?: (content: TiptapDocument) => void;
  editable?: boolean;
}

export function Editor({ initialContent, onSave, editable = true }: EditorProps) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);

  const updateSlashMenu = useCallback((instance: TiptapEditor) => {
    const { state, view } = instance;
    const { selection } = state;

    if (!selection.empty) {
      setSlashMenu(null);
      return;
    }

    const { $from } = selection;
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, "", "");
    const match = /\/([^\s/]*)$/.exec(textBefore);

    if (!match) {
      setSlashMenu(null);
      return;
    }

    const query = match[1] ?? "";
    const matchingItems = defaultSlashCommands.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );

    if (matchingItems.length === 0) {
      setSlashMenu(null);
      return;
    }

    const containerRect = editorRootRef.current?.getBoundingClientRect();
    const caretRect = view.coordsAtPos(selection.from);

    setSlashMenu({
      query,
      range: {
        from: selection.from - match[0].length,
        to: selection.from,
      },
      position: {
        top: containerRect ? caretRect.bottom - containerRect.top + 8 : 0,
        left: containerRect ? caretRect.left - containerRect.left : 0,
      },
    });
  }, []);

  const slashItems = useMemo(() => {
    if (!slashMenu) {
      return [];
    }

    return defaultSlashCommands.filter((item) =>
      item.title.toLowerCase().includes(slashMenu.query.toLowerCase())
    );
  }, [slashMenu]);

  const editor = useEditor({
    immediatelyRender: false,
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
      BlockIdExtension,
      WikilinkMark,
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
      updateSlashMenu(editor);

      // Debounced auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const json = JSON.parse(
          JSON.stringify(editor.getJSON())
        ) as TiptapDocument;
        onSave?.(json);
      }, 1000);
    },
    onSelectionUpdate: ({ editor }) => {
      updateSlashMenu(editor);
    },
    onCreate: ({ editor }) => {
      updateSlashMenu(editor);
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

  useEffect(() => {
    if (!slashMenu) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSlashMenu(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [slashMenu]);

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

  const handleSlashCommand = useCallback(
    (commandItem: (typeof defaultSlashCommands)[number]) => {
      if (!editor || !slashMenu) {
        return;
      }

      editor
        .chain()
        .focus()
        .deleteRange(slashMenu.range)
        .run();

      commandItem.command(editor);
      setSlashMenu(null);
    },
    [editor, slashMenu]
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
    <div
      ref={editorRootRef}
      className="graffle-editor"
      onClick={handleClick}
    >
      <EditorContent editor={editor} />
      {slashMenu && slashItems.length > 0 ? (
        <SlashCommandMenu
          items={slashItems}
          command={handleSlashCommand}
          style={{
            top: slashMenu.position.top,
            left: slashMenu.position.left,
          }}
        />
      ) : null}
    </div>
  );
}
