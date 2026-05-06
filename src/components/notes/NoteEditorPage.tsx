"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
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
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { Button } from "@/components/ui/Button";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { Card, CardContent } from "@/components/ui/Card";
import {
  NOTE_CATEGORY_COLOR_OPTIONS,
  getNoteCategoryColorTokens,
  type NoteCategorySummary,
} from "@/domain/category/category.types";
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
import { createNoteCategoryAction } from "@/server/api/categories";
import { createSavannaFromNoteAction } from "@/server/api/savanna";
import { queueLocalMutation, resolveLocalMutation } from "@/lib/local-sync";

interface NoteEditorPageProps {
  note: {
    id: string;
    title: string;
    slug: string | null;
    icon: string | null;
    folderId: string | null;
    category: NoteCategorySummary | null;
    isPinned: boolean;
    isPublished: boolean;
    document: TiptapDocument;
  };
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>;
  categories: NoteCategorySummary[];
  backlinks: BacklinkResult[];
}

type SaveStatus = "saved" | "saving" | "pending";

export function NoteEditorPage({
  note,
  folders,
  categories,
  backlinks,
}: NoteEditorPageProps) {
  const [title, setTitle] = useState(note.title);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    note.folderId,
  );
  const [availableCategories, setAvailableCategories] =
    useState<NoteCategorySummary[]>(categories);
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(
    note.category?.id ?? null,
  );
  const [slug, setSlug] = useState(note.slug);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [isPublished, setIsPublished] = useState(note.isPublished);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isExportPending, startExportTransition] = useTransition();
  const [isCategoryPending, startCategoryTransition] = useTransition();
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [isMetaPanelOpen, setIsMetaPanelOpen] = useState(false);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] =
    useState<(typeof NOTE_CATEGORY_COLOR_OPTIONS)[number]>("slate");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");
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

  const currentCategory = useMemo(
    () =>
      availableCategories.find(
        (category) => category.id === currentCategoryId,
      ) ?? null,
    [availableCategories, currentCategoryId],
  );
  const currentCategoryTokens = useMemo(
    () => getNoteCategoryColorTokens(currentCategory?.color),
    [currentCategory?.color],
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

  const handleCategoryChange = useCallback(
    async (nextCategoryId: string | null) => {
      const normalizedCategoryId = nextCategoryId || null;
      setCurrentCategoryId(normalizedCategoryId);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "set-category",
        payload: { categoryId: normalizedCategoryId },
      });

      try {
        await updateNoteAction(note.id, { categoryId: normalizedCategoryId });
      } finally {
        resolveLocalMutation(mutationId);
      }
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

  const handlePublishToggle = useCallback(async () => {
    const nextValue = !isPublished;
    setIsPublished(nextValue);
    const mutationId = queueLocalMutation({
      entityType: "note",
      entityId: note.id,
      actionType: nextValue ? "publish" : "unpublish",
    });
    await updateNoteAction(note.id, { isPublished: nextValue });
    resolveLocalMutation(mutationId);
    router.refresh();
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
    router.push("/dashboard");
  }, [note.id, router]);

  const handleOpenInCanvas = useCallback(async () => {
    try {
      const canvasId = await createSavannaFromNoteAction(note.id);
      router.push(`/savanna/${canvasId}`);
    } catch (err) {
      console.error("Failed to open in Savanna:", err);
    }
  }, [note.id, router]);

  const handleCreateCategory = useCallback(() => {
    const normalizedName = newCategoryName.trim();

    if (!normalizedName) {
      return;
    }

    startCategoryTransition(async () => {
      const category = await createNoteCategoryAction({
        name: normalizedName,
        color: newCategoryColor,
        icon: newCategoryIcon.trim() || null,
      });

      setAvailableCategories((currentValue) =>
        sortCategories([
          ...currentValue.filter((item) => item.id !== category.id),
          category,
        ]),
      );
      setCurrentCategoryId(category.id);
      setNewCategoryName("");
      setNewCategoryColor("slate");
      setNewCategoryIcon("");
      setIsCreateCategoryOpen(false);

      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "set-category",
        payload: { categoryId: category.id },
      });

      try {
        await updateNoteAction(note.id, { categoryId: category.id });
      } finally {
        resolveLocalMutation(mutationId);
      }
    });
  }, [newCategoryColor, newCategoryIcon, newCategoryName, note.id]);

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

      if (!documentSaveInFlightRef.current) {
        void flushDocumentSave();
      }
    },
    [flushDocumentSave, refreshSaveStatus],
  );

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

  const toggleMetaPanel = useCallback(() => {
    setIsMetaPanelOpen((currentValue) => !currentValue);
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
        hint: "Keep near the top of the note list or release it",
        onSelect: handlePinToggle,
      },
      {
        label: isPublished ? "Unpublish" : "Publish",
        hint: "Change the publication status of the note",
        onSelect: handlePublishToggle,
      },
      {
        label: isMetaPanelOpen ? "Hide page settings" : "Page settings",
        hint: "Open the publish path and secondary options",
        onSelect: toggleMetaPanel,
      },
      {
        label: "Open in Savanna",
        hint: "Create a spatial map centered on this note",
        onSelect: handleOpenInCanvas,
      },
      {
        label: "Move up",
        hint: "Move it up by one position in its list",
        onSelect: () => handleMoveNote("up"),
      },
      {
        label: "Move down",
        hint: "Move it down by one position in its list",
        onSelect: () => handleMoveNote("down"),
      },
      {
        label: "Copy note link",
        hint: "Copy the internal note address to the clipboard",
        onSelect: handleCopyNoteLink,
      },
      {
        label: "Copy Markdown",
        hint: "Copy the exported Markdown version",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("markdown"),
      },
      {
        label: "Copy MDX",
        hint: "Copy the exported MDX version",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("mdx"),
      },
      {
        label: "Open published page",
        hint: "Open the public view in a new tab",
        disabled: !isPublished,
        onSelect: handleOpenPublishedPage,
      },
      {
        label: "Move to archive",
        hint: "Remove the note from active lists",
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
      isMetaPanelOpen,
      isPinned,
      isPublished,
      toggleMetaPanel,
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
        isMetaPanelOpen={isMetaPanelOpen}
        isExportPending={isExportPending}
        saveStatusMeta={saveStatusMeta}
        folderMenuRef={folderMenuRef}
        onOpenIconPicker={handleOpenIconPicker}
        onToggleFolderMenu={() => setIsFolderMenuOpen((v) => !v)}
        onSelectFolder={handleSelectFolder}
        onGoDashboard={() => router.push("/dashboard")}
        onContextMenu={openContextMenuAtPointer}
        onOpenContextMenuFromTrigger={openContextMenuFromTrigger}
        onTogglePublish={handlePublishToggle}
        onTogglePin={handlePinToggle}
        onToggleMetaPanel={toggleMetaPanel}
        onOpenInCanvas={handleOpenInCanvas}
        onMoveUp={() => handleMoveNote("up")}
        onMoveDown={() => handleMoveNote("down")}
        onCopyNoteLink={handleCopyNoteLink}
        onCopyExport={handleCopyExport}
        onOpenPublishedPage={handleOpenPublishedPage}
        onArchive={handleArchiveNote}
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

              {currentCategory ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  <button
                    type="button"
                    style={{
                      background: currentCategoryTokens.background,
                      color: currentCategoryTokens.foreground,
                      border: "none",
                      padding: "2px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onClick={() => setIsMetaPanelOpen(true)}
                  >
                    <span aria-hidden="true">{currentCategory.icon ?? "•"}</span>
                    <span>{currentCategory.name}</span>
                  </button>
                </div>
              ) : null}

              {isMetaPanelOpen ? (
                <Card variant="outlined" style={{ marginTop: "8px" }}>
                  <CardContent>
                    <div
                      style={{
                        display: "grid",
                        gap: "12px",
                        paddingBottom: "16px",
                        marginBottom: "16px",
                        borderBottom:
                          "1px solid var(--md-sys-color-outline-variant)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize:
                                "var(--md-sys-typescale-title-small-size)",
                              fontWeight: 600,
                              color: "var(--md-sys-color-on-surface)",
                            }}
                          >
                            Category
                          </div>
                          <div
                            style={{
                              fontSize:
                                "var(--md-sys-typescale-body-small-size)",
                              color: "var(--md-sys-color-on-surface-variant)",
                            }}
                          >
                            Place the note in a main group.
                          </div>
                        </div>
                        <Button
                          variant="text"
                          onClick={() =>
                            setIsCreateCategoryOpen(
                              (currentValue) => !currentValue,
                            )
                          }
                        >
                          {isCreateCategoryOpen ? "Close" : "New category"}
                        </Button>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void handleCategoryChange(null)}
                          disabled={isCategoryPending}
                          style={buildCategoryChipStyle(
                            currentCategoryId === null,
                            {
                              background:
                                "var(--md-sys-color-surface-container-highest)",
                              foreground: "var(--md-sys-color-on-surface)",
                            },
                          )}
                        >
                          No category
                        </button>
                        {availableCategories.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() =>
                              void handleCategoryChange(category.id)
                            }
                            disabled={isCategoryPending}
                            style={buildCategoryChipStyle(
                              category.id === currentCategoryId,
                              getNoteCategoryColorTokens(category.color),
                            )}
                          >
                            <span aria-hidden="true">
                              {category.icon ?? "•"}
                            </span>
                            <span>{category.name}</span>
                          </button>
                        ))}
                      </div>

                      {isCreateCategoryOpen ? (
                        <div
                          style={{
                            display: "grid",
                            gap: "12px",
                            padding: "12px",
                            borderRadius: "12px",
                            background:
                              "var(--md-sys-color-surface-container-low)",
                          }}
                        >
                          <div
                            className="md-text-field md-text-field--outlined md-text-field--has-value"
                            style={{ width: "100%" }}
                          >
                            <div className="md-text-field-container">
                              <input
                                className="md-text-field-input"
                                value={newCategoryName}
                                onChange={(event) =>
                                  setNewCategoryName(event.target.value)
                                }
                                placeholder=" "
                              />
                              <span className="md-text-field-label">
                                Category name
                              </span>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMobileViewport
                                ? "1fr"
                                : "minmax(0, 1fr) 160px",
                              gap: "12px",
                            }}
                          >
                            <div
                              className="md-text-field md-text-field--outlined md-text-field--has-value"
                              style={{ width: "100%" }}
                            >
                              <div className="md-text-field-container">
                                <input
                                  className="md-text-field-input"
                                  value={newCategoryIcon}
                                  onChange={(event) =>
                                    setNewCategoryIcon(event.target.value)
                                  }
                                  placeholder=" "
                                />
                                <span className="md-text-field-label">
                                  Icon (optional)
                                </span>
                              </div>
                            </div>

                            <label
                              style={{
                                display: "grid",
                                gap: "4px",
                                fontSize:
                                  "var(--md-sys-typescale-label-medium-size)",
                                color: "var(--md-sys-color-on-surface-variant)",
                              }}
                            >
                              <span>Color</span>
                              <select
                                value={newCategoryColor}
                                onChange={(event) =>
                                  setNewCategoryColor(
                                    event.target
                                      .value as (typeof NOTE_CATEGORY_COLOR_OPTIONS)[number],
                                  )
                                }
                                style={buildSelectStyle()}
                              >
                                {NOTE_CATEGORY_COLOR_OPTIONS.map(
                                  (colorOption) => (
                                    <option
                                      key={colorOption}
                                      value={colorOption}
                                    >
                                      {colorOption}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: "8px",
                            }}
                          >
                            <Button
                              variant="filled"
                              disabled={
                                !newCategoryName.trim() || isCategoryPending
                              }
                              onClick={handleCreateCategory}
                            >
                              {isCategoryPending
                                ? "Creating..."
                                : "Create category"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div
                      className="md-text-field md-text-field--outlined md-text-field--has-value"
                      style={{ width: "100%" }}
                    >
                      <div className="md-text-field-container">
                        <input
                          className="md-text-field-input"
                          value={slug ?? ""}
                          onChange={(event) => setSlug(event.target.value)}
                          onBlur={(event) =>
                            void handleSlugChange(event.target.value)
                          }
                          placeholder="publish-path"
                          spellCheck={false}
                        />
                        <span className="md-text-field-label">
                          Publish Path
                        </span>
                      </div>
                    </div>
                    <p
                      style={{
                        marginTop: "8px",
                        fontSize: "var(--md-sys-typescale-body-small-size)",
                        color: "var(--md-sys-color-on-surface-variant)",
                      }}
                    >
                      {slug?.trim()
                        ? `Published path: /published/${slug}`
                        : "A path is created automatically when published."}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
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
              style={{
                marginTop: isMobileViewport ? "24px" : "32px",
                padding: footerSectionPadding,
              }}
            >
              <details style={{ fontSize: "13px", color: "var(--md-sys-color-on-surface-variant)" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    userSelect: "none",
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 0",
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: "16px" }}>
                    link
                  </span>
                  {backlinks.length} backlinks
                </summary>
                <ul
                  style={{
                    listStyle: "none",
                    margin: "8px 0 0",
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  {backlinks.map((backlink) => (
                    <li key={`${backlink.sourceNoteId}-${backlink.sourceBlockId ?? ""}-${backlink.targetRaw}`}>
                      <button
                        type="button"
                        onClick={() => navigateToNote(backlink.sourceNoteId)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "4px 6px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                          color: "var(--md-sys-color-primary)",
                          textAlign: "left",
                          width: "100%",
                        }}
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
          <aside style={{ width: "180px", flexShrink: 0 }}>
            <div
              style={{ position: "sticky", top: "56px", paddingTop: "64px" }}
            >
              {headings.length > 0 ? (
                <nav aria-label="Table of contents">
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--md-sys-color-on-surface-variant)",
                      marginBottom: "10px",
                    }}
                  >
                    Table of contents
                  </div>
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "1px",
                    }}
                  >
                    {headings.map((heading, idx) => (
                      <li key={`${heading.blockId ?? heading.text}-${idx}`}>
                        <button
                          type="button"
                          onClick={() =>
                            scrollToHeading(heading.blockId, heading.text)
                          }
                          title={heading.text}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            background: "transparent",
                            color:
                              activeHeadingIndex === idx
                                ? "var(--md-sys-color-on-surface)"
                                : "var(--md-sys-color-on-surface-variant)",
                            border: "none",
                            padding: "3px 0",
                            paddingLeft: `${(heading.level - 1) * 10}px`,
                            fontSize: "12px",
                            lineHeight: "1.4",
                            cursor: "pointer",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: activeHeadingIndex === idx ? 500 : 400,
                            transition: "color 0.15s",
                          }}
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
    </>
  );
}

function buildFolderLabel(
  folder: { id: string; name: string; parentId: string | null },
  folders: Array<{ id: string; name: string; parentId: string | null }>,
) {
  const foldersById = new Map(
    folders.map((candidate) => [candidate.id, candidate]),
  );
  const labels = [folder.name];
  let currentParentId = folder.parentId;

  while (currentParentId) {
    const parentFolder = foldersById.get(currentParentId);

    if (!parentFolder) {
      break;
    }

    labels.unshift(parentFolder.name);
    currentParentId = parentFolder.parentId;
  }

  return labels.join(" / ");
}

function buildCategoryChipStyle(
  isActive: boolean,
  colors: { background: string; foreground: string },
) {
  return {
    background: isActive
      ? colors.background
      : "var(--md-sys-color-surface-container-low)",
    color: isActive
      ? colors.foreground
      : "var(--md-sys-color-on-surface-variant)",
    border: "none",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    opacity: 1,
  } satisfies CSSProperties;
}

function buildSelectStyle(): CSSProperties {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid var(--md-sys-color-outline)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
    fontSize: "14px",
  };
}

function sortCategories(categories: NoteCategorySummary[]) {
  return [...categories].sort((left, right) =>
    left.name.localeCompare(right.name, "tr"),
  );
}

interface TocHeading {
  level: number;
  text: string;
  blockId: string | null;
}

function extractHeadings(doc: TiptapDocument): TocHeading[] {
  const headings: TocHeading[] = [];
  for (const node of doc.content) {
    if (node.type === "heading" && node.content) {
      const level =
        typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      const text = node.content
        .filter((n): n is { type: "text"; text: string } => n.type === "text")
        .map((n) => n.text)
        .join("");
      const blockId =
        typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
      if (text.trim()) {
        headings.push({ level, text, blockId });
      }
    }
  }
  return headings;
}
