"use client";

import type { Editor as TiptapEditor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlock from "@tiptap/extension-code-block";
import {
  BlockIdExtension,
  CalloutNode,
  ToggleNode,
  WikilinkMark,
  defaultSlashCommands,
} from "./extensions";
import { SlashCommandMenu } from "./toolbar/SlashCommandMenu";
import type {
  NoteReference,
  TiptapDocument,
} from "@/domain/note/note.types";
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

interface WikilinkMenuState {
  query: string;
  target: string;
  range: {
    from: number;
    to: number;
  };
  position: {
    top: number;
    left: number;
  };
}

interface WikilinkMenuItem {
  title: string;
  description: string;
  icon: string;
  note?: NoteReference;
  createTarget?: string;
}

interface EditorProps {
  initialContent?: TiptapDocument;
  onSave?: (content: TiptapDocument) => void;
  editable?: boolean;
  searchWikilinkNotes?: (query: string) => Promise<NoteReference[]>;
  resolveWikilinkNote?: (target: string) => Promise<NoteReference | null>;
  createWikilinkNote?: (target: string) => Promise<NoteReference>;
  onNavigateToNote?: (noteId: string) => void;
}

export function Editor({
  initialContent,
  onSave,
  editable = true,
  searchWikilinkNotes,
  resolveWikilinkNote,
  createWikilinkNote,
  onNavigateToNote,
}: EditorProps) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [wikilinkMenu, setWikilinkMenu] = useState<WikilinkMenuState | null>(
    null
  );
  const [wikilinkItems, setWikilinkItems] = useState<WikilinkMenuItem[]>([]);

  const updateSlashMenu = useCallback((instance: TiptapEditor) => {
    if (!editable) {
      setSlashMenu(null);
      return;
    }

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
  }, [editable]);

  const updateWikilinkMenu = useCallback(
    (instance: TiptapEditor) => {
      if (!editable) {
        setWikilinkMenu(null);
        setWikilinkItems([]);
        return;
      }

      const { state, view } = instance;
      const { selection } = state;

      if (!selection.empty) {
        setWikilinkMenu(null);
        setWikilinkItems([]);
        return;
      }

      const { $from } = selection;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, "", "");
      const match = /\[\[([^\]]*)$/.exec(textBefore);

      if (!match) {
        setWikilinkMenu(null);
        setWikilinkItems([]);
        return;
      }

      const query = match[1] ?? "";
      const target = query.replace(/\|.*$/, "").trim();
      const containerRect = editorRootRef.current?.getBoundingClientRect();
      const caretRect = view.coordsAtPos(selection.from);

      setWikilinkItems([]);
      setWikilinkMenu({
        query,
        target,
        range: {
          from: selection.from - match[0].length,
          to: selection.from,
        },
        position: {
          top: containerRect ? caretRect.bottom - containerRect.top + 8 : 0,
          left: containerRect ? caretRect.left - containerRect.left : 0,
        },
      });
    },
    [editable]
  );

  const slashItems = useMemo(() => {
    if (!slashMenu) {
      return [];
    }

    return defaultSlashCommands.filter((item) =>
      item.title.toLowerCase().includes(slashMenu.query.toLowerCase())
    );
  }, [slashMenu]);

  useEffect(() => {
    if (!wikilinkMenu || !searchWikilinkNotes) {
      return;
    }

    const currentTarget = wikilinkMenu.target.trim();
    let isCancelled = false;

    const timeoutId = setTimeout(async () => {
      const matchingNotes = await searchWikilinkNotes(currentTarget);

      if (isCancelled) {
        return;
      }

      const normalizedTarget = currentTarget.toLowerCase();
      const items: WikilinkMenuItem[] = matchingNotes.map((note) => ({
        title: note.title,
        description: "Link existing note",
        icon: "[[",
        note,
      }));

      if (
        createWikilinkNote &&
        currentTarget.length > 0 &&
        !matchingNotes.some(
          (note) => note.title.toLowerCase() === normalizedTarget
        )
      ) {
        items.push({
          title: `Create "${currentTarget}"`,
          description: "Create note and insert resolved wikilink",
          icon: "+",
          createTarget: currentTarget,
        });
      }

      setWikilinkItems(items);
    }, 120);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [createWikilinkNote, searchWikilinkNotes, wikilinkMenu]);

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
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder: 'Type "/" for commands, or start writing...',
        emptyEditorClass: "is-editor-empty",
      }),
      BlockIdExtension,
      CalloutNode,
      ToggleNode,
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
      updateWikilinkMenu(editor);

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
      updateWikilinkMenu(editor);
    },
    onCreate: ({ editor }) => {
      updateSlashMenu(editor);
      updateWikilinkMenu(editor);
    },
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editable]);

  useEffect(() => {
    if (!slashMenu && !wikilinkMenu) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSlashMenu(null);
        setWikilinkMenu(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [slashMenu, wikilinkMenu]);

  // Handle wikilink clicks
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.dataset.type === "wikilink" && target.dataset.target) {
        e.preventDefault();

        const targetNoteId = target.dataset.noteId ?? null;
        const wikilinkTarget = target.dataset.target;

        if (targetNoteId) {
          onNavigateToNote?.(targetNoteId);
          return;
        }

        const resolvedNote = await resolveWikilinkNote?.(wikilinkTarget);

        if (resolvedNote?.id) {
          onNavigateToNote?.(resolvedNote.id);
          return;
        }

        if (!createWikilinkNote || !wikilinkTarget.trim()) {
          return;
        }

        const shouldCreate = window.confirm(
          `Create note "${wikilinkTarget}" from this wikilink?`
        );

        if (!shouldCreate) {
          return;
        }

        const createdNote = await createWikilinkNote(wikilinkTarget);
        onNavigateToNote?.(createdNote.id);
      }
    },
    [createWikilinkNote, onNavigateToNote, resolveWikilinkNote]
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

  const insertResolvedWikilink = useCallback(
    (note: NoteReference, range: { from: number; to: number }) => {
      if (!editor) {
        return;
      }

      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "text",
            text: note.title,
            marks: [
              {
                type: "wikilink",
                attrs: {
                  target: note.title,
                  displayText: note.title,
                  noteId: note.id,
                },
              },
            ],
          },
          {
            type: "text",
            text: " ",
          },
        ])
        .run();
    },
    [editor]
  );

  const handleWikilinkCommand = useCallback(
    async (item: WikilinkMenuItem) => {
      if (!wikilinkMenu) {
        return;
      }

      if (item.note) {
        insertResolvedWikilink(item.note, wikilinkMenu.range);
        setWikilinkMenu(null);
        return;
      }

      if (item.createTarget && createWikilinkNote) {
        const createdNote = await createWikilinkNote(item.createTarget);
        insertResolvedWikilink(createdNote, wikilinkMenu.range);
        setWikilinkMenu(null);
      }
    },
    [createWikilinkNote, insertResolvedWikilink, wikilinkMenu]
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
      {wikilinkMenu && wikilinkItems.length > 0 ? (
        <SlashCommandMenu
          items={wikilinkItems}
          command={handleWikilinkCommand}
          style={{
            top: wikilinkMenu.position.top,
            left: wikilinkMenu.position.left,
          }}
        />
      ) : null}
      {slashMenu && slashItems.length > 0 && !wikilinkMenu ? (
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
