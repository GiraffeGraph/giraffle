"use client";

import type { Editor as TiptapEditor } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
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
import { generateId } from "@/lib/utils";
import {
  AgentBlockNode,
  BlockIdExtension,
  CalloutNode,
  GhostHighlightPlugin,
  TableBlockNode,
  ToggleNode,
  WikilinkMark,
  defaultSlashCommands,
  type SlashCommandItem,
} from "./extensions";
import { SlashCommandMenu } from "./toolbar/SlashCommandMenu";

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

interface BlockToolbarState {
  blockId: string;
  position: {
    top: number;
    left: number;
  };
}

interface BlockDropIndicatorState {
  top: number;
  left: number;
  width: number;
  targetBlockId: string;
  mode: "before" | "after";
}

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
  const [, setIsUploadingImage] = useState(false);

  const handleImageUpload = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const slashCommandItems = useMemo<SlashCommandItem[]>(
    () => [
      {
        title: "Görsel yükle",
        description: "Cihazından görsel seç ve nota ekle",
        icon: "UP",
        shortcut: "/upload",
        command: () => {
          handleImageUpload();
        },
      },
      ...defaultSlashCommands,
    ],
    [handleImageUpload]
  );

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
        description: "Var olan nota bağlan",
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
          title: `"${currentTarget}" notunu oluştur`,
          description: "Not oluştur ve çözümlenmiş wikilink ekle",
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
          class: "giraffle-code-block",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder: "Yazmaya başla...\n/ ile blok ekle · [[ ile sayfa bağla",
        emptyEditorClass: "is-editor-empty",
      }),
      BlockIdExtension,
      CalloutNode,
      TableBlockNode,
      ToggleNode,
      WikilinkMark,
      AgentBlockNode,
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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      clearBlockToolbarIntent();
    };
  }, [clearBlockToolbarIntent, editable]);

  useEffect(() => {
    if (!slashMenu && !wikilinkMenu && !isBlockMenuOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSlashMenu(null);
        setWikilinkMenu(null);
        setIsBlockMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isBlockMenuOpen, slashMenu, wikilinkMenu]);

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

        const shouldCreate = window.confirm(
          `Bu wikilinkten "${wikilinkTarget}" notu oluşturulsun mu?`
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

  const handleBubbleAction = useCallback(
    (runAction: (instance: TiptapEditor) => void) => {
      if (!editor) {
        return;
      }

      runAction(editor);
    },
    [editor]
  );

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
            typeof nextAttrs.title === "string" ? nextAttrs.title : "Vurgu";
        }

        if (nextType === "toggle") {
          nextAttrs.summary =
            typeof nextAttrs.summary === "string"
              ? nextAttrs.summary
              : "Ayrıntılar";
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

  const handleEditTableBlock = useCallback(() => {
    if (!blockToolbar) {
      return;
    }

    applyDocumentMutation((document) => {
      const location = findBlockLocation(document.content, blockToolbar.blockId);

      if (!location || location.block.type !== "table") {
        return document;
      }

      const currentRows = getTableRows(location.block);
      const initialValue = currentRows
        .map((row) => row.join(" | "))
        .join("\n");
      const nextValue = window.prompt(
        "Tablo satırlarını düzenle. Her satır yeni satır, hücreler | ile ayrılır.",
        initialValue
      );

      if (nextValue === null) {
        return document;
      }

      const nextRows = parseTableRows(nextValue);
      const nextCaption = window.prompt(
        "Tablo başlığı/açıklaması",
        typeof location.block.attrs?.caption === "string"
          ? location.block.attrs.caption
          : ""
      );

      return updateBlockInDocument(document, blockToolbar.blockId, {
        attrs: {
          ...(location.block.attrs ?? {}),
          blockId: blockToolbar.blockId,
          rows: nextRows,
          caption: nextCaption?.trim() || null,
        },
      });
    });
    setIsBlockMenuOpen(false);
  }, [applyDocumentMutation, blockToolbar]);

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

        if (noteId) {
          formData.append("noteId", noteId);
        }

        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Görsel yüklenemedi");
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
            alt: payload.alt ?? file.name,
          })
          .run();
      } finally {
        event.target.value = "";
        setIsUploadingImage(false);
      }
    },
    [editable, editor, noteId]
  );

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
            aria-label="Blok menüsünü aç veya sürükle"
            aria-haspopup="menu"
            aria-expanded={isBlockMenuOpen}
            title="Sürükle veya menüyü aç"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              drag_indicator
            </span>
          </button>
        </div>
      ) : null}

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
            Alta yeni blok ekle
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleMoveBlock("up");
              setIsBlockMenuOpen(false);
            }}
          >
            Yukarı taşı
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleMoveBlock("down");
              setIsBlockMenuOpen(false);
            }}
          >
            Aşağı taşı
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleDuplicateBlock();
              setIsBlockMenuOpen(false);
            }}
          >
            Kopyasını oluştur
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("paragraph")}
          >
            Paragrafa dönüştür
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("heading")}
          >
            Başlığa dönüştür
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("callout")}
          >
            Vurgu yap
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleTransformBlock("toggle")}
          >
            Açılır bölüm yap
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleEditTableBlock}
          >
            Tabloyu düzenle
          </button>
          <button
            type="button"
            className="danger"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              handleDeleteBlock();
              setIsBlockMenuOpen(false);
            }}
          >
            Sil
          </button>
        </div>
      ) : null}

      {editable ? (
        <BubbleMenu
          editor={editor}
          className="editor-bubble-menu"
          options={{
            placement: "top",
          }}
          shouldShow={({ editor: currentEditor, from, to }) => {
            if (!editable || !currentEditor.isFocused || from === to) {
              return false;
            }

            const selectedText = currentEditor.state.doc
              .textBetween(from, to, " ")
              .trim();

            return selectedText.length > 0;
          }}
        >
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
          >
            B
          </button>
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
          >
            I
          </button>
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
          >
            {"</>"}
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
          >
            H2
          </button>
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
          >
            QT
          </button>
        </BubbleMenu>
      ) : null}

      <EditorContent editor={editor} />

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

      {wikilinkMenu && wikilinkItems.length > 0 ? (
        <SlashCommandMenu
          items={wikilinkItems}
          command={handleWikilinkCommand}
          title="Wikilinkler"
          subtitle="Var olan notu seç veya yeni not oluştur"
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
          title="Blok komutları"
          subtitle="Yön tuşları ile gezin, Enter ile ekle"
          style={{
            top: slashMenu.position.top,
            left: slashMenu.position.left,
          }}
        />
      ) : null}
    </div>
  );
}

function getClosestBlockElement(
  target: HTMLElement,
  rootElement: HTMLElement
): HTMLElement | null {
  const blockElement = target.closest("[data-block-id]");

  if (!(blockElement instanceof HTMLElement)) {
    return null;
  }

  if (!rootElement.contains(blockElement)) {
    return null;
  }

  return blockElement;
}

function getSelectionBlockId(editor: TiptapEditor) {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    const blockId = node.attrs?.blockId;

    if (typeof blockId === "string") {
      return blockId;
    }
  }

  return null;
}

function focusBlockById(editor: TiptapEditor, blockId: string) {
  const blockElement = document.querySelector(
    `[data-block-id="${blockId}"]`
  );

  if (!(blockElement instanceof HTMLElement)) {
    editor.commands.focus("end");
    return;
  }

  try {
    const position = editor.view.posAtDOM(blockElement, 0);
    editor.chain().focus().setTextSelection(position + 1).run();
  } catch {
    editor.commands.focus("end");
  }
}

function findBlockLocation(
  blocks: BlockNodeContent[],
  blockId: string,
  parentBlockId: string | null = null
): {
  block: BlockNodeContent;
  parentBlockId: string | null;
  siblings: BlockNodeContent[];
  index: number;
} | null {
  for (const [index, block] of blocks.entries()) {
    if (getBlockId(block) === blockId) {
      return {
        block,
        parentBlockId,
        siblings: blocks,
        index,
      };
    }

    const childBlocks = getChildBlocks(block);

    if (childBlocks.length === 0) {
      continue;
    }

    const nestedResult = findBlockLocation(
      childBlocks,
      blockId,
      getBlockId(block) ?? null
    );

    if (nestedResult) {
      return nestedResult;
    }
  }

  return null;
}

function getBlockId(block: BlockNodeContent) {
  return typeof block.attrs?.blockId === "string" ? block.attrs.blockId : null;
}

function getChildBlocks(node: BlockNodeContent) {
  return (node.content ?? []).filter(
    (child): child is BlockNodeContent => child.type !== "text"
  );
}

function cloneBlockTree(block: BlockNodeContent): BlockNodeContent {
  const nextBlockId = generateId();

  return {
    ...block,
    attrs: {
      ...(block.attrs ?? {}),
      blockId: nextBlockId,
    },
    content: (block.content ?? []).map((child) =>
      child.type === "text" ? { ...child } : cloneBlockTree(child)
    ),
  };
}

function getTableRows(block: BlockNodeContent): string[][] {
  const rows = block.attrs?.rows;

  if (!Array.isArray(rows)) {
    return [
      ["Sütun 1", "Sütun 2"],
      ["Değer", "Değer"],
    ];
  }

  return rows.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row)]
  );
}

function parseTableRows(value: string): string[][] {
  const rows = value
    .split("\n")
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell, index, cells) => cell.length > 0 || cells.length === 1)
    )
    .filter((row) => row.length > 0);

  return rows.length > 0
    ? rows
    : [
        ["Sütun 1", "Sütun 2"],
        ["Değer", "Değer"],
      ];
}
