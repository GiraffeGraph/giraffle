"use client";

import { confirmDialog } from "@/components/ui/ConfirmDialog";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import CodeBlock from "@tiptap/extension-code-block";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "./extensions/table-cell";
import { TableHeader } from "./extensions/table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyDocument,
  insertBlockInDocument,
  moveBlockInDocument,
  removeBlockFromDocument,
  updateBlockInDocument,
} from "@/domain/note/block-tree";
import type {
  BlockAttributes,
  BlockNodeContent,
  NoteReference,
  TiptapDocument,
} from "@/domain/note/note.types";
import { markdownToBlocks } from "@/domain/note/note.serializer";
import { generateId } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  SpotterBlockNode,
  BlockIdExtension,
  CalloutNode,
  GhostHighlightPlugin,
  KanbanNode,
  ToggleNode,
  WikilinkMark,
  defaultSlashCommands,
  type SlashCommandItem,
} from "./extensions";
import { ColorPicker, type ColorPickerTab } from "./toolbar/ColorPicker";
import { SlashCommandMenu } from "./toolbar/SlashCommandMenu";
import {
  shouldRenderMarkdownPaste,
  insertMarkdownPaste,
} from "./markdown-paste";
import {
  resolveColorSelectionRange,
  getClosestBlockElement,
  getSelectionBlockId,
  focusBlockById,
  findBlockLocation,
  getBlockId,
  getChildBlocks,
  cloneBlockTree,
} from "./block-helpers";

/* ─── State types ─────────────────────────────────────────────── */

interface SlashMenuState {
  query: string;
  range: { from: number; to: number };
  position: { top: number; left: number };
}

interface WikilinkMenuState {
  query: string;
  target: string;
  range: { from: number; to: number };
  position: { top: number; left: number };
}

interface WikilinkMenuItem {
  title: string;
  description: string;
  icon: string;
  menuKey?: string;
  note?: NoteReference;
  createTarget?: string;
}

interface BlockToolbarState {
  blockId: string;
  position: { top: number; left: number };
}

interface BlockDropIndicatorState {
  top: number;
  left: number;
  width: number;
  targetBlockId: string;
  mode: "before" | "after";
}


/* ─── Props ───────────────────────────────────────────────────── */

interface EditorProps {
  noteId?: string;
  initialContent?: TiptapDocument;
  onSave?: (content: TiptapDocument) => void;
  editable?: boolean;
  searchWikilinkNotes?: (query: string) => Promise<NoteReference[]>;
  resolveWikilinkNote?: (target: string) => Promise<NoteReference | null>;
  createWikilinkNote?: (target: string) => Promise<NoteReference>;
  onNavigateToNote?: (noteId: string) => void;
}

/* ─── Component ───────────────────────────────────────────────── */

export function Editor({
  noteId,
  initialContent,
  onSave,
  editable = true,
  searchWikilinkNotes,
  resolveWikilinkNote,
  createWikilinkNote,
  onNavigateToNote,
}: EditorProps) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blockToolbarDelayRef = useRef<number | null>(null);
  const blockToolbarIntentRef = useRef<string | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [wikilinkMenu, setWikilinkMenu] = useState<WikilinkMenuState | null>(
    null
  );
  const [wikilinkItems, setWikilinkItems] = useState<WikilinkMenuItem[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [blockToolbar, setBlockToolbar] = useState<BlockToolbarState | null>(
    null
  );
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [blockDropIndicator, setBlockDropIndicator] =
    useState<BlockDropIndicatorState | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const colorSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const handleImageUpload = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const openImageDialog = useCallback(() => {
    setImageUrl("");
    setImageAlt("");
    setImageError(null);
    setIsImageDialogOpen(true);
  }, []);

  const slashCommandItems = useMemo<SlashCommandItem[]>(
    () => [
      {
        title: "Upload image",
        description: "Choose an image from your device and insert it into the note",
        icon: "IMG",
        shortcut: "/image",
        command: () => {
          openImageDialog();
        },
      },
      ...defaultSlashCommands.filter(
        (item) => item.shortcut !== "/image"
      ),
    ],
    [openImageDialog]
  );

  /* ─── Slash menu ───────────────────────────────────────────── */

  const updateSlashMenu = useCallback(
    (instance: TiptapEditor) => {
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
      const matchingItems = slashCommandItems.filter((item) =>
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
          top: containerRect ? caretRect.bottom - containerRect.top + 10 : 0,
          left: containerRect ? caretRect.left - containerRect.left : 0,
        },
      });
    },
    [editable, slashCommandItems]
  );

  /* ─── Wikilink menu ────────────────────────────────────────── */

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
          top: containerRect ? caretRect.bottom - containerRect.top + 10 : 0,
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

    return slashCommandItems.filter((item) =>
      item.title.toLowerCase().includes(slashMenu.query.toLowerCase())
    );
  }, [slashCommandItems, slashMenu]);

  /* ─── Block toolbar ────────────────────────────────────────── */

  const clearBlockToolbarIntent = useCallback(() => {
    if (blockToolbarDelayRef.current !== null) {
      window.clearTimeout(blockToolbarDelayRef.current);
      blockToolbarDelayRef.current = null;
    }

    blockToolbarIntentRef.current = null;
  }, []);

  const syncActiveBlock = useCallback(
    (instance: TiptapEditor) => {
      const nextActiveBlockId = getSelectionBlockId(instance);

      setActiveBlockId((currentValue) =>
        currentValue === nextActiveBlockId ? currentValue : nextActiveBlockId
      );

      if (blockToolbar?.blockId && blockToolbar.blockId !== nextActiveBlockId) {
        clearBlockToolbarIntent();
        setBlockToolbar(null);
        setIsBlockMenuOpen(false);
      }
    },
    [blockToolbar?.blockId, clearBlockToolbarIntent]
  );

  /* ─── Wikilink search effect ───────────────────────────────── */

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
        description: "Link to an existing note",
        icon: "[[",
        menuKey: `note:${note.id}`,
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
          title: `"${currentTarget}"" note`,
          description: "Create the note and insert a resolved wikilink",
          icon: "+",
          menuKey: `create:${normalizedTarget}`,
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

  /* ─── Tiptap editor instance ───────────────────────────────── */

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: {
          autolink: true,
          openOnClick: true,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      CodeBlock.configure({
        HTMLAttributes: {
          class: "giraffle-code-block",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing...\n/ to add a block · [[ to link a page",
        emptyEditorClass: "is-editor-empty",
      }),
      // ─── Text styling ───────────────────────
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      // ─── Table (official Tiptap) ────────────
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "giraffle-table",
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      // ─── Task list ──────────────────────────
      TaskList.configure({
        HTMLAttributes: {
          class: "giraffle-task-list",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "giraffle-task-item",
        },
      }),
      BlockIdExtension,
      CalloutNode,
      KanbanNode,
      ToggleNode,
      WikilinkMark,
      SpotterBlockNode,
      GhostHighlightPlugin,
    ],
    content: initialContent ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    editable,
    editorProps: {
      attributes: {
        class: "giraffle-editor-content",
      },
      handlePaste: (view, event) => {
        if (!editable) {
          return false;
        }

        const text = event.clipboardData?.getData("text/plain") ?? "";
        const html = event.clipboardData?.getData("text/html") ?? "";

        if (!shouldRenderMarkdownPaste(text, html)) {
          return false;
        }

        return insertMarkdownPaste(view, text);
      },
    },
    onUpdate: ({ editor }) => {
      updateSlashMenu(editor);
      updateWikilinkMenu(editor);
      syncActiveBlock(editor);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        const json = JSON.parse(JSON.stringify(editor.getJSON())) as TiptapDocument;
        onSave?.(json);
      }, 1000);
    },
    onSelectionUpdate: ({ editor }) => {
      updateSlashMenu(editor);
      updateWikilinkMenu(editor);
      syncActiveBlock(editor);
    },
    onCreate: ({ editor }) => {
      updateSlashMenu(editor);
      updateWikilinkMenu(editor);
      syncActiveBlock(editor);
    },
  });

  /* ─── Cleanup ──────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      clearBlockToolbarIntent();
    };
  }, [clearBlockToolbarIntent, editable]);

  /* ─── Global keyboard handlers ─────────────────────────────── */

  useEffect(() => {
    if (
      !slashMenu &&
      !wikilinkMenu &&
      !isBlockMenuOpen &&
      !isImageDialogOpen &&
      !isLinkDialogOpen
    ) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSlashMenu(null);
        setWikilinkMenu(null);
        setIsBlockMenuOpen(false);
        setShowColorPicker(false);
        setIsImageDialogOpen(false);
        setIsLinkDialogOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [
    isBlockMenuOpen,
    isImageDialogOpen,
    isLinkDialogOpen,
    showColorPicker,
    slashMenu,
    wikilinkMenu,
  ]);

  useEffect(() => {
    if (!isBlockMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest(".editor-block-toolbar") ||
        target.closest(".editor-block-context-menu")
      ) {
        return;
      }

      setIsBlockMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isBlockMenuOpen]);

  /* ─── Click handler (wikilinks) ────────────────────────────── */

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      const clickedBlock = editorRootRef.current
        ? getClosestBlockElement(target, editorRootRef.current)
        : null;

      setActiveBlockId(clickedBlock?.dataset.blockId ?? null);

      if (target.dataset.type === "wikilink" && target.dataset.target) {
        event.preventDefault();

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

        const shouldCreate = await confirmDialog({
          title: "Create note?",
          message: `Create the note "${wikilinkTarget}" from this wikilink?`,
          confirmLabel: "Create",
        });

        if (!shouldCreate) {
          return;
        }

        const createdNote = await createWikilinkNote(wikilinkTarget);
        onNavigateToNote?.(createdNote.id);
      }
    },
    [createWikilinkNote, onNavigateToNote, resolveWikilinkNote]
  );

  /* ─── Slash / wikilink command handlers ────────────────────── */

  const handleSlashCommand = useCallback(
    (commandItem: SlashCommandItem) => {
      if (!editor || !slashMenu) {
        return;
      }

      editor.chain().focus().deleteRange(slashMenu.range).run();
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

  /* ─── Bubble menu action ───────────────────────────────────── */

  const handleBubbleAction = useCallback(
    (runAction: (instance: TiptapEditor) => void) => {
      if (!editor) {
        return;
      }

      runAction(editor);
    },
    [editor]
  );

  const handleOpenLinkDialog = useCallback(() => {
    if (!editor) {
      return;
    }

    const { from, to } = editor.state.selection;
    linkSelectionRef.current = { from, to };
    setLinkUrl(editor.getAttributes("link")?.href ?? "https://");
    setIsLinkDialogOpen(true);
  }, [editor]);

  const handlePrepareColorPicker = useCallback(() => {
    if (!editor) {
      return;
    }

    const { from, to } = editor.state.selection;
    colorSelectionRef.current = { from, to };
  }, [editor]);

  const handleOpenColorPicker = useCallback(() => {
    setShowColorPicker(true);
  }, []);

  const handleCloseColorPicker = useCallback(() => {
    setShowColorPicker(false);
  }, []);

  const handleApplyTextColor = useCallback(
    (color: string | null) => {
      if (!editor) {
        return;
      }

      const chain = editor.chain().focus();
      const selectionRange = resolveColorSelectionRange(
        editor,
        colorSelectionRef.current
      );

      if (selectionRange) {
        chain.setTextSelection(selectionRange);
      }

      if (color) {
        chain.setColor(color).run();
        return;
      }

      chain.unsetColor().run();
    },
    [editor]
  );

  const handleApplyHighlightColor = useCallback(
    (color: string | null) => {
      if (!editor) {
        return;
      }

      const chain = editor.chain().focus();
      const selectionRange = resolveColorSelectionRange(
        editor,
        colorSelectionRef.current
      );

      if (selectionRange) {
        chain.setTextSelection(selectionRange);
      }

      if (color) {
        chain.setHighlight({ color }).run();
        return;
      }

      chain.unsetHighlight().run();
    },
    [editor]
  );

  const handleApplyLink = useCallback(() => {
    if (!editor) {
      return;
    }

    const normalizedUrl = linkUrl.trim();
    const chain = editor.chain().focus();

    if (linkSelectionRef.current) {
      chain.setTextSelection(linkSelectionRef.current);
    }

    if (!normalizedUrl) {
      chain.extendMarkRange("link").unsetLink().run();
    } else {
      chain
        .extendMarkRange("link")
        .setLink({
          href: normalizedUrl,
        })
        .run();
    }

    setIsLinkDialogOpen(false);
  }, [editor, linkUrl]);

  const handleInsertImageFromUrl = useCallback(() => {
    const normalizedUrl = imageUrl.trim();

    if (!editor) {
      return;
    }

    if (!normalizedUrl) {
      setImageError("Enter an image URL.");
      return;
    }

    editor
      .chain()
      .focus()
      .setImage({
        src: normalizedUrl,
        alt: imageAlt.trim(),
      })
      .run();

    setImageError(null);
    setImageUrl("");
    setImageAlt("");
    setIsImageDialogOpen(false);
  }, [editor, imageAlt, imageUrl]);

  /* ─── Document mutation helper ─────────────────────────────── */

  const applyDocumentMutation = useCallback(
    (
      mutate: (document: TiptapDocument) => TiptapDocument,
      focusBlockId?: string | null
    ) => {
      if (!editor) {
        return;
      }

      const currentDocument = JSON.parse(
        JSON.stringify(editor.getJSON())
      ) as TiptapDocument;
      const nextDocument = mutate(currentDocument);

      editor.commands.setContent(nextDocument, {
        emitUpdate: true,
      });

      const nextFocusBlockId = focusBlockId ?? blockToolbar?.blockId ?? null;

      window.requestAnimationFrame(() => {
        if (nextFocusBlockId) {
          focusBlockById(editor, nextFocusBlockId);
        } else {
          editor.commands.focus("end");
        }
      });
    },
    [blockToolbar?.blockId, editor]
  );

  /* ─── Block toolbar mouse handlers ─────────────────────────── */

  const handleBlockToolbarMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!editable || !editorRootRef.current) {
        return;
      }

      const target = event.target as HTMLElement;

      if (
        target.closest(".editor-block-toolbar") ||
        target.closest(".editor-block-context-menu")
      ) {
        return;
      }

      const blockElement = getClosestBlockElement(target, editorRootRef.current);

      if (!blockElement) {
        clearBlockToolbarIntent();

        if (!isBlockMenuOpen && blockToolbar) {
          setBlockToolbar(null);
        }

        return;
      }

      const blockId = blockElement.dataset.blockId;

      if (!blockId || blockId !== activeBlockId) {
        clearBlockToolbarIntent();

        if (!isBlockMenuOpen && blockToolbar) {
          setBlockToolbar(null);
        }

        return;
      }

      const rootRect = editorRootRef.current.getBoundingClientRect();
      const blockRect = blockElement.getBoundingClientRect();
      const isInsideToolbarGutter =
        event.clientX >= blockRect.left - 32 && event.clientX <= blockRect.left + 12;

      if (!isInsideToolbarGutter) {
        clearBlockToolbarIntent();

        if (!isBlockMenuOpen && blockToolbar) {
          setBlockToolbar(null);
        }

        return;
      }

      const nextToolbar = {
        blockId,
        position: {
          top: blockRect.top - rootRect.top + 1,
          left: Math.max(0, blockRect.left - rootRect.left - 40),
        },
      } satisfies BlockToolbarState;
      const toolbarIntentKey = `${nextToolbar.blockId}:${Math.round(nextToolbar.position.top)}:${Math.round(nextToolbar.position.left)}`;

      if (
        blockToolbar?.blockId === nextToolbar.blockId &&
        blockToolbar.position.top === nextToolbar.position.top &&
        blockToolbar.position.left === nextToolbar.position.left
      ) {
        clearBlockToolbarIntent();
        return;
      }

      if (blockToolbarIntentRef.current === toolbarIntentKey) {
        return;
      }

      clearBlockToolbarIntent();
      blockToolbarIntentRef.current = toolbarIntentKey;
      blockToolbarDelayRef.current = window.setTimeout(() => {
        setBlockToolbar((currentValue) => {
          if (
            currentValue?.blockId === nextToolbar.blockId &&
            currentValue.position.top === nextToolbar.position.top &&
            currentValue.position.left === nextToolbar.position.left
          ) {
            return currentValue;
          }

          return nextToolbar;
        });
        blockToolbarDelayRef.current = null;
        blockToolbarIntentRef.current = null;
      }, 150);
    },
    [activeBlockId, blockToolbar, clearBlockToolbarIntent, editable, isBlockMenuOpen]
  );

  const handleBlockToolbarLeave = useCallback(() => {
    clearBlockToolbarIntent();
    setBlockToolbar(null);
    setIsBlockMenuOpen(false);
  }, [clearBlockToolbarIntent]);

  /* ─── Block mutation handlers ──────────────────────────────── */

  const handleInsertBlockBelow = useCallback(() => {
    if (!blockToolbar) {
      return;
    }

    const nextBlockId = generateId();
    const nextBlock: BlockNodeContent = {
      type: "paragraph",
      attrs: {
        blockId: nextBlockId,
      },
      content: [],
    };

    applyDocumentMutation(
      (document) => {
        const location = findBlockLocation(document.content, blockToolbar.blockId);

        if (!location) {
          return document;
        }

        return insertBlockInDocument(document, nextBlock, {
          parentBlockId: location.parentBlockId,
          afterBlockId: blockToolbar.blockId,
        });
      },
      nextBlockId
    );
  }, [applyDocumentMutation, blockToolbar]);

  const handleMoveBlock = useCallback(
    (direction: "up" | "down") => {
      if (!blockToolbar) {
        return;
      }

      applyDocumentMutation((document) => {
        const location = findBlockLocation(document.content, blockToolbar.blockId);

        if (!location) {
          return document;
        }

        const targetIndex =
          direction === "up" ? location.index - 1 : location.index + 1;

        if (targetIndex < 0 || targetIndex >= location.siblings.length) {
          return document;
        }

        const afterBlockId =
          direction === "up"
            ? targetIndex === 0
              ? null
              : getBlockId(location.siblings[targetIndex - 1])
            : getBlockId(location.siblings[targetIndex]);

        return moveBlockInDocument(document, blockToolbar.blockId, {
          parentBlockId: location.parentBlockId,
          afterBlockId,
        });
      });
    },
    [applyDocumentMutation, blockToolbar]
  );

  const handleDeleteBlock = useCallback(() => {
    if (!blockToolbar) {
      return;
    }

    applyDocumentMutation((document) => {
      const result = removeBlockFromDocument(document, blockToolbar.blockId);
      const nextDocument =
        result.document.content.length > 0 ? result.document : createEmptyDocument();

      return nextDocument;
    }, null);
  }, [applyDocumentMutation, blockToolbar]);

  const handleDuplicateBlock = useCallback(() => {
    if (!blockToolbar) {
      return;
    }

    applyDocumentMutation((document) => {
      const location = findBlockLocation(document.content, blockToolbar.blockId);

      if (!location) {
        return document;
      }

      const clonedBlock = cloneBlockTree(location.block);
      return insertBlockInDocument(document, clonedBlock, {
        parentBlockId: location.parentBlockId,
        afterBlockId: blockToolbar.blockId,
      });
    });
  }, [applyDocumentMutation, blockToolbar]);

  const handleTransformBlock = useCallback(
    (nextType: "paragraph" | "heading" | "callout" | "toggle") => {
      if (!blockToolbar) {
        return;
      }

      applyDocumentMutation((document) => {
        const location = findBlockLocation(document.content, blockToolbar.blockId);

        if (!location) {
          return document;
        }

        const nextAttrs: BlockAttributes = {
          ...(location.block.attrs ?? {}),
          blockId: blockToolbar.blockId,
        };

        if (nextType === "heading") {
          nextAttrs.level = 2;
        }

        if (nextType === "callout") {
          nextAttrs.tone =
            typeof nextAttrs.tone === "string" ? nextAttrs.tone : "info";
          nextAttrs.title =
            typeof nextAttrs.title === "string" ? nextAttrs.title : "Info";
        }

        if (nextType === "toggle") {
          nextAttrs.summary =
            typeof nextAttrs.summary === "string"
              ? nextAttrs.summary
              : "Details";
        }

        if (nextType === "paragraph") {
          delete nextAttrs.level;
          delete nextAttrs.tone;
          delete nextAttrs.title;
          delete nextAttrs.summary;
        }

        return updateBlockInDocument(document, blockToolbar.blockId, {
          type: nextType,
          attrs: nextAttrs,
        });
      });
      setIsBlockMenuOpen(false);
    },
    [applyDocumentMutation, blockToolbar]
  );

  /* ─── Image upload ─────────────────────────────────────────── */

  const handleImageFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file || !editable) {
        return;
      }

      setIsUploadingImage(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (imageAlt.trim()) {
          formData.append("altText", imageAlt.trim());
        }

        if (noteId) {
          formData.append("noteId", noteId);
        }

        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Upload imagenemedi");
        }

        const payload = (await response.json()) as {
          src: string;
          alt?: string;
        };

        editor
          ?.chain()
          .focus()
          .setImage({
            src: payload.src,
            alt: payload.alt ?? (imageAlt.trim() || file.name),
          })
          .run();
        setImageError(null);
        setImageUrl("");
        setImageAlt("");
        setIsImageDialogOpen(false);
      } finally {
        event.target.value = "";
        setIsUploadingImage(false);
      }
    },
    [editable, editor, imageAlt, noteId]
  );

  /* ─── Block drag & drop ────────────────────────────────────── */

  const handleBlockDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!editable || !draggedBlockId || !editorRootRef.current) {
        return;
      }

      const target = event.target as HTMLElement;
      const blockElement = getClosestBlockElement(target, editorRootRef.current);

      if (!blockElement) {
        setBlockDropIndicator(null);
        return;
      }

      const targetBlockId = blockElement.dataset.blockId;

      if (!targetBlockId || targetBlockId === draggedBlockId) {
        setBlockDropIndicator(null);
        return;
      }

      event.preventDefault();
      const rootRect = editorRootRef.current.getBoundingClientRect();
      const blockRect = blockElement.getBoundingClientRect();
      const mode =
        event.clientY < blockRect.top + blockRect.height / 2 ? "before" : "after";

      setBlockDropIndicator({
        top:
          (mode === "before" ? blockRect.top : blockRect.bottom) -
          rootRect.top -
          1,
        left: blockRect.left - rootRect.left,
        width: blockRect.width,
        targetBlockId,
        mode,
      });
    },
    [draggedBlockId, editable]
  );

  const handleBlockDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!draggedBlockId || !blockDropIndicator) {
        return;
      }

      event.preventDefault();
      applyDocumentMutation((document) => {
        const location = findBlockLocation(
          document.content,
          blockDropIndicator.targetBlockId
        );

        if (!location) {
          return document;
        }

        const afterBlockId =
          blockDropIndicator.mode === "before"
            ? location.index > 0
              ? getBlockId(location.siblings[location.index - 1])
              : null
            : blockDropIndicator.targetBlockId;

        return moveBlockInDocument(document, draggedBlockId, {
          parentBlockId: location.parentBlockId,
          afterBlockId,
        });
      }, draggedBlockId);

      setDraggedBlockId(null);
      setBlockDropIndicator(null);
    },
    [applyDocumentMutation, blockDropIndicator, draggedBlockId]
  );

  /* ─── Loading state ────────────────────────────────────────── */

  if (!editor) {
    return (
      <div className="editor-loading">
        <div className="editor-loading-skeleton" />
        <div className="editor-loading-skeleton short" />
        <div className="editor-loading-skeleton" />
      </div>
    );
  }

  /* ─── Render ───────────────────────────────────────────────── */

  const selectedText = editor.state.doc
    .textBetween(editor.state.selection.from, editor.state.selection.to, " ")
    .trim();
  const colorPickerDefaultTab: ColorPickerTab =
    editor.isActive("table") && selectedText.length === 0 ? "cell" : "text";

  return (
    <div
      ref={editorRootRef}
      className={`giraffle-editor ${editable ? "editable" : "readonly"}`}
      onClick={handleClick}
      onMouseMove={handleBlockToolbarMouseMove}
      onMouseLeave={handleBlockToolbarLeave}
      onDragOver={handleBlockDragOver}
      onDrop={handleBlockDrop}
      onDragEnd={() => {
        setDraggedBlockId(null);
        setBlockDropIndicator(null);
      }}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleImageFileChange}
      />

      {/* ── Block toolbar ─────────────────────────────────────── */}

      {editable && blockToolbar ? (
        <div
          className="editor-block-toolbar"
          style={{
            top: blockToolbar.position.top,
            left: blockToolbar.position.left,
          }}
        >
          <button
            type="button"
            className={`editor-block-button editor-block-handle${isBlockMenuOpen ? " active" : ""}`}
            data-drag-handle="true"
            draggable
            onClick={() => {
              setActiveBlockId(blockToolbar.blockId);
              setIsBlockMenuOpen((currentValue) => !currentValue);
            }}
            onDragStart={() => {
              setActiveBlockId(blockToolbar.blockId);
              setDraggedBlockId(blockToolbar.blockId);
              setIsBlockMenuOpen(false);
            }}
            aria-label="Open block menu or drag"
            aria-haspopup="menu"
            aria-expanded={isBlockMenuOpen}
            title="Drag or open menu"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              drag_indicator
            </span>
          </button>
        </div>
      ) : null}

      {/* ── Block context menu ────────────────────────────────── */}

      {editable && blockToolbar && isBlockMenuOpen ? (
        <div
          className="editor-block-context-menu"
          style={{
            top: blockToolbar.position.top + 38,
            left: blockToolbar.position.left,
          }}
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleInsertBlockBelow();
              setIsBlockMenuOpen(false);
            }}
          >
            Add block below
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleMoveBlock("up");
              setIsBlockMenuOpen(false);
            }}
          >
            Move up
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleMoveBlock("down");
              setIsBlockMenuOpen(false);
            }}
          >
            Move down
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleDuplicateBlock();
              setIsBlockMenuOpen(false);
            }}
          >
            Duplicate
          </button>
          <div className="editor-block-context-divider" />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("paragraph")}
          >
            Convert to paragraph
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("heading")}
          >
            Convert to heading
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("callout")}
          >
            Turn into callout
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("toggle")}
          >
            Turn into toggle section
          </button>
          <div className="editor-block-context-divider" />
          <button
            type="button"
            className="danger"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleDeleteBlock();
              setIsBlockMenuOpen(false);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}

      {/* ── Bubble menu (expanded) ────────────────────────────── */}

      {editable ? (
        <BubbleMenu
          editor={editor}
          className="editor-bubble-menu"
          options={{
            placement: "top",
          }}
          shouldShow={({ editor: currentEditor, from, to }) => {
            if (!editable) {
              return false;
            }

            if (currentEditor.isActive("table")) {
              return true;
            }

            if (!currentEditor.isFocused) {
              return false;
            }

            if (from === to) {
              return false;
            }

            const selectedText = currentEditor.state.doc
              .textBetween(from, to, " ")
              .trim();

            return selectedText.length > 0;
          }}
        >
          {/* Bold */}
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("bold") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleBold().run();
              });
            }}
            title="Bold (Ctrl+B)"
          >
            B
          </button>

          {/* Italic */}
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("italic") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleItalic().run();
              });
            }}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>

          {/* Underline */}
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("underline") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleUnderline().run();
              });
            }}
            title="Underline (Ctrl+U)"
          >
            <u>U</u>
          </button>

          {/* Strikethrough */}
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("strike") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleStrike().run();
              });
            }}
            title="Strikethrough"
          >
            <s>S</s>
          </button>

          {/* Code */}
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("code") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleCode().run();
              });
            }}
            title="Code"
          >
            {"</>"}
          </button>

          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("link") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleOpenLinkDialog();
            }}
            title="Add or edit link"
          >
            LN
          </button>

          <div className="editor-bubble-divider" />

          {/* Heading buttons */}
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("heading", { level: 1 }) ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleHeading({ level: 1 }).run();
              });
            }}
            title="Heading 1"
          >
            H1
          </button>
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("heading", { level: 2 }) ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleHeading({ level: 2 }).run();
              });
            }}
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("heading", { level: 3 }) ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleHeading({ level: 3 }).run();
              });
            }}
            title="Heading 3"
          >
            H3
          </button>

          <div className="editor-bubble-divider" />

          {/* Lists */}
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("bulletList") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleBulletList().run();
              });
            }}
            title="Bullet List"
          >
            UL
          </button>
          <button
            type="button"
            className={`editor-bubble-button ${
              editor.isActive("blockquote") ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBubbleAction((instance) => {
                instance.chain().focus().toggleBlockquote().run();
              });
            }}
            title="Quote"
          >
            QT
          </button>

          {editor.isActive("table") ? (
            <>
              <div className="editor-bubble-divider" />
              <button
                type="button"
                className="editor-bubble-button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBubbleAction((instance) => {
                    instance.chain().focus().addRowAfter().run();
                  });
                }}
                title="Add row"
              >
                +R
              </button>
              <button
                type="button"
                className="editor-bubble-button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBubbleAction((instance) => {
                    instance.chain().focus().addColumnAfter().run();
                  });
                }}
                title="Add column"
              >
                +C
              </button>
              <button
                type="button"
                className="editor-bubble-button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBubbleAction((instance) => {
                    instance.chain().focus().toggleHeaderRow().run();
                  });
                }}
                title="Header row"
              >
                HR
              </button>
              <button
                type="button"
                className="editor-bubble-button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBubbleAction((instance) => {
                    instance.chain().focus().deleteRow().run();
                  });
                }}
                title="Delete row"
              >
                -R
              </button>
              <button
                type="button"
                className="editor-bubble-button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBubbleAction((instance) => {
                    instance.chain().focus().deleteColumn().run();
                  });
                }}
                title="Delete column"
              >
                -C
              </button>
              <button
                type="button"
                className="editor-bubble-button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBubbleAction((instance) => {
                    instance.chain().focus().deleteTable().run();
                  });
                }}
                title="Delete table"
              >
                TB
              </button>
            </>
          ) : null}

          <div className="editor-bubble-divider" />

          {/* Color picker toggle */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={`editor-bubble-button ${showColorPicker ? "active" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handlePrepareColorPicker();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleOpenColorPicker();
              }}
              title="Text & Background Color"
            >
              <span
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: 1,
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 700 }}>A</span>
                <span
                  style={{
                    width: "14px",
                    height: "3px",
                    borderRadius: "1px",
                    background:
                      editor.getAttributes("textStyle")?.color ||
                      "var(--accent)",
                  }}
                />
              </span>
            </button>
          </div>
        </BubbleMenu>
      ) : null}

      {showColorPicker ? (
        <div
          className="md-dialog-scrim"
          onClick={handleCloseColorPicker}
        >
          <div
            className="md-dialog"
            style={{ maxWidth: "340px", width: "92vw" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="md-dialog-headline">Colors</h2>
            <div className="md-dialog-content" style={{ paddingTop: "4px" }}>
              <ColorPicker
                currentTextColor={editor.getAttributes("textStyle")?.color ?? undefined}
                currentHighlightColor={editor.getAttributes("highlight")?.color ?? undefined}
                defaultTab={colorPickerDefaultTab}
                allowCellColor={editor.isActive("table")}
                currentCellColor={
                  editor.getAttributes("tableCell")?.backgroundColor ??
                  editor.getAttributes("tableHeader")?.backgroundColor ??
                  undefined
                }
                onCellColor={(color) => {
                  if (color === null) {
                    editor.chain().focus().setCellAttribute("backgroundColor", null).run();
                  } else {
                    editor.chain().focus().setCellAttribute("backgroundColor", color).run();
                  }
                }}
                onTextColor={handleApplyTextColor}
                onHighlightColor={handleApplyHighlightColor}
                onClose={handleCloseColorPicker}
              />
            </div>
            <div className="md-dialog-actions">
              <Button variant="text" onClick={handleCloseColorPicker}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Editor content ────────────────────────────────────── */}

      <EditorContent editor={editor} />

      {/* ── Drop indicator ────────────────────────────────────── */}

      {blockDropIndicator ? (
        <div
          className="editor-block-drop-indicator"
          style={{
            top: blockDropIndicator.top,
            left: blockDropIndicator.left,
            width: blockDropIndicator.width,
          }}
        />
      ) : null}

      {/* ── Wikilink menu ─────────────────────────────────────── */}

      {wikilinkMenu && wikilinkItems.length > 0 ? (
        <SlashCommandMenu
          items={wikilinkItems}
          command={handleWikilinkCommand}
          title="Wikilinks"
          style={{
            top: wikilinkMenu.position.top,
            left: wikilinkMenu.position.left,
          }}
        />
      ) : null}

      {/* ── Slash menu ────────────────────────────────────────── */}

      {slashMenu && slashItems.length > 0 && !wikilinkMenu ? (
        <SlashCommandMenu
          items={slashItems}
          command={handleSlashCommand}
          title="Block commands"
          style={{
            top: slashMenu.position.top,
            left: slashMenu.position.left,
          }}
        />
      ) : null}

      {isImageDialogOpen ? (
        <div
          className="md-dialog-scrim"
          onClick={() => setIsImageDialogOpen(false)}
        >
          <div
            className="md-dialog"
            style={{ maxWidth: "520px", width: "90vw" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="md-dialog-headline">GÃ¶rsel ekle</h2>
            <div className="md-dialog-content" style={{ display: "grid", gap: "16px" }}>
              <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                <div className="md-text-field-container">
                  <input
                    className="md-text-field-input"
                    value={imageUrl}
                    onChange={(event) => {
                      setImageUrl(event.target.value);
                      if (imageError) {
                        setImageError(null);
                      }
                    }}
                    placeholder=" "
                  />
                  <span className="md-text-field-label">GÃ¶rsel URL&apos;si</span>
                </div>
              </div>

              <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                <div className="md-text-field-container">
                  <input
                    className="md-text-field-input"
                    value={imageAlt}
                    onChange={(event) => setImageAlt(event.target.value)}
                    placeholder=" "
                  />
                  <span className="md-text-field-label">Alt metin</span>
                </div>
              </div>

              {imageError ? (
                <div
                  style={{
                    color: "var(--md-sys-color-error)",
                    fontSize: "var(--md-sys-typescale-body-small-size)",
                  }}
                >
                  {imageError}
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <Button
                  variant="outlined"
                  onClick={handleImageUpload}
                  disabled={isUploadingImage}
                >
                  {isUploadingImage ? "YÃ¼kleniyor..." : "Cihazdan seÃ§"}
                </Button>
                <div className="md-dialog-actions" style={{ margin: 0 }}>
                  <Button
                    variant="text"
                    onClick={() => setIsImageDialogOpen(false)}
                  >
                    VazgeÃ§
                  </Button>
                  <Button variant="filled" onClick={handleInsertImageFromUrl}>
                    URL ile ekle
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isLinkDialogOpen ? (
        <div
          className="md-dialog-scrim"
          onClick={() => setIsLinkDialogOpen(false)}
        >
          <div
            className="md-dialog"
            style={{ maxWidth: "480px", width: "88vw" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="md-dialog-headline">Link dÃ¼zenle</h2>
            <div className="md-dialog-content" style={{ display: "grid", gap: "16px" }}>
              <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                <div className="md-text-field-container">
                  <input
                    className="md-text-field-input"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder=" "
                  />
                  <span className="md-text-field-label">URL</span>
                </div>
              </div>
            </div>
            <div className="md-dialog-actions">
              <Button
                variant="text"
                onClick={() => {
                  setLinkUrl("");
                  handleApplyLink();
                }}
              >
                Linki kaldÄ±r
              </Button>
              <Button
                variant="text"
                onClick={() => setIsLinkDialogOpen(false)}
              >
                VazgeÃ§
              </Button>
              <Button variant="filled" onClick={handleApplyLink}>
                Uygula
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

