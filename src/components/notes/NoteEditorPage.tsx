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
import { PublishPopover } from "@/components/notes/PublishPopover";
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
  buildFolderLabel,
  extractHeadings,
  splitDocumentIntoChunks,
  type NoteChunk,
  type TocHeading,
} from "@/components/notes/NoteEditorPage.helpers";
import { queueLocalMutation, resolveLocalMutation } from "@/lib/local-sync";
import { useRegisterTab } from "@/components/tabs/use-register-tab";

interface NoteEditorPageProps {
  note: {
    id: string;
    title: string;
    slug: string | null;
    icon: string | null;
    folderId: string | null;
    isPinned: boolean;
    isPublished: boolean;
    document: TiptapDocument;
  };
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>;
  backlinks: BacklinkResult[];
}

type SaveStatus = "saved" | "saving" | "pending";

export function NoteEditorPage({
  note,
  folders,
  backlinks,
}: NoteEditorPageProps) {
  const [title, setTitle] = useState(note.title);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    note.folderId,
  );
  const [slug, setSlug] = useState(note.slug);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [isPublished, setIsPublished] = useState(note.isPublished);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isExportPending, startExportTransition] = useTransition();
  const [isPublishPending, startPublishTransition] = useTransition();
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [publishAnchor, setPublishAnchor] = useState<DOMRect | null>(null);
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
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
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

  const folderOptions = useMemo(
    () =>
      folders.map((folder) => ({
        id: folder.id,
        name: buildFolderLabel(folder, folders),
      })),
    [folders],
  );

  const currentFolderLabel = useMemo(
    () =>
      folderOptions.find((folder) => folder.id === currentFolderId)?.name ??
      "Workspace",
    [currentFolderId, folderOptions],
  );

  const effectiveTitle = title.trim() || DEFAULT_NOTE_TITLE;

  useRegisterTab({
    kind: "note",
    id: note.id,
    href: `/notes/${note.id}`,
    title: effectiveTitle,
    icon: noteIcon,
  });
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
    if (!isFolderMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!folderMenuRef.current?.contains(event.target as Node)) {
        setIsFolderMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFolderMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFolderMenuOpen]);

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

  const handleFolderChange = useCallback(
    async (nextFolderId: string) => {
      const normalizedFolderId = nextFolderId || null;
      setCurrentFolderId(normalizedFolderId);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "move-folder",
        payload: { folderId: normalizedFolderId },
      });
      await updateNoteAction(note.id, { folderId: normalizedFolderId });
      resolveLocalMutation(mutationId);
    },
    [note.id],
  );

  const handleSelectFolder = useCallback(
    async (nextFolderId: string | null) => {
      setIsFolderMenuOpen(false);
      await handleFolderChange(nextFolderId ?? "");
    },
    [handleFolderChange],
  );

  const handlePublishToggle = useCallback(() => {
    const nextValue = !isPublished;
    startPublishTransition(async () => {
      setIsPublished(nextValue);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: nextValue ? "publish" : "unpublish",
      });
      await updateNoteAction(note.id, { isPublished: nextValue });
      resolveLocalMutation(mutationId);
      router.refresh();
    });
  }, [isPublished, note.id, router]);

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

  const handleSlugChange = useCallback(
    async (nextSlug: string) => {
      const normalizedSlug = nextSlug.trim() || null;
      setSlug(normalizedSlug);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "update-slug",
        payload: { slug: normalizedSlug },
      });
      await updateNoteAction(note.id, { slug: normalizedSlug });
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

  const handleOpenPublishedPage = useCallback(() => {
    if (!isPublished || !slug) {
      return;
    }

    window.open(`/published/${slug}`, "_blank", "noopener,noreferrer");
  }, [isPublished, slug]);

  const handleCopyNoteLink = useCallback(async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/notes/${note.id}`,
    );
  }, [note.id]);

  const handleArchiveNote = useCallback(async () => {
    await archiveNoteAction(note.id);
    router.push("/spotter");
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

  const handleSearchWikilinks = useCallback(async (query: string) => {
    return searchNotesByTitleAction(query);
  }, []);

  const handleResolveWikilink = useCallback(async (target: string) => {
    return findNoteByTitleAction(target);
  }, []);

  const handleCreateWikilink = useCallback(
    async (target: string): Promise<NoteReference> => {
      return createNoteFromWikilinkAction(target, currentFolderId);
    },
    [currentFolderId],
  );

  const navigateToNote = useCallback(
    (noteId: string) => {
      const href = `/notes/${noteId}`;
      if (typeof window !== "undefined") {
        window.location.assign(href);
        return;
      }
      router.push(href);
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

  const handleOpenPublishPopover = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setPublishAnchor((current) => (current ? null : rect));
    },
    [],
  );

  const handleClosePublishPopover = useCallback(() => {
    setPublishAnchor(null);
  }, []);

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
        label: isPublished ? "Unpublish" : "Publish",
        tooltip: "Toggle public availability",
        onSelect: handlePublishToggle,
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
        label: "Open published page",
        disabled: !isPublished,
        onSelect: handleOpenPublishedPage,
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
      handleOpenPublishedPage,
      handlePinToggle,
      handlePublishToggle,
      isExportPending,
      isPinned,
      isPublished,
    ],
  );

  const contentShellPadding = isMobileViewport ? "0" : "0 24px";
  const contentSidePadding = isMobileViewport ? "0 16px" : "0 32px";
  const titleSectionPadding = isMobileViewport ? "28px 0 12px" : "48px 0 16px";
  const editorSectionPadding = isMobileViewport ? "0 16px 24px" : "0 32px 32px";
  const footerSectionPadding = isMobileViewport ? "0 16px" : "0 32px";

  return (
    <>
      <NoteTopbar
        isMobileViewport={isMobileViewport}
        iconPickerPosition={iconPickerPosition}
        noteIcon={noteIcon}
        currentFolderId={currentFolderId}
        currentFolderLabel={currentFolderLabel}
        isFolderMenuOpen={isFolderMenuOpen}
        folderOptions={folderOptions}
        effectiveTitle={effectiveTitle}
        isPublished={isPublished}
        isPinned={isPinned}
        isReadingMode={isReadingMode}
        isPublishPopoverOpen={publishAnchor !== null}
        saveStatusMeta={saveStatusMeta}
        folderMenuRef={folderMenuRef}
        onOpenIconPicker={handleOpenIconPicker}
        onToggleFolderMenu={() => setIsFolderMenuOpen((v) => !v)}
        onSelectFolder={handleSelectFolder}
        onGoDashboard={() => router.push("/spotter")}
        onContextMenu={openContextMenuAtPointer}
        onOpenContextMenuFromTrigger={openContextMenuFromTrigger}
        onOpenPublishPopover={handleOpenPublishPopover}
        onTogglePin={handlePinToggle}
        onToggleReadingMode={toggleReadingMode}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: contentShellPadding,
        }}
      >
        <div style={{ flex: "1 1 0", maxWidth: "800px", minWidth: 0 }}>
          <div style={{ padding: contentSidePadding }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: titleSectionPadding,
              }}
            >
              <input
                className="note-title-input"
                value={title}
                onChange={(event) => handleTitleChange(event.target.value)}
                onBlur={handleTitleBlur}
                placeholder={DEFAULT_NOTE_TITLE}
                spellCheck={false}
                style={{
                  fontSize: "var(--md-sys-typescale-display-small-size)",
                  fontWeight: "var(--md-sys-typescale-display-small-weight)",
                  color: "var(--md-sys-color-on-background)",
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  width: "100%",
                  padding: 0,
                }}
              />

            </div>
          </div>

          <div
            style={{
              padding: editorSectionPadding,
              minHeight: isMobileViewport ? "50vh" : "60vh",
            }}
          >
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
              style={{ padding: footerSectionPadding }}
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

        </div>
        {/* end main content column */}

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
      {/* end flex layout wrapper */}

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

      {publishAnchor ? (
        <PublishPopover
          anchorRect={publishAnchor}
          isPublished={isPublished}
          slug={slug}
          isPending={isPublishPending}
          onTogglePublish={handlePublishToggle}
          onSlugChange={handleSlugChange}
          onClose={handleClosePublishPopover}
        />
      ) : null}
    </>
  );
}

