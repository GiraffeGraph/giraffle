"use client";

import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import Image from "next/image";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/sidebar/CommandPalette";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { Button } from "@/components/ui/Button";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { createFolderAction, relocateFolderAction } from "@/server/api/folders";
import {
  archiveNoteAction,
  createNoteAction,
  moveNoteAction,
  relocateNoteAction,
  updateNoteAction,
} from "@/server/api/notes";
import {
  DEFAULT_COLLAPSED_SECTIONS,
  DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_COMPACT_STORAGE_KEY,
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  type SidebarCollapseState,
} from "@/lib/workspace-preferences";
import { getTemplateCategoryLabel } from "@/lib/template-category";
import {
  isSidebarFolderDragData,
  isSidebarFolderDropData,
  isSidebarNoteDragData,
  isSidebarNoteDropData,
  type FolderDropTarget,
  type SidebarMenuState,
  type SidebarProps,
  type SidebarSectionKey,
} from "./sidebar.types";
import {
  areSidebarCollapseStatesEqual,
  clampSidebarWidth,
  extractActiveNoteId,
  filterFolderTree,
  flattenFolderTree,
  loadSidebarCollapseState,
  loadSidebarCompactState,
  loadSidebarWidth,
} from "./sidebar.utils";
import { SidebarGroup } from "./SidebarGroup";
import type { SidebarGroupAction } from "./SidebarGroup";
import { SidebarNoteRow } from "./SidebarNoteRow";
import { SidebarFolderItem } from "./SidebarFolderItem";
import { encodeMaterialSymbol } from "./sidebar-icon-utils";

const sidebarSessionDateFormatter = new Intl.DateTimeFormat("tr", {
  day: "2-digit",
  month: "short",
});

function formatSidebarSessionDate(value: Date) {
  return sidebarSessionDateFormatter.format(new Date(value));
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FileNewIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function FolderNewIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function Sidebar({
  notes,
  folders,
  templates,
  tags,
  noteGptSessions,
  activeNoteId,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teardownResizeRef = useRef<(() => void) | null>(null);
  const isMobileViewport = useIsMobileViewport(900);

  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [templatePickerOpenSignal, setTemplatePickerOpenSignal] = useState(0);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] =
    useState<FolderDropTarget | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [noteDropTarget, setNoteDropTarget] = useState<{
    folderId: string | null;
    noteId: string | null;
    mode: "inside" | "after" | "root";
  } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  );
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [collapsedSections, setCollapsedSections] =
    useState<SidebarCollapseState>(DEFAULT_COLLAPSED_SECTIONS);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const folderCreationHandledRef = useRef(false);
  const folderTreeRef = useRef<HTMLDivElement | null>(null);

  const normalizedPaletteQuery = paletteQuery.trim().toLowerCase();
  const currentNoteId =
    activeNoteId ?? extractActiveNoteId(pathname) ?? undefined;
  const activeNoteGptSessionId =
    pathname === "/notegpt" ? searchParams.get("session") : null;
  const effectiveIsSidebarCompact = !isMobileViewport && isSidebarCompact;
  const shouldShowSidebarPanel = !isMobileViewport || isMobileSidebarOpen;

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
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
  const navigateToNoteGptSession = useCallback(
    (sessionId: string) => {
      router.push(`/notegpt?session=${sessionId}`);
    },
    [router],
  );
  const openPalette = useCallback((initialQuery = "") => {
    setPaletteQuery(initialQuery);
    setIsPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => {
    setIsPaletteOpen(false);
    setPaletteQuery("");
  }, []);

  const openContextMenuAtPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
      event.preventDefault();
      const position = { x: event.clientX, y: event.clientY };
      setContextMenu({ position, items });
    },
    [],
  );

  const openContextMenuFromTrigger = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, items: ContextMenuItem[]) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const position = { x: rect.right - 14, y: rect.bottom + 8 };
      setContextMenu({ position, items });
    },
    [],
  );

  const copyInternalLink = useCallback(async (path: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
  }, []);

  const toggleSection = useCallback((section: SidebarSectionKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const toggleSidebarCompact = useCallback(
    () => setIsSidebarCompact((v) => !v),
    [],
  );
  const toggleMobileSidebar = useCallback(
    () => setIsMobileSidebarOpen((v) => !v),
    [],
  );

  // Load preferences from localStorage
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const nextWidth = loadSidebarWidth();
      const nextCompact = loadSidebarCompactState();
      const nextSections = loadSidebarCollapseState();
      setSidebarWidth((w) => (w === nextWidth ? w : nextWidth));
      setIsSidebarCompact((c) => (c === nextCompact ? c : nextCompact));
      setCollapsedSections((s) =>
        areSidebarCollapseStatesEqual(s, nextSections) ? s : nextSections,
      );
      setHasLoadedPreferences(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMobileSidebarOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  // Persist collapsed sections
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsedSections),
    );
  }, [collapsedSections, hasLoadedPreferences]);

  // Persist sidebar width
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [hasLoadedPreferences, sidebarWidth]);

  // Persist compact state
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(
      SIDEBAR_COMPACT_STORAGE_KEY,
      JSON.stringify(isSidebarCompact),
    );
  }, [hasLoadedPreferences, isSidebarCompact]);

  // Sync CSS variable for sidebar width
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth}px`,
    );
  }, [isSidebarCompact, sidebarWidth]);

  // Teardown resize listeners on unmount
  useEffect(
    () => () => {
      teardownResizeRef.current?.();
    },
    [],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (typeof window === "undefined") return;
      const startX = event.clientX;
      const initialWidth = sidebarWidth;
      if (isSidebarCompact) setIsSidebarCompact(false);
      setIsSidebarResizing(true);
      const handleMove = (e: MouseEvent) =>
        setSidebarWidth(clampSidebarWidth(initialWidth + (e.clientX - startX)));
      const handleUp = () => {
        setIsSidebarResizing(false);
        teardownResizeRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      teardownResizeRef.current = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [isSidebarCompact, sidebarWidth],
  );

  // Note actions
  const handleCreateNote = useCallback(async () => {
    const noteId = await createNoteAction();
    navigateToNote(noteId);
  }, [navigateToNote]);

  const doCreateFolder = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const folderId = await createFolderAction({ name: trimmed });
      router.push(`/folders/${folderId}`);
    },
    [router],
  );

  const handleStartCreateFolder = useCallback(() => {
    setIsCreatingFolder(true);
    // Klasörler bölümü kapalıysa aç
    setCollapsedSections((s) => ({ ...s, folders: false }));
  }, []);

  const handleCreateNoteInFolder = useCallback(
    async (folderId: string) => {
      const noteId = await createNoteAction({ folderId });
      navigateToNote(noteId);
    },
    [navigateToNote],
  );

  const handleCreateSubFolder = useCallback(
    async (parentId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await createFolderAction({ name: trimmed, parentId });
      router.refresh();
    },
    [router],
  );

  const handleRelocateFolder = useCallback(
    async (
      folderId: string,
      placement: { parentId?: string | null; afterFolderId?: string | null },
    ) => {
      await relocateFolderAction(folderId, placement);
      setFolderDropTarget(null);
      setDraggedFolderId(null);
      router.refresh();
    },
    [router],
  );

  // Context menus
  const buildNoteMenu = useCallback(
    (note: {
      id: string;
      title: string;
      icon?: string | null;
      isPinned?: boolean;
    }): ContextMenuItem[] => [
      {
        label: "Notu aç",
        hint: "Seçili notu düzenleyicide aç",
        onSelect: () => navigateToNote(note.id),
      },
      {
        label: note.isPinned ? "Sabitlemeyi kaldır" : "Sabitle",
        hint: "Notu sıralı listelerde üstte tut veya bırak",
        onSelect: async () => {
          await updateNoteAction(note.id, { isPinned: !note.isPinned });
          router.refresh();
        },
      },
      {
        label: "Yukarı taşı",
        hint: "Not sırasını bir adım yukarı al",
        onSelect: async () => {
          await moveNoteAction(note.id, "up");
          router.refresh();
        },
      },
      {
        label: "Aşağı taşı",
        hint: "Not sırasını bir adım aşağı al",
        onSelect: async () => {
          await moveNoteAction(note.id, "down");
          router.refresh();
        },
      },
      {
        label: "Not bağlantısını kopyala",
        hint: "Dahili not adresini panoya kopyala",
        onSelect: () => copyInternalLink(`/notes/${note.id}`),
      },
      {
        label: "Arşive taşı",
        hint: "Notu aktif listelerden kaldır",
        tone: "danger" as const,
        onSelect: async () => {
          await archiveNoteAction(note.id);
          if (currentNoteId === note.id) router.push("/dashboard");
          router.refresh();
        },
      },
    ],
    [copyInternalLink, currentNoteId, navigateToNote, router],
  );

  useEffect(() => {
    if (!folderTreeRef.current) {
      return;
    }

    return combine(
      dropTargetForElements({
        element: folderTreeRef.current,
        canDrop: ({ source }) =>
          isSidebarFolderDragData(source.data) ||
          isSidebarNoteDragData(source.data),
        getData: ({ source }) => {
          if (isSidebarNoteDragData(source.data)) {
            return {
              type: "sidebar-note-drop-target",
              folderId: null,
              mode: "root",
              afterNoteId: null,
              isPinned: source.data.isPinned,
            };
          }

          return {
            type: "sidebar-folder-drop-target",
            folderId: "__root__",
            mode: "root",
            parentId: null,
            afterFolderId: null,
          };
        },
      }),
      monitorForElements({
        canMonitor: ({ source }) => isSidebarFolderDragData(source.data),
        onDragStart: ({ source }) => {
          if (isSidebarFolderDragData(source.data)) {
            setDraggedFolderId(source.data.folderId);
          }
        },
        onDropTargetChange: ({ location }) => {
          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isSidebarFolderDropData(currentTarget)) {
            setFolderDropTarget(null);
            return;
          }

          if (currentTarget.mode === "root") {
            setFolderDropTarget({ folderId: "__root__", mode: "after" });
            return;
          }

          setFolderDropTarget({
            folderId: currentTarget.folderId,
            mode: currentTarget.mode,
          });
        },
        onDrop: async ({ source, location }) => {
          setDraggedFolderId(null);
          setFolderDropTarget(null);

          if (!isSidebarFolderDragData(source.data)) {
            return;
          }

          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isSidebarFolderDropData(currentTarget)) {
            return;
          }

          if (currentTarget.folderId === source.data.folderId) {
            return;
          }

          await handleRelocateFolder(source.data.folderId, {
            parentId: currentTarget.parentId,
            afterFolderId: currentTarget.afterFolderId,
          });
        },
      }),
    );
  }, [handleRelocateFolder]);

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => isSidebarNoteDragData(source.data),
      onDragStart: ({ source }) => {
        if (isSidebarNoteDragData(source.data)) {
          setDraggedNoteId(source.data.noteId);
        }
      },
      onDropTargetChange: ({ location }) => {
        const currentTarget = location.current.dropTargets[0]?.data;

        if (!isSidebarNoteDropData(currentTarget)) {
          setNoteDropTarget(null);
          return;
        }

        setNoteDropTarget({
          folderId: currentTarget.folderId,
          noteId: currentTarget.afterNoteId,
          mode: currentTarget.mode,
        });
      },
      onDrop: async ({ source, location }) => {
        setDraggedNoteId(null);
        setNoteDropTarget(null);

        if (!isSidebarNoteDragData(source.data)) {
          return;
        }

        const currentTarget = location.current.dropTargets[0]?.data;

        if (!isSidebarNoteDropData(currentTarget)) {
          return;
        }

        if (currentTarget.afterNoteId === source.data.noteId) {
          return;
        }

        await relocateNoteAction(source.data.noteId, {
          folderId: currentTarget.folderId,
          afterNoteId: currentTarget.afterNoteId,
        });

        router.refresh();
      },
    });
  }, [router]);

  // Derived / filtered data
  const flattenedFolders = useMemo(() => flattenFolderTree(folders), [folders]);

  const filteredFolders = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return q ? filterFolderTree(folders, q) : folders;
  }, [folders, paletteQuery]);

  const filteredTags = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    const source = q
      ? tags.filter((t) => t.name.toLowerCase().includes(q))
      : tags.slice(0, 8);
    return source.slice(0, 10);
  }, [paletteQuery, tags]);

  const deferredSearchQuery = useDeferredValue(paletteQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  const filteredNotes = useMemo(() => {
    const source = hasQuery
      ? notes.filter((n) => n.title.toLowerCase().includes(normalizedQuery))
      : notes.slice(0, 8);
    return source.slice(0, hasQuery ? 12 : 8);
  }, [hasQuery, normalizedQuery, notes]);

  // Palette items
  const paletteItems = useMemo<CommandPaletteItem[]>(() => {
    const actionItems: CommandPaletteItem[] = [
      {
        id: "action-new-note",
        group: "Hızlı işlemler",
        title: "Yeni not oluştur",
        description: "Boş bir not aç",
        icon: encodeMaterialSymbol("add"),
        hint: "Enter",
        onSelect: async () => {
          const id = await createNoteAction();
          navigateToNote(id);
        },
      },
      {
        id: "action-new-folder",
        group: "Hızlı işlemler",
        title: "Yeni klasör oluştur",
        description: "Çalışma alanına yeni klasör ekle",
        icon: encodeMaterialSymbol("create_new_folder"),
        onSelect: async () => {
          closePalette();
          handleStartCreateFolder();
        },
      },
      {
        id: "action-template-note",
        group: "Hızlı işlemler",
        title: "Şablondan not oluştur",
        description: "Şablon seçiciyi aç",
        icon: encodeMaterialSymbol("tooltip"),
        onSelect: async () => {
          setTemplatePickerOpenSignal((v) => v + 1);
        },
      },
      {
        id: "action-dashboard",
        group: "Geçişler",
        title: "Panoya git",
        description: "Ana çalışma alanı görünümü",
        icon: encodeMaterialSymbol("dashboard"),
        onSelect: async () => {
          router.push("/dashboard");
        },
      },
      {
        id: "action-universe",
        group: "Geçişler",
        title: "Universe modu",
        description: "Tam ekran uzamsal gezinim katmanını aç",
        icon: encodeMaterialSymbol("travel_explore"),
        onSelect: async () => {
          router.push("/universe");
        },
      },
      {
        id: "action-library",
        group: "Geçişler",
        title: "Kütüphane",
        description: "Tüm notlar ve klasörleri tek sayfada aç",
        icon: encodeMaterialSymbol("library_books"),
        onSelect: async () => {
          router.push("/library");
        },
      },
      {
        id: "action-notegpt",
        group: "Geçişler",
        title: "NoteGPT",
        description: "Çalışma alanı copilotunu aç",
        icon: encodeMaterialSymbol("smart_toy"),
        onSelect: async () => {
          router.push("/notegpt");
        },
      },
      {
        id: "action-graph",
        group: "Geçişler",
        title: "Bağlantı ağına git",
        description: "Not grafiği görünümü",
        icon: "__graph__",
        onSelect: async () => {
          router.push("/graph");
        },
      },
      {
        id: "action-inbox",
        group: "Geçişler",
        title: "Gelen kutusuna git",
        description: "Klasörsüz notları aç",
        icon: encodeMaterialSymbol("inbox"),
        onSelect: async () => {
          router.push("/inbox");
        },
      },
      {
        id: "action-search",
        group: "Geçişler",
        title: "Arama çalışma alanını aç",
        description: "Filtreli arama sayfası",
        icon: encodeMaterialSymbol("search"),
        onSelect: async () => {
          router.push("/search");
        },
      },
      {
        id: "action-discover",
        group: "Geçişler",
        title: "Keşfet akışını aç",
        description: "Haber ve dış dünya akışını gör",
        icon: encodeMaterialSymbol("newspaper"),
        onSelect: async () => {
          router.push("/discover");
        },
      },
      {
        id: "action-templates",
        group: "Geçişler",
        title: "Şablon kütüphanesi",
        description: "Şablon yönetim alanını aç",
        icon: encodeMaterialSymbol("tooltip"),
        onSelect: async () => {
          router.push("/templates");
        },
      },
      {
        id: "action-publish",
        group: "Geçişler",
        title: "Yayın alanı",
        description: "Yayımdaki notları ve dışa aktarımları gör",
        icon: encodeMaterialSymbol("publish"),
        onSelect: async () => {
          router.push("/publish");
        },
      },
      {
        id: "action-proposals",
        group: "Geçişler",
        title: "Öneri akışını aç",
        description: "Not ve klasör önerilerini gör",
        icon: encodeMaterialSymbol("auto_awesome"),
        onSelect: async () => {
          router.push("/proposals");
        },
      },
      {
        id: "action-settings",
        group: "Geçişler",
        title: "Ayarlar",
        description: "Tema, yerel kuyruk ve tercihleri aç",
        icon: encodeMaterialSymbol("settings"),
        onSelect: async () => {
          router.push("/settings");
        },
      },
      {
        id: "action-account",
        group: "Geçişler",
        title: "Hesap",
        description: "Profil ve şifre işlemleri",
        icon: encodeMaterialSymbol("account_circle"),
        onSelect: async () => {
          router.push("/account");
        },
      },
    ];

    const noteItems = notes
      .filter(
        (n) =>
          !normalizedPaletteQuery ||
          n.title.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((n) => ({
        id: `note-${n.id}`,
        group: "Notlar",
        title: n.title,
        description: "Notu düzenleyicide aç",
        icon: n.icon ?? encodeMaterialSymbol("description"),
        onSelect: async () => {
          navigateToNote(n.id);
        },
      }));

    const folderItems = flattenedFolders
      .filter(
        (f) =>
          !normalizedPaletteQuery ||
          f.name.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((f) => ({
        id: `folder-${f.id}`,
        group: "Klasörler",
        title: f.name,
        description: "Klasör görünümünü aç",
        icon: f.icon ?? encodeMaterialSymbol("folder"),
        onSelect: async () => {
          router.push(`/folders/${f.id}`);
        },
      }));

    const tagItems = tags
      .filter(
        (t) =>
          !normalizedPaletteQuery ||
          t.name.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((t) => ({
        id: `tag-${t.id}`,
        group: "Etiketler",
        title: `#${t.name}`,
        description: `${t.noteCount} not içeren etiket`,
        icon: "#",
        onSelect: async () => {
          router.push(`/tags/${t.name}`);
        },
      }));

    const templateItems = templates
      .filter(
        (t) =>
          !normalizedPaletteQuery ||
          `${t.name} ${t.description ?? ""}`
            .toLowerCase()
            .includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 6 : 4)
      .map<CommandPaletteItem>((t) => ({
        id: `template-${t.id}`,
        group: "Şablonlar",
        title: t.name,
        description:
          t.description ?? `${getTemplateCategoryLabel(t.category)} şablonu`,
        icon: t.icon ?? encodeMaterialSymbol("tooltip"),
        onSelect: async () => {
          router.push(`/templates?selected=${t.id}`);
        },
      }));

    const noteGptSessionItems = noteGptSessions
      .filter(
        (session) =>
          !normalizedPaletteQuery ||
          session.title.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((session) => ({
        id: `notegpt-session-${session.id}`,
        group: "NoteGPT",
        title: session.title,
        description: "Sohbet oturumunu aç",
        icon: encodeMaterialSymbol("forum"),
        onSelect: async () => {
          navigateToNoteGptSession(session.id);
        },
      }));

    if (!normalizedPaletteQuery)
      return [
        ...actionItems,
        ...noteGptSessionItems,
        ...noteItems,
        ...folderItems,
        ...tagItems,
        ...templateItems,
      ];

    const filteredActions = actionItems.filter((item) =>
      `${item.title} ${item.description}`
        .toLowerCase()
        .includes(normalizedPaletteQuery),
    );
    return [
      ...filteredActions,
      ...noteGptSessionItems,
      ...noteItems,
      ...folderItems,
      ...tagItems,
      ...templateItems,
    ];
  }, [
    closePalette,
    flattenedFolders,
    handleStartCreateFolder,
    navigateToNote,
    navigateToNoteGptSession,
    normalizedPaletteQuery,
    noteGptSessions,
    notes,
    router,
    tags,
    templates,
  ]);

  const folderGroupActions = useMemo<SidebarGroupAction[]>(
    () => [
      {
        icon: <FileNewIcon />,
        label: "Yeni not",
        onClick: () => void handleCreateNote(),
      },
      {
        icon: <FolderNewIcon />,
        label: "Yeni klasör",
        onClick: handleStartCreateFolder,
      },
    ],
    [handleCreateNote, handleStartCreateFolder],
  );

  const isFoldersCollapsed = hasQuery ? false : collapsedSections.folders;
  const isTagsCollapsed = hasQuery ? false : collapsedSections.tags;
  const isRecentNotesCollapsed = hasQuery
    ? false
    : collapsedSections.recentNotes;
  const inboxCount = notes.filter((n) => !n.folderId).length;

  return (
    <aside
      className={`md-nav-drawer md-nav-drawer--giraffle-sidebar sidebar${effectiveIsSidebarCompact ? " md-nav-drawer--compact compact" : ""}${isSidebarResizing ? " md-nav-drawer--resizing" : ""}${isMobileViewport ? " sidebar-mobile" : ""}${isMobileSidebarOpen ? " mobile-open" : ""}`}
      style={{
        width: isMobileViewport
          ? "100%"
          : effectiveIsSidebarCompact
            ? SIDEBAR_COMPACT_WIDTH
            : sidebarWidth,
        transition:
          isMobileViewport || isSidebarResizing
            ? "none"
            : "width var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard)",
      }}
    >
      {effectiveIsSidebarCompact ? (
        <div className="sidebar-compact-shell">
          <div className="sidebar-compact-stack">
            <button
              type="button"
              className="sidebar-compact-button sidebar-compact-brand"
              onClick={toggleSidebarCompact}
              aria-label="Sidebarı genişlet"
            >
              <Image
                src="/apple-icon.png"
                alt="Giraffe"
                width={24}
                height={24}
              />
            </button>
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={() => openPalette()}
              aria-label="Komut paletini aç"
            >
              <span className="material-symbols-outlined sm" aria-hidden="true">
                &#xE8B6;
              </span>
            </button>
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={handleCreateNote}
              aria-label="Yeni not oluştur"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div
            className="sidebar-topbar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px 8px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                minWidth: 0,
                flex: 1,
              }}
            >
              {isMobileViewport ? (
                <Button
                  variant="text"
                  icon
                  onClick={toggleMobileSidebar}
                  aria-label={
                    isMobileSidebarOpen
                      ? "Kenar menüsünü kapat"
                      : "Kenar menüsünü aç"
                  }
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    {isMobileSidebarOpen ? "close" : "menu"}
                  </span>
                </Button>
              ) : null}
              <div
                className="sidebar-workspace-card"
                onClick={() => router.push("/dashboard")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                }}
              >
                <div
                  className="sidebar-workspace-logo"
                  style={{
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderRadius: "var(--md-sys-shape-small)",
                  }}
                >
                  <Image
                    src="/apple-icon.png"
                    alt="Giraffe"
                    width={28}
                    height={28}
                  />
                </div>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--md-sys-color-on-surface)",
                  }}
                >
                  Giraffe
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
              {isMobileViewport ? <ThemeSelector mobileInline /> : null}
              <Button
                variant="text"
                icon
                onClick={handleCreateNote}
                aria-label="Yeni not oluştur"
              >
                <PlusIcon />
              </Button>
              {isMobileViewport ? null : (
                <Button
                  variant="text"
                  icon
                  onClick={toggleSidebarCompact}
                  aria-label="Sidebarı daralt"
                >
                  <ChevronLeftIcon />
                </Button>
              )}
            </div>
          </div>

          {shouldShowSidebarPanel ? (
            <div className="sidebar-mobile-panel">
              {/* Search */}
              <div style={{ padding: "0 10px 8px" }}>
                <button
                  type="button"
                  className="sidebar-search-trigger"
                  onClick={() => openPalette()}
                  aria-label="Arama veya komut paleti"
                >
                  <span
                    className="material-symbols-outlined sm"
                    aria-hidden="true"
                  >
                    &#xE8B6;
                  </span>
                  <kbd className="sidebar-search-kbd">⌘K</kbd>
                </button>
              </div>

              {/* Scrollable content */}
              <div
                className="md-nav-drawer-content"
                style={{ padding: "0 8px" }}
              >
                {/* Primary nav */}
                <div className="sidebar-primary-nav">
                  {(
                    [
                      { path: "/dashboard", icon: "\uE88A", label: "Pano" },
                      {
                        path: "/universe",
                        icon: "travel_explore",
                        label: "Universe",
                      },
                      {
                        path: "/inbox",
                        icon: "\uE156",
                        label: "Gelen kutusu",
                        badge: inboxCount > 0 ? inboxCount : undefined,
                      },
                      {
                        path: "/library",
                        icon: "library_books",
                        label: "Kütüphane",
                      },
                      {
                        path: "/discover",
                        icon: "newspaper",
                        label: "Keşfet",
                      },
                    ] as Array<{
                      path: string;
                      icon: string;
                      label: string;
                      badge?: number;
                    }>
                  ).map(({ path, icon, label, badge }) => (
                    <button
                      key={path}
                      className={`sidebar-item${pathname === path ? " active" : ""}`}
                      onClick={() => router.push(path)}
                    >
                      <span className="sidebar-item-icon" aria-hidden="true">
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: "16px", lineHeight: 1 }}
                        >
                          {icon}
                        </span>
                      </span>
                      <span className="sidebar-item-label">{label}</span>
                      {badge != null && (
                        <span className="sidebar-nav-badge">{badge}</span>
                      )}
                    </button>
                  ))}
                  <div className="sidebar-notegpt-block">
                    <div className="sidebar-nav-item-row sidebar-notegpt-row">
                      <button
                        type="button"
                        className={`sidebar-item${
                          pathname === "/notegpt" && !activeNoteGptSessionId
                            ? " active"
                            : ""
                        }`}
                        onClick={() => router.push("/notegpt")}
                      >
                        <span className="sidebar-item-icon" aria-hidden="true">
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "16px", lineHeight: 1 }}
                          >
                            smart_toy
                          </span>
                        </span>
                        <span className="sidebar-item-label">NoteGPT</span>
                      </button>
                      <button
                        type="button"
                        className="sidebar-nav-menu sidebar-notegpt-new-chat"
                        onClick={() => router.push("/notegpt")}
                        aria-label="Yeni NoteGPT sohbeti"
                        title="Yeni sohbet"
                      >
                        <PlusIcon />
                      </button>
                    </div>

                    <div className="sidebar-nested-items sidebar-notegpt-sessions">
                      {noteGptSessions.length === 0 ? (
                        <div className="sidebar-session-empty">
                          Henüz sohbet yok.
                        </div>
                      ) : (
                        noteGptSessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            className={`sidebar-item sidebar-nested-item${
                              activeNoteGptSessionId === session.id
                                ? " active"
                                : ""
                            }`}
                            onClick={() => navigateToNoteGptSession(session.id)}
                            title={session.title}
                          >
                            <span className="sidebar-item-label">
                              {session.title}
                            </span>
                            <span className="sidebar-nested-item-date">
                              {formatSidebarSessionDate(session.lastMessageAt)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="sidebar-divider" />

                {/* Folders */}
                <SidebarGroup
                  label="Klasörler"
                  icon={
                    <span
                      className="material-symbols-outlined sm"
                      aria-hidden="true"
                    >
                      folder
                    </span>
                  }
                  collapsed={isFoldersCollapsed}
                  showChevron={false}
                  onToggle={() => toggleSection("folders")}
                  actions={folderGroupActions}
                >
                  <div ref={folderTreeRef} className="sidebar-folder-tree">
                    {isCreatingFolder && (
                      <div className="sidebar-inline-creator">
                        {/* İkon alanı — .sidebar-folder-icon-btn ile aynı genişlik */}
                        <span
                          className="sidebar-folder-icon-btn sidebar-folder-icon-btn--static"
                          aria-hidden="true"
                        >
                          <span className="material-symbols-outlined sm">
                            folder
                          </span>
                        </span>
                        <input
                          autoFocus
                          type="text"
                          className="sidebar-inline-creator-input"
                          defaultValue="Yeni Klasör"
                          placeholder="Klasör adı"
                          onFocus={(e) => {
                            folderCreationHandledRef.current = false;
                            e.currentTarget.select();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              folderCreationHandledRef.current = true;
                              const name = e.currentTarget.value;
                              setIsCreatingFolder(false);
                              void doCreateFolder(name);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              folderCreationHandledRef.current = true;
                              setIsCreatingFolder(false);
                            }
                          }}
                          onBlur={(e) => {
                            if (folderCreationHandledRef.current) {
                              folderCreationHandledRef.current = false;
                              return;
                            }
                            const name = e.currentTarget.value;
                            setIsCreatingFolder(false);
                            void doCreateFolder(name);
                          }}
                        />
                      </div>
                    )}
                    {filteredFolders.length === 0 ? (
                      <div className="sidebar-empty">
                        {hasQuery ? "Eşleşen klasör yok." : "Henüz klasör yok."}
                      </div>
                    ) : (
                      filteredFolders.map((folder) => (
                        <SidebarFolderItem
                          key={folder.id}
                          folder={folder}
                          pathname={pathname}
                          onOpen={(id) => router.push(`/folders/${id}`)}
                          onQuickCreate={handleCreateNoteInFolder}
                          draggedFolderId={draggedFolderId}
                          folderDropTarget={folderDropTarget}
                          draggedNoteId={draggedNoteId}
                          noteDropTarget={noteDropTarget}
                          allNotes={notes}
                          currentNoteId={currentNoteId}
                          onNoteOpen={navigateToNote}
                          onNoteContextMenu={(e, n) =>
                            openContextMenuAtPointer(e, buildNoteMenu(n))
                          }
                          onNoteTriggerMenu={(e, n) =>
                            openContextMenuFromTrigger(e, buildNoteMenu(n))
                          }
                          onCreateSubFolder={handleCreateSubFolder}
                        />
                      ))
                    )}
                  </div>
                </SidebarGroup>

                {/* Tags */}
                <SidebarGroup
                  label="Etiketler"
                  icon={
                    <span
                      className="material-symbols-outlined sm"
                      aria-hidden="true"
                    >
                      sell
                    </span>
                  }
                  collapsed={isTagsCollapsed}
                  showChevron={false}
                  onToggle={() => toggleSection("tags")}
                >
                  <div className="sidebar-tag-list">
                    {filteredTags.length === 0 ? (
                      <div className="sidebar-empty">
                        {hasQuery
                          ? "Eşleşen etiket yok."
                          : "Henüz indekslenmiş etiket yok."}
                      </div>
                    ) : (
                      filteredTags.map((tag) => (
                        <button
                          key={tag.id}
                          className={`sidebar-item sidebar-tag-item${pathname === `/tags/${tag.name}` ? " active" : ""}`}
                          onClick={() => router.push(`/tags/${tag.name}`)}
                        >
                          <span className="sidebar-item-label">
                            #{tag.name}
                          </span>
                          {tag.noteCount > 0 && (
                            <span className="sidebar-tag-count">
                              {tag.noteCount}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </SidebarGroup>

                {/* Recent notes */}
                <SidebarGroup
                  label={hasQuery ? "Not eşleşmeleri" : "Son notlar"}
                  icon={
                    <span
                      className="material-symbols-outlined sm"
                      aria-hidden="true"
                    >
                      {hasQuery ? "search" : "history"}
                    </span>
                  }
                  collapsed={isRecentNotesCollapsed}
                  showChevron={false}
                  onToggle={() => toggleSection("recentNotes")}
                >
                  <nav className="sidebar-nav">
                    {filteredNotes.length === 0 ? (
                      <div className="sidebar-empty">
                        {hasQuery
                          ? "Eşleşen not yok."
                          : "Henüz not yok. İlk notunu oluştur."}
                      </div>
                    ) : (
                      filteredNotes.map((note) => (
                        <SidebarNoteRow
                          key={note.id}
                          note={note}
                          active={note.id === currentNoteId}
                          onOpen={navigateToNote}
                          onContextMenuOpen={(e, n) =>
                            openContextMenuAtPointer(e, buildNoteMenu(n))
                          }
                          onTriggerMenuOpen={(e, n) =>
                            openContextMenuFromTrigger(e, buildNoteMenu(n))
                          }
                          draggedNoteId={draggedNoteId}
                          noteDropTarget={noteDropTarget}
                        />
                      ))
                    )}
                  </nav>
                </SidebarGroup>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Template picker (hidden trigger) */}
      <div className="sidebar-template-host" aria-hidden="true">
        <TemplatePicker
          templates={templates}
          buttonLabel="Şablon"
          buttonClassName="sidebar-template-host-button"
          openSignal={templatePickerOpenSignal}
        />
      </div>

      {!effectiveIsSidebarCompact && !isMobileViewport ? (
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleSidebarResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Sidebar genişliğini değiştir"
        />
      ) : null}

      {isMobileViewport && isMobileSidebarOpen ? (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Kenar menüsünü kapat"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      ) : null}

      <ContextMenu
        items={contextMenu?.items ?? []}
        position={contextMenu?.position ?? null}
        onClose={closeContextMenu}
      />
      <CommandPalette
        open={isPaletteOpen}
        query={paletteQuery}
        items={paletteItems}
        onQueryChange={setPaletteQuery}
        onClose={closePalette}
      />
    </aside>
  );
}
