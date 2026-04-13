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
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { NoteTopbar } from "@/components/notes/NoteTopbar";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { Button } from "@/components/ui/Button";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { FeedAssignmentsCard } from "@/components/feeds/FeedAssignmentsCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import {
  NOTE_CATEGORY_COLOR_OPTIONS,
  getNoteCategoryColorTokens,
  type NoteCategorySummary,
} from "@/domain/category/category.types";
import type { BacklinkResult } from "@/domain/link/link.types";
import { DEFAULT_NOTE_TITLE } from "@/domain/note/note.types";
import type { NoteReference, TiptapDocument } from "@/domain/note/note.types";
import { TEMPLATE_CATEGORIES } from "@/domain/template/template.types";
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
import { createTemplateFromNoteAction } from "@/server/api/templates";
import { getTemplateCategoryLabel } from "@/lib/template-category";
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
    tags: string[];
    document: TiptapDocument;
  };
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>;
  categories: NoteCategorySummary[];
  backlinks: BacklinkResult[];
  feedAssignments: Array<{
    id: string;
    title: string;
    kind: "suggestion" | "news";
    isSelected: boolean;
    refreshIntervalHours: number;
    itemCount: number;
  }>;
}

type SaveStatus = "saved" | "saving" | "pending";

export function NoteEditorPage({
  note,
  folders,
  categories,
  backlinks,
  feedAssignments,
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
  const [isTemplatePending, startTemplateTransition] = useTransition();
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [isMetaPanelOpen, setIsMetaPanelOpen] = useState(false);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] =
    useState<(typeof NOTE_CATEGORY_COLOR_OPTIONS)[number]>("slate");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState(note.title);
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState<string>("custom");
  const [templateIcon, setTemplateIcon] = useState(note.icon ?? "");
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
      "Çalışma alanı",
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
          label: "Kaydediliyor...",
          color: "var(--md-sys-color-primary)",
        };
      case "pending":
        return {
          label: "Kaydetme bekliyor",
          color: "var(--md-sys-color-tertiary)",
        };
      default:
        return {
          label: "Kaydedildi",
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

  const handleOpenTemplateDialog = useCallback(() => {
    setTemplateName(effectiveTitle);
    setTemplateDescription("");
    setTemplateCategory("custom");
    setTemplateIcon(noteIcon ?? currentCategory?.icon ?? "");
    setIsTemplateDialogOpen(true);
  }, [currentCategory?.icon, effectiveTitle, noteIcon]);

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

  const handleSaveTemplate = useCallback(() => {
    startTemplateTransition(async () => {
      const template = await createTemplateFromNoteAction(note.id, {
        name: templateName.trim() || effectiveTitle,
        description: templateDescription.trim() || null,
        category: templateCategory,
        icon: templateIcon.trim() || null,
      });

      setIsTemplateDialogOpen(false);
      router.push(`/templates?selected=${template.id}`);
    });
  }, [
    effectiveTitle,
    note.id,
    router,
    templateCategory,
    templateDescription,
    templateIcon,
    templateName,
  ]);

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
        label: isPinned ? "Sabitlemeyi kaldır" : "Sabitle",
        hint: "Not sırasında üstte tut veya serbest bırak",
        onSelect: handlePinToggle,
      },
      {
        label: isPublished ? "Yayımdan kaldır" : "Yayımla",
        hint: "Notun yayın durumunu değiştir",
        onSelect: handlePublishToggle,
      },
      {
        label: isMetaPanelOpen ? "Sayfa ayarlarını gizle" : "Sayfa ayarları",
        hint: "Yayın adresi ve ikincil seçenekleri aç",
        onSelect: toggleMetaPanel,
      },
      {
        label: "Open in Savanna",
        hint: "Create a spatial map centered on this note",
        onSelect: handleOpenInCanvas,
      },
      {
        label: "Yukarı taşı",
        hint: "Bulunduğu listede bir adım yukarı al",
        onSelect: () => handleMoveNote("up"),
      },
      {
        label: "Aşağı taşı",
        hint: "Bulunduğu listede bir adım aşağı al",
        onSelect: () => handleMoveNote("down"),
      },
      {
        label: "Not bağlantısını kopyala",
        hint: "Dahili not adresini panoya kopyala",
        onSelect: handleCopyNoteLink,
      },
      {
        label: "Markdown kopyala",
        hint: "Dışa aktarılan Markdown sürümünü kopyala",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("markdown"),
      },
      {
        label: "MDX kopyala",
        hint: "Dışa aktarılan MDX sürümünü kopyala",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("mdx"),
      },
      {
        label: "Yayımdaki sayfayı aç",
        hint: "Genel görünümü yeni sekmede aç",
        disabled: !isPublished,
        onSelect: handleOpenPublishedPage,
      },
      {
        label: "Arşive taşı",
        hint: "Notu aktif listelerden kaldır",
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

              {currentCategory || note.tags.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {currentCategory ? (
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
                      <span aria-hidden="true">
                        {currentCategory.icon ?? "•"}
                      </span>
                      <span>{currentCategory.name}</span>
                    </button>
                  ) : null}
                  {note.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      style={{
                        background: "var(--md-sys-color-secondary-container)",
                        color: "var(--md-sys-color-on-secondary-container)",
                        border: "none",
                        padding: "2px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                      onClick={() => router.push(`/tags/${tag}`)}
                    >
                      #{tag}
                    </button>
                  ))}
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
                            Kategori
                          </div>
                          <div
                            style={{
                              fontSize:
                                "var(--md-sys-typescale-body-small-size)",
                              color: "var(--md-sys-color-on-surface-variant)",
                            }}
                          >
                            Notu taglerden ayri bir ana gruba yerlestir.
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
                          {isCreateCategoryOpen ? "Kapat" : "Yeni kategori"}
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
                          Kategori yok
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
                                Kategori adi
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
                                  Ikon (opsiyonel)
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
                              <span>Renk</span>
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
                                ? "Olusturuluyor..."
                                : "Kategori olustur"}
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
                          placeholder="yayin-adresi"
                          spellCheck={false}
                        />
                        <span className="md-text-field-label">
                          Yayın Adresi
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
                        ? `Yayın yolu: /published/${slug}`
                        : "Yayımlandığında otomatik bir adres oluşturulur."}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        marginTop: "16px",
                        paddingTop: "16px",
                        borderTop:
                          "1px solid var(--md-sys-color-outline-variant)",
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
                          Template akisi
                        </div>
                        <div
                          style={{
                            fontSize: "var(--md-sys-typescale-body-small-size)",
                            color: "var(--md-sys-color-on-surface-variant)",
                          }}
                        >
                          Bu notu tekrar kullanilabilir bir baslangic olarak
                          kaydet.
                        </div>
                      </div>
                      <Button
                        variant="tonal"
                        onClick={handleOpenTemplateDialog}
                        disabled={isTemplatePending}
                      >
                        Template olarak kaydet
                      </Button>
                    </div>
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
                  {backlinks.length} geri bağlantı
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

          <div
            style={{
              margin: isMobileViewport ? "24px 0 32px" : "32px 0 40px",
              padding: footerSectionPadding,
            }}
          >
            <FeedAssignmentsCard
              title="Akış bağlantıları"
              description="Bu notu hangi öneri ve haber akışlarının besleyeceğini buradan seçebilir, istersen doğrudan yeni akış başlatabilirsin."
              assignments={feedAssignments}
              sourceType="note"
              sourceId={note.id}
            />
          </div>

        </div>
        {/* end main content column */}

        {isTocVisible ? (
          <aside style={{ width: "180px", flexShrink: 0 }}>
            <div
              style={{ position: "sticky", top: "56px", paddingTop: "64px" }}
            >
              {headings.length > 0 ? (
                <nav aria-label="İçindekiler">
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
                    İçindekiler
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

      {isTemplateDialogOpen ? (
        <div
          className="md-dialog-scrim"
          onClick={() => setIsTemplateDialogOpen(false)}
        >
          <div
            className="md-dialog"
            style={{ maxWidth: "560px", width: "90vw" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="md-dialog-headline">Template olarak kaydet</h2>
            <div
              className="md-dialog-content"
              style={{ display: "grid", gap: "16px" }}
            >
              <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                <div className="md-text-field-container">
                  <input
                    className="md-text-field-input"
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder=" "
                  />
                  <span className="md-text-field-label">Template adi</span>
                </div>
              </div>

              <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                <div
                  className="md-text-field-container"
                  style={{
                    height: "auto",
                    minHeight: "88px",
                    padding: "12px 16px",
                  }}
                >
                  <textarea
                    className="md-text-field-input"
                    value={templateDescription}
                    onChange={(event) =>
                      setTemplateDescription(event.target.value)
                    }
                    rows={3}
                    placeholder=" "
                    style={{ resize: "vertical", paddingTop: 0 }}
                  />
                  <span className="md-text-field-label">Aciklama</span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobileViewport
                    ? "1fr"
                    : "minmax(0, 1fr) 180px",
                  gap: "12px",
                }}
              >
                <label
                  style={{
                    display: "grid",
                    gap: "4px",
                    fontSize: "var(--md-sys-typescale-label-medium-size)",
                    color: "var(--md-sys-color-on-surface-variant)",
                  }}
                >
                  <span>Template kategorisi</span>
                  <select
                    value={templateCategory}
                    onChange={(event) =>
                      setTemplateCategory(event.target.value)
                    }
                    style={buildSelectStyle()}
                  >
                    {TEMPLATE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {getTemplateCategoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                  <div className="md-text-field-container">
                    <input
                      className="md-text-field-input"
                      value={templateIcon}
                      onChange={(event) => setTemplateIcon(event.target.value)}
                      placeholder=" "
                    />
                    <span className="md-text-field-label">Ikon</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="md-dialog-actions">
              <Button
                variant="text"
                onClick={() => setIsTemplateDialogOpen(false)}
              >
                Vazgec
              </Button>
              <Button
                variant="filled"
                disabled={!templateName.trim() || isTemplatePending}
                onClick={handleSaveTemplate}
              >
                {isTemplatePending ? "Kaydediliyor..." : "Template kaydet"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
