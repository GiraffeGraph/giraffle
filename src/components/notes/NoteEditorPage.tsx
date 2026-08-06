"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { SafeEditor } from "@/components/editor/SafeEditor";
import { SidebarIconPicker } from "@/components/sidebar/SidebarIconPicker";

import { NoteTopbar } from "@/components/notes/NoteTopbar";
import { ReadingModeOverlay } from "@/components/notes/ReadingModeOverlay";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import type { BacklinkResult } from "@/domain/link/link.types";
import { DEFAULT_NOTE_TITLE } from "@/domain/note/note.types";
import type { NoteReference, TiptapDocument } from "@/domain/note/note.types";
import {
  moveNoteAction,
  archiveNoteAction,
  updateNoteAction,
  createNoteFromWikilinkAction,
  findNoteByTitleAction,
  getNoteExportAction,
  saveNoteContentAction,
  searchNotesByTitleAction,
} from "@/server/api/notes";
import { createSavannaFromNoteAction } from "@/server/api/savanna";
import {
  buildPageLabel,
  selectableParentPages,
  extractHeadings,
  splitDocumentIntoChunks,
  type NoteChunk,
  type TocHeading,
} from "@/components/notes/NoteEditorPage.helpers";
import { queueLocalMutation, resolveLocalMutation } from "@/lib/local-sync";

interface NoteEditorPageProps {
  note: {
    id: string;
    title: string;
    icon: string | null;
    parentId: string | null;
    isPinned: boolean;
    document: TiptapDocument;
  };
  pages: Array<{
    id: string;
    title: string;
    parentId: string | null;
  }>;
  backlinks: BacklinkResult[];
}

type SaveStatus = "saved" | "saving" | "pending";

export function NoteEditorPage({
  note,
  pages,
  backlinks,
}: NoteEditorPageProps) {
  const [title, setTitle] = useState(note.title);
  const [currentParentId, setCurrentParentId] = useState<string | null>(
    note.parentId,
  );
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isExportPending, startExportTransition] = useTransition();
  const [isParentMenuOpen, setIsParentMenuOpen] = useState(false);
  const [noteIcon, setNoteIcon] = useState<string | null>(note.icon);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [iconPickerPosition, setIconPickerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [headings, setHeadings] = useState<TocHeading[]>(() =>
    extractHeadings(note.document),
  );
  const [activeHeadingIndex, setActiveHeadingIndex] = useState<number>(-1);
  const [isTocVisible, setIsTocVisible] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [latestDocument, setLatestDocument] = useState<TiptapDocument>(
    note.document,
  );
  const parentMenuRef = useRef<HTMLDivElement | null>(null);
  const titleSaveTimeoutRef = useRef<number | null>(null);
  const pendingTitleRef = useRef(note.title);
  const persistedTitleRef = useRef(note.title);
  const titleSaveQueuedRef = useRef(false);
  const titleSaveInFlightRef = useRef(false);
  const queuedDocumentRef = useRef<TiptapDocument | null>(null);
  const documentSaveQueuedRef = useRef(false);
  const documentSaveInFlightRef = useRef(false);
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport(900);

  const parentOptions = useMemo(
    () =>
      selectableParentPages(note.id, pages).map((page) => ({
        id: page.id,
        name: buildPageLabel(page, pages),
      })),
    [note.id, pages],
  );

  const currentParentLabel = useMemo(
    () =>
      parentOptions.find((page) => page.id === currentParentId)?.name ??
      "Workspace",
    [currentParentId, parentOptions],
  );

  const effectiveTitle = title.trim() || DEFAULT_NOTE_TITLE;

  const saveStatusMeta = useMemo(() => {
    switch (saveStatus) {
      case "saving":
        return {
          label: "Saving...",
          color: "var(--md-sys-color-primary)",
        };
      case "pending":
        return {
          label: "Save pending",
          color: "var(--md-sys-color-tertiary)",
        };
      default:
        return {
          label: "Saved",
          color: "var(--md-sys-color-on-surface-variant)",
        };
    }
  }, [saveStatus]);

  const normalizeNoteTitle = useCallback(
    (value: string) => value.trim() || DEFAULT_NOTE_TITLE,
    [],
  );

  const refreshSaveStatus = useCallback(() => {
    if (titleSaveInFlightRef.current || documentSaveInFlightRef.current) {
      setSaveStatus("saving");
      return;
    }

    if (titleSaveQueuedRef.current || documentSaveQueuedRef.current) {
      setSaveStatus("pending");
      return;
    }

    setSaveStatus("saved");
  }, []);

  useEffect(() => {
    if (!isParentMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!parentMenuRef.current?.contains(event.target as Node)) {
        setIsParentMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsParentMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isParentMenuOpen]);

  useEffect(() => {
    return () => {
      if (titleSaveTimeoutRef.current !== null) {
        window.clearTimeout(titleSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const check = () => setIsTocVisible(window.innerWidth >= 1280);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const chunks = useMemo<NoteChunk[]>(
    () => splitDocumentIntoChunks(latestDocument),
    [latestDocument],
  );

  useEffect(() => {
    if (chunkIndex > chunks.length - 1) {
      setChunkIndex(Math.max(0, chunks.length - 1));
    }
  }, [chunkIndex, chunks.length]);

  const toggleReadingMode = useCallback(() => {
    setIsReadingMode((value) => {
      const next = !value;
      if (next) {
        setChunkIndex(0);
      }
      return next;
    });
  }, []);

  const goToPrevChunk = useCallback(() => {
    setChunkIndex((index) => Math.max(0, index - 1));
  }, []);

  const goToNextChunk = useCallback(() => {
    setChunkIndex((index) => Math.min(chunks.length - 1, index + 1));
  }, [chunks.length]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isToggle =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "r";
      if (isToggle) {
        event.preventDefault();
        toggleReadingMode();
        return;
      }

      if (!isReadingMode) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevChunk();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextChunk();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setIsReadingMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToNextChunk, goToPrevChunk, isReadingMode, toggleReadingMode]);

  useEffect(() => {
    if (headings.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;

    const selectors = headings
      .map((h) => (h.blockId ? `[data-block-id="${h.blockId}"]` : null))
      .filter(Boolean)
      .join(", ");

    if (!selectors) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const blockId = entry.target.getAttribute("data-block-id");
            const idx = headings.findIndex((h) => h.blockId === blockId);
            if (idx !== -1) {
              setActiveHeadingIndex(idx);
              break;
            }
          }
        }
      },
      { rootMargin: "-10% 0px -80% 0px" },
    );

    const elements = document.querySelectorAll(selectors);
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  const flushTitleSave = useCallback(async () => {
    if (titleSaveInFlightRef.current) {
      titleSaveQueuedRef.current = true;
      refreshSaveStatus();
      return;
    }

    titleSaveInFlightRef.current = true;
    refreshSaveStatus();

    try {
      while (true) {
        const normalizedTitle = normalizeNoteTitle(pendingTitleRef.current);

        if (normalizedTitle === persistedTitleRef.current) {
          titleSaveQueuedRef.current = false;
          break;
        }

        titleSaveQueuedRef.current = false;
        refreshSaveStatus();

        const mutationId = queueLocalMutation({
          entityType: "note",
          entityId: note.id,
          actionType: "update-title",
          payload: { title: normalizedTitle },
        });

        try {
          await updateNoteAction(note.id, { title: normalizedTitle });
          persistedTitleRef.current = normalizedTitle;
        } finally {
          resolveLocalMutation(mutationId);
        }

        if (
          normalizeNoteTitle(pendingTitleRef.current) ===
          persistedTitleRef.current
        ) {
          break;
        }

        titleSaveQueuedRef.current = true;
      }
    } finally {
      titleSaveInFlightRef.current = false;
      refreshSaveStatus();
    }
  }, [normalizeNoteTitle, note.id, refreshSaveStatus]);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      pendingTitleRef.current = newTitle;
      titleSaveQueuedRef.current = true;
      refreshSaveStatus();

      if (titleSaveTimeoutRef.current !== null) {
        window.clearTimeout(titleSaveTimeoutRef.current);
      }

      titleSaveTimeoutRef.current = window.setTimeout(() => {
        titleSaveTimeoutRef.current = null;
        void flushTitleSave();
      }, 450);
    },
    [flushTitleSave, refreshSaveStatus],
  );

  const handleTitleBlur = useCallback(() => {
    if (titleSaveTimeoutRef.current !== null) {
      window.clearTimeout(titleSaveTimeoutRef.current);
      titleSaveTimeoutRef.current = null;
    }

    void flushTitleSave();
  }, [flushTitleSave]);

  const handleParentChange = useCallback(
    async (nextParentId: string) => {
      const normalizedParentId = nextParentId || null;
      setCurrentParentId(normalizedParentId);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "move-page",
        payload: { parentId: normalizedParentId },
      });
      await updateNoteAction(note.id, { parentId: normalizedParentId });
      resolveLocalMutation(mutationId);
      router.refresh();
    },
    [note.id, router],
  );

  const handleSelectParent = useCallback(
    async (nextParentId: string | null) => {
      setIsParentMenuOpen(false);
      await handleParentChange(nextParentId ?? "");
    },
    [handleParentChange],
  );

  const handlePinToggle = useCallback(async () => {
    const nextValue = !isPinned;
    setIsPinned(nextValue);
    const mutationId = queueLocalMutation({
      entityType: "note",
      entityId: note.id,
      actionType: nextValue ? "pin" : "unpin",
    });
    await updateNoteAction(note.id, { isPinned: nextValue });
    resolveLocalMutation(mutationId);
    router.refresh();
  }, [isPinned, note.id, router]);

  const handleMoveNote = useCallback(
    async (direction: "up" | "down") => {
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: `move-${direction}`,
      });
      await moveNoteAction(note.id, direction);
      resolveLocalMutation(mutationId);
      router.refresh();
    },
    [note.id, router],
  );

  const handleCopyExport = useCallback(
    (format: "markdown" | "mdx") => {
      startExportTransition(async () => {
        const content = await getNoteExportAction(note.id, format);
        await navigator.clipboard.writeText(content);
      });
    },
    [note.id],
  );

  const handleCopyNoteLink = useCallback(async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/notes/${note.id}`,
    );
  }, [note.id]);

  const handleArchiveNote = useCallback(async () => {
    await archiveNoteAction(note.id);
    router.push("/notes");
  }, [note.id, router]);

  const handleOpenInCanvas = useCallback(async () => {
    try {
      const canvasId = await createSavannaFromNoteAction(note.id);
      router.push(`/savanna/${canvasId}`);
    } catch (err) {
      console.error("Failed to open in Savanna:", err);
    }
  }, [note.id, router]);

  const flushDocumentSave = useCallback(async () => {
    if (documentSaveInFlightRef.current) {
      documentSaveQueuedRef.current = true;
      refreshSaveStatus();
      return;
    }

    documentSaveInFlightRef.current = true;
    refreshSaveStatus();

    try {
      while (queuedDocumentRef.current) {
        const nextDocument = queuedDocumentRef.current;
        queuedDocumentRef.current = null;
        documentSaveQueuedRef.current = false;
        refreshSaveStatus();

        const mutationId = queueLocalMutation({
          entityType: "note",
          entityId: note.id,
          actionType: "save-document",
          payload: {
            blockCount: nextDocument.content.length,
          },
        });

        try {
          await saveNoteContentAction(note.id, nextDocument);
        } finally {
          resolveLocalMutation(mutationId);
        }
      }
    } finally {
      documentSaveInFlightRef.current = false;
      refreshSaveStatus();
    }
  }, [note.id, refreshSaveStatus]);

  const handleSave = useCallback(
    (content: TiptapDocument) => {
      queuedDocumentRef.current = content;
      documentSaveQueuedRef.current = true;
      refreshSaveStatus();
      setHeadings(extractHeadings(content));
      setLatestDocument(content);

      if (!documentSaveInFlightRef.current) {
        void flushDocumentSave();
      }
    },
    [flushDocumentSave, refreshSaveStatus],
  );

  useEffect(() => {
    return () => {
      if (titleSaveTimeoutRef.current !== null) {
        window.clearTimeout(titleSaveTimeoutRef.current);
        titleSaveTimeoutRef.current = null;
      }
      if (titleSaveQueuedRef.current && !titleSaveInFlightRef.current) {
        void flushTitleSave();
      }
      if (documentSaveQueuedRef.current && !documentSaveInFlightRef.current) {
        void flushDocumentSave();
      }
    };
  }, [flushTitleSave, flushDocumentSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "s" || e.shiftKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (titleSaveTimeoutRef.current !== null) {
        window.clearTimeout(titleSaveTimeoutRef.current);
        titleSaveTimeoutRef.current = null;
      }
      void flushTitleSave();
      void flushDocumentSave();
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () =>
      document.removeEventListener(
        "keydown",
        onKey,
        { capture: true } as AddEventListenerOptions,
      );
  }, [flushTitleSave, flushDocumentSave]);

  const handleSearchWikilinks = useCallback(async (query: string) => {
    return searchNotesByTitleAction(query);
  }, []);

  const handleResolveWikilink = useCallback(async (target: string) => {
    return findNoteByTitleAction(target);
  }, []);

  const handleCreateWikilink = useCallback(
    async (target: string): Promise<NoteReference> => {
      return createNoteFromWikilinkAction(target, currentParentId);
    },
    [currentParentId],
  );

  const navigateToNote = useCallback(
    (noteId: string) => {
      router.push(`/notes/${noteId}`);
    },
    [router],
  );

  const handleNavigateToNote = useCallback(
    (noteId: string) => {
      navigateToNote(noteId);
    },
    [navigateToNote],
  );

  const scrollToHeading = useCallback(
    (blockId: string | null, text: string) => {
      let el: Element | null = null;
      if (blockId) {
        el = document.querySelector(`[data-block-id="${blockId}"]`);
      }
      if (!el) {
        const headingEls = document.querySelectorAll(
          ".giraffle-editor-content h1, .giraffle-editor-content h2, .giraffle-editor-content h3, .giraffle-editor-content h4, .giraffle-editor-content h5, .giraffle-editor-content h6",
        );
        for (const heading of headingEls) {
          if (heading.textContent?.trim() === text) {
            el = heading;
            break;
          }
        }
      }
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const closeIconPicker = useCallback(() => {
    setIconPickerPosition(null);
  }, []);

  const handleOpenIconPicker = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setIconPickerPosition({
        x: rect.right - 28,
        y: rect.bottom + 8,
      });
    },
    [],
  );

  const handleIconChange = useCallback(
    async (nextIcon: string | null) => {
      setNoteIcon(nextIcon);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "update-icon",
        payload: { icon: nextIcon },
      });
      await updateNoteAction(note.id, { icon: nextIcon });
      resolveLocalMutation(mutationId);
      router.refresh();
    },
    [note.id, router],
  );

  const openContextMenuAtPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      setContextMenuPosition({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const openContextMenuFromTrigger = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setContextMenuPosition({
        x: rect.right - 12,
        y: rect.bottom + 8,
      });
    },
    [],
  );

  const noteContextItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        label: isPinned ? "Unpin" : "Pin",
        tooltip: "Keep near top of note list or release",
        onSelect: handlePinToggle,
      },
      {
        label: "Open in Savanna",
        tooltip: "Spatial map centered on this note",
        onSelect: handleOpenInCanvas,
      },
      {
        label: "Move up",
        onSelect: () => handleMoveNote("up"),
      },
      {
        label: "Move down",
        onSelect: () => handleMoveNote("down"),
      },
      {
        label: "Copy note link",
        tooltip: "Internal address",
        onSelect: handleCopyNoteLink,
      },
      {
        label: "Copy Markdown",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("markdown"),
      },
      {
        label: "Copy MDX",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("mdx"),
      },
      {
        label: "Move to archive",
        tone: "danger",
        onSelect: handleArchiveNote,
      },
    ],
    [
      handleArchiveNote,
      handleCopyExport,
      handleCopyNoteLink,
      handleMoveNote,
      handleOpenInCanvas,
      handlePinToggle,
      isExportPending,
      isPinned,
    ],
  );

  return (
    <>
      <NoteTopbar
        isMobileViewport={isMobileViewport}
        iconPickerPosition={iconPickerPosition}
        noteIcon={noteIcon}
        currentParentId={currentParentId}
        currentParentLabel={currentParentLabel}
        isParentMenuOpen={isParentMenuOpen}
        parentOptions={parentOptions}
        effectiveTitle={effectiveTitle}
        isPinned={isPinned}
        isReadingMode={isReadingMode}
        saveStatusMeta={saveStatusMeta}
        parentMenuRef={parentMenuRef}
        onOpenIconPicker={handleOpenIconPicker}
        onToggleParentMenu={() => setIsParentMenuOpen((v) => !v)}
        onSelectParent={handleSelectParent}
        onGoDashboard={() => router.push("/notes")}
        onContextMenu={openContextMenuAtPointer}
        onOpenContextMenuFromTrigger={openContextMenuFromTrigger}
        onTogglePin={handlePinToggle}
        onToggleReadingMode={toggleReadingMode}
      />

      <div className="note-editor-layout">
        <article className="note-document">
          <header className="note-document-header">
            <input
              className="note-title-input"
              value={title}
              autoFocus={title === DEFAULT_NOTE_TITLE}
              onChange={(event) => handleTitleChange(event.target.value)}
              onFocus={(event) => {
                if (title === DEFAULT_NOTE_TITLE) event.currentTarget.select();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                document
                  .querySelector<HTMLElement>(".giraffle-editor-content")
                  ?.focus();
              }}
              onBlur={handleTitleBlur}
              placeholder={DEFAULT_NOTE_TITLE}
              aria-label="Page title"
            />
          </header>

          <div className="note-document-body">
            <SafeEditor
              noteId={note.id}
              initialContent={note.document}
              onSave={handleSave}
              searchWikilinkNotes={handleSearchWikilinks}
              resolveWikilinkNote={handleResolveWikilink}
              createWikilinkNote={handleCreateWikilink}
              onNavigateToNote={handleNavigateToNote}
            />
          </div>

          {backlinks.length > 0 ? (
            <div
              className={`note-backlinks${isMobileViewport ? " note-backlinks--mobile" : ""}`}
            >
              <details className="note-backlinks-details">
                <summary className="note-backlinks-summary">
                  <span className="material-symbols-outlined note-backlinks-icon" aria-hidden="true">
                    link
                  </span>
                  {backlinks.length} backlinks
                </summary>
                <ul className="note-backlinks-list">
                  {backlinks.map((backlink) => (
                    <li key={`${backlink.sourceNoteId}-${backlink.sourceBlockId ?? ""}-${backlink.targetRaw}`}>
                      <button
                        type="button"
                        className="note-backlinks-link"
                        onClick={() => navigateToNote(backlink.sourceNoteId)}
                      >
                        {backlink.sourceNoteTitle}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}

        </article>

        {isTocVisible ? (
          <aside className="note-toc">
            <div className="note-toc-sticky">
              {headings.length > 0 ? (
                <nav aria-label="Table of contents">
                  <div className="note-toc-label">Table of contents</div>
                  <ul className="note-toc-list">
                    {headings.map((heading, idx) => (
                      <li key={`${heading.blockId ?? heading.text}-${idx}`}>
                        <button
                          type="button"
                          onClick={() =>
                            scrollToHeading(heading.blockId, heading.text)
                          }
                          title={heading.text}
                          className={`note-toc-link${activeHeadingIndex === idx ? " note-toc-link--active" : ""}`}
                          style={{ paddingLeft: `${(heading.level - 1) * 10}px` }}
                        >
                          {heading.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {iconPickerPosition ? (
        <SidebarIconPicker
          position={iconPickerPosition}
          currentIcon={noteIcon}
          onClose={closeIconPicker}
          onSelect={handleIconChange}
        />
      ) : null}

      <ContextMenu
        items={noteContextItems}
        position={contextMenuPosition}
        onClose={closeContextMenu}
      />

      {isReadingMode ? (
        <ReadingModeOverlay
          noteId={note.id}
          noteTitle={effectiveTitle}
          chunks={chunks}
          chunkIndex={chunkIndex}
          onPrev={goToPrevChunk}
          onNext={goToNextChunk}
          onSelect={setChunkIndex}
          onClose={() => setIsReadingMode(false)}
          searchWikilinkNotes={handleSearchWikilinks}
          resolveWikilinkNote={handleResolveWikilink}
          createWikilinkNote={handleCreateWikilink}
          onNavigateToNote={handleNavigateToNote}
        />
      ) : null}

    </>
  );
}

