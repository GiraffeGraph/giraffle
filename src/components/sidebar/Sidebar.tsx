"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/sidebar/CommandPalette";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { Button } from "@/components/ui/Button";
import {
  APP_THEMES,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  type AppThemeId,
  isAppThemeId,
  persistAppTheme,
} from "@/components/theme/theme-config";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import { signOutAction } from "@/server/api/auth";
import {
  createFolderAction,
  moveFolderAction,
  relocateFolderAction,
} from "@/server/api/folders";
import {
  archiveNoteAction,
  createNoteAction,
  moveNoteAction,
  updateNoteAction,
} from "@/server/api/notes";
import type { TemplateVariable } from "@/domain/template/template.types";
import {
  DEFAULT_COLLAPSED_SECTIONS,
  DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_COMPACT_STORAGE_KEY,
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  type SidebarCollapseState,
} from "@/lib/workspace-preferences";
import { getTemplateCategoryLabel } from "@/lib/template-category";

interface SidebarNote {
  id: string;
  title: string;
  slug?: string | null;
  icon: string | null;
  folderId?: string | null;
  position?: number;
  isPinned?: boolean;
  updatedAt: Date;
}

interface SidebarFolder {
  id: string;
  name: string;
  icon: string | null;
  parentId?: string | null;
  position?: number;
  children?: SidebarFolder[];
  _count?: {
    notes: number;
  };
}

interface SidebarTag {
  id: string;
  name: string;
  noteCount: number;
}

interface SidebarTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  variables: TemplateVariable[];
}

interface SidebarProps {
  notes: SidebarNote[];
  folders: SidebarFolder[];
  templates: SidebarTemplate[];
  tags: SidebarTag[];
  user: {
    name: string | null;
    email: string | null;
  };
  activeNoteId?: string;
}

interface SidebarMenuState {
  position: {
    x: number;
    y: number;
  };
  items: ContextMenuItem[];
}

interface FolderDropTarget {
  folderId: string;
  mode: "inside" | "after";
}

type SidebarSectionKey = "folders" | "tags" | "recentNotes";

export function Sidebar({
  notes,
  folders,
  templates,
  tags,
  user,
  activeNoteId,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const teardownResizeRef = useRef<(() => void) | null>(null);
  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [templatePickerOpenSignal, setTemplatePickerOpenSignal] = useState(0);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] =
    useState<FolderDropTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeThemeId, setActiveThemeId] =
    useState<AppThemeId>(DEFAULT_APP_THEME);
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    DEFAULT_EXPANDED_SIDEBAR_WIDTH
  );
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [collapsedSections, setCollapsedSections] =
    useState<SidebarCollapseState>(DEFAULT_COLLAPSED_SECTIONS);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [navModal, setNavModal] = useState<{
    key: string;
    label: string;
    x: number;
    y: number;
    info?: string;
    isSearch?: boolean;
    actions?: Array<{ label: string; onClick: () => void; primary?: boolean }>;
  } | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const resetPreferences = useCallback(() => {
    window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_COMPACT_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    setActiveThemeId(DEFAULT_APP_THEME);
    setSidebarWidth(DEFAULT_EXPANDED_SIDEBAR_WIDTH);
    setIsSidebarCompact(false);
    setCollapsedSections(DEFAULT_COLLAPSED_SECTIONS);
    persistAppTheme(DEFAULT_APP_THEME);
  }, []);

  const openNavModal = useCallback(
    (
      key: string,
      label: string,
      event: ReactMouseEvent<HTMLButtonElement>,
      extra?: {
        info?: string;
        isSearch?: boolean;
        actions?: Array<{ label: string; onClick: () => void; primary?: boolean }>;
      }
    ) => {
      event.stopPropagation();
      if (navModal?.key === key) {
        setNavModal(null);
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      setNavModal({ key, label, x: rect.right + 6, y: rect.top, ...extra });
    },
    [navModal]
  );

  const closeNavModal = useCallback(() => setNavModal(null), []);

  const currentNoteId =
    activeNoteId ?? extractActiveNoteId(pathname) ?? undefined;
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const normalizedPaletteQuery = paletteQuery.trim().toLowerCase();

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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
      setContextMenu({
        position: {
          x: event.clientX,
          y: event.clientY,
        },
        items,
      });
    },
    []
  );

  const openContextMenuFromTrigger = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, items: ContextMenuItem[]) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setContextMenu({
        position: {
          x: rect.right - 14,
          y: rect.bottom + 8,
        },
        items,
      });
    },
    []
  );

  const copyInternalLink = useCallback(async (path: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
  }, []);

  const applyTheme = useCallback((themeId: AppThemeId) => {
    persistAppTheme(themeId);
    setActiveThemeId(themeId);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const nextSidebarWidth = loadSidebarWidth();
      const nextSidebarCompact = loadSidebarCompactState();
      const nextCollapsedSections = loadSidebarCollapseState();

      setSidebarWidth((currentWidth) =>
        currentWidth === nextSidebarWidth ? currentWidth : nextSidebarWidth
      );
      setIsSidebarCompact((currentCompact) =>
        currentCompact === nextSidebarCompact
          ? currentCompact
          : nextSidebarCompact
      );
      setCollapsedSections((currentSections) =>
        areSidebarCollapseStatesEqual(currentSections, nextCollapsedSections)
          ? currentSections
          : nextCollapsedSections
      );
      setHasLoadedPreferences(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const currentTheme = document.documentElement.dataset.theme;
    let nextTheme = DEFAULT_APP_THEME;

    if (currentTheme && isAppThemeId(currentTheme)) {
      nextTheme = currentTheme;
    } else {
      const storedTheme = localStorage.getItem(APP_THEME_STORAGE_KEY);

      if (storedTheme && isAppThemeId(storedTheme)) {
        nextTheme = storedTheme;
        persistAppTheme(storedTheme);
      } else {
        persistAppTheme(DEFAULT_APP_THEME);
      }
    }

    if (nextTheme === activeThemeId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setActiveThemeId(nextTheme);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeThemeId]);

  useEffect(() => {
    if (!hasLoadedPreferences || typeof window === "undefined") {
      return;
    }

    localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsedSections)
    );
  }, [collapsedSections, hasLoadedPreferences]);

  useEffect(() => {
    if (!hasLoadedPreferences || typeof window === "undefined") {
      return;
    }

    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [hasLoadedPreferences, sidebarWidth]);

  useEffect(() => {
    if (!hasLoadedPreferences || typeof window === "undefined") {
      return;
    }

    localStorage.setItem(
      SIDEBAR_COMPACT_STORAGE_KEY,
      JSON.stringify(isSidebarCompact)
    );
  }, [hasLoadedPreferences, isSidebarCompact]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth}px`
    );
  }, [isSidebarCompact, sidebarWidth]);

  useEffect(
    () => () => {
      teardownResizeRef.current?.();
    },
    []
  );

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette(searchQuery);
      }

      if (
        event.key === "Escape" &&
        !isPaletteOpen &&
        document.activeElement === commandInputRef.current &&
        searchQuery
      ) {
        event.preventDefault();
        setSearchQuery("");
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isPaletteOpen, openPalette, searchQuery]);

  const activeTheme = useMemo(
    () =>
      APP_THEMES.find((theme) => theme.id === activeThemeId) ?? APP_THEMES[0],
    [activeThemeId]
  );

  const filteredFolders = useMemo(() => {
    if (!hasQuery) {
      return folders;
    }

    return filterFolderTree(folders, normalizedQuery);
  }, [folders, hasQuery, normalizedQuery]);

  const filteredTags = useMemo(() => {
    const source = hasQuery
      ? tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery))
      : tags.slice(0, 8);

    return source.slice(0, 10);
  }, [hasQuery, normalizedQuery, tags]);

  const filteredNotes = useMemo(() => {
    const source = hasQuery
      ? notes.filter((note) => note.title.toLowerCase().includes(normalizedQuery))
      : notes.slice(0, 8);

    return source.slice(0, hasQuery ? 12 : 8);
  }, [hasQuery, normalizedQuery, notes]);

  const visibleFolderCount = useMemo(
    () => countFolders(filteredFolders),
    [filteredFolders]
  );

  const commandMatch = useMemo(() => {
    if (filteredNotes.length > 0) {
      return {
        type: "note" as const,
        label: filteredNotes[0].title,
        href: `/notes/${filteredNotes[0].id}`,
      };
    }

    const firstFolderId = getFirstFolderId(filteredFolders);

    if (firstFolderId) {
      const firstFolder = findFolderById(filteredFolders, firstFolderId);

      if (firstFolder) {
        return {
          type: "folder" as const,
          label: firstFolder.name,
          href: `/folders/${firstFolder.id}`,
        };
      }
    }

    if (filteredTags.length > 0) {
      return {
        type: "tag" as const,
        label: `#${filteredTags[0].name}`,
        href: `/tags/${filteredTags[0].name}`,
      };
    }

    return null;
  }, [filteredFolders, filteredNotes, filteredTags]);

  const flattenedFolders = useMemo(() => flattenFolderTree(folders), [folders]);

  const handleCreateNote = async () => {
    const noteId = await createNoteAction();
    router.push(`/notes/${noteId}`);
  };

  const handleCreateFolder = async () => {
    const folderName = window.prompt("Klasör adı", "Yeni Klasör")?.trim();

    if (!folderName) {
      return;
    }

    const folderId = await createFolderAction({
      name: folderName,
    });

    router.push(`/folders/${folderId}`);
  };

  const handleCreateNoteInFolder = useCallback(
    async (folderId: string) => {
      const noteId = await createNoteAction({ folderId });
      router.push(`/notes/${noteId}`);
    },
    [router]
  );

  const handleMoveFolder = useCallback(
    async (folderId: string, direction: "up" | "down") => {
      await moveFolderAction(folderId, direction);
      router.refresh();
    },
    [router]
  );

  const handleRelocateFolder = useCallback(
    async (
      folderId: string,
      placement: {
        parentId?: string | null;
        afterFolderId?: string | null;
      }
    ) => {
      await relocateFolderAction(folderId, placement);
      setFolderDropTarget(null);
      setDraggedFolderId(null);
      router.refresh();
    },
    [router]
  );

  const handleCommandSubmit = useCallback(() => {
    if (!commandMatch) {
      return;
    }

    router.push(commandMatch.href);
  }, [commandMatch, router]);

  const toggleSection = useCallback((section: SidebarSectionKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const toggleSidebarCompact = useCallback(() => {
    setIsSidebarCompact((currentValue) => !currentValue);
  }, []);

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (typeof window === "undefined") {
        return;
      }

      const startX = event.clientX;
      const initialWidth = sidebarWidth;

      if (isSidebarCompact) {
        setIsSidebarCompact(false);
      }

      setIsSidebarResizing(true);

      const handlePointerMove = (moveEvent: MouseEvent) => {
        const nextWidth = clampSidebarWidth(
          initialWidth + (moveEvent.clientX - startX)
        );

        setSidebarWidth(nextWidth);
      };

      const handlePointerUp = () => {
        setIsSidebarResizing(false);
        teardownResizeRef.current = null;
        window.removeEventListener("mousemove", handlePointerMove);
        window.removeEventListener("mouseup", handlePointerUp);
      };

      teardownResizeRef.current = () => {
        window.removeEventListener("mousemove", handlePointerMove);
        window.removeEventListener("mouseup", handlePointerUp);
      };

      window.addEventListener("mousemove", handlePointerMove);
      window.addEventListener("mouseup", handlePointerUp);
    },
    [isSidebarCompact, sidebarWidth]
  );

  const buildNoteMenu = useCallback(
    (sidebarNote: SidebarNote): ContextMenuItem[] => [
      {
        label: "Notu aç",
        hint: "Seçili notu düzenleyicide aç",
        onSelect: () => router.push(`/notes/${sidebarNote.id}`),
      },
      {
        label: sidebarNote.isPinned ? "Sabitlemeyi kaldır" : "Sabitle",
        hint: "Notu sıralı listelerde üstte tut veya bırak",
        onSelect: async () => {
          await updateNoteAction(sidebarNote.id, {
            isPinned: !sidebarNote.isPinned,
          });
          router.refresh();
        },
      },
      {
        label: "Yukarı taşı",
        hint: "Not sırasını bir adım yukarı al",
        onSelect: async () => {
          await moveNoteAction(sidebarNote.id, "up");
          router.refresh();
        },
      },
      {
        label: "Aşağı taşı",
        hint: "Not sırasını bir adım aşağı al",
        onSelect: async () => {
          await moveNoteAction(sidebarNote.id, "down");
          router.refresh();
        },
      },
      {
        label: "Not bağlantısını kopyala",
        hint: "Dahili not adresini panoya kopyala",
        onSelect: () => copyInternalLink(`/notes/${sidebarNote.id}`),
      },
      {
        label: "Arşive taşı",
        hint: "Notu aktif listelerden kaldır",
        tone: "danger",
        onSelect: async () => {
          await archiveNoteAction(sidebarNote.id);
          if (currentNoteId === sidebarNote.id) {
            router.push("/dashboard");
          }
          router.refresh();
        },
      },
    ],
    [copyInternalLink, currentNoteId, router]
  );

  const buildFolderMenu = useCallback(
    (folder: SidebarFolder): ContextMenuItem[] => [
      {
        label: "Klasörü aç",
        hint: "Klasördeki notları görüntüle",
        onSelect: () => router.push(`/folders/${folder.id}`),
      },
      {
        label: "Bu klasöre not oluştur",
        hint: "Yeni notu doğrudan bu klasöre ekle",
        onSelect: async () => {
          const noteId = await createNoteAction({ folderId: folder.id });
          router.push(`/notes/${noteId}`);
        },
      },
      {
        label: "Klasör bağlantısını kopyala",
        hint: "Klasör adresini panoya kopyala",
        onSelect: () => copyInternalLink(`/folders/${folder.id}`),
      },
      {
        label: "Yukarı taşı",
        hint: "Klasör sırasını bir adım yukarı al",
        onSelect: () => handleMoveFolder(folder.id, "up"),
      },
      {
        label: "Aşağı taşı",
        hint: "Klasör sırasını bir adım aşağı al",
        onSelect: () => handleMoveFolder(folder.id, "down"),
      },
    ],
    [copyInternalLink, handleMoveFolder, router]
  );

  const footerMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        label: "Tercihleri sıfırla",
        hint: "Tema ve sidebar tercihlerini varsayılana al",
        onSelect: resetPreferences,
      },
      {
        label: "Çıkış yap",
        hint: "Oturumu kapat",
        tone: "danger" as const,
        onSelect: () => void signOutAction(),
      },
    ],
    [resetPreferences]
  );

  const paletteItems = useMemo<CommandPaletteItem[]>(() => {
    const actionItems: CommandPaletteItem[] = [
      {
        id: "action-new-note",
        group: "Hızlı işlemler",
        title: "Yeni not oluştur",
        description: "Boş bir not aç",
        icon: "+",
        hint: "Enter",
        onSelect: async () => {
          const noteId = await createNoteAction();
          router.push(`/notes/${noteId}`);
        },
      },
      {
        id: "action-new-folder",
        group: "Hızlı işlemler",
        title: "Yeni klasör oluştur",
        description: "Çalışma alanına yeni klasör ekle",
        icon: "K",
        onSelect: async () => {
          const folderName = window.prompt("Klasör adı", "Yeni Klasör")?.trim();

          if (!folderName) {
            return;
          }

          const folderId = await createFolderAction({
            name: folderName,
          });

          router.push(`/folders/${folderId}`);
        },
      },
      {
        id: "action-template-note",
        group: "Hızlı işlemler",
        title: "Şablondan not oluştur",
        description: "Şablon seçiciyi aç",
        icon: "T",
        onSelect: async () => {
          setTemplatePickerOpenSignal((currentValue) => currentValue + 1);
        },
      },
      {
        id: "action-dashboard",
        group: "Geçişler",
        title: "Panoya git",
        description: "Ana çalışma alanı görünümü",
        icon: "Ana",
        onSelect: async () => {
          router.push("/dashboard");
        },
      },
      {
        id: "action-graph",
        group: "Geçişler",
        title: "Bağlantı ağına git",
        description: "Not grafiği görünümü",
        icon: "Ağ",
        onSelect: async () => {
          router.push("/graph");
        },
      },
      {
        id: "action-inbox",
        group: "Geçişler",
        title: "Gelen kutusuna git",
        description: "Klasörsüz notları aç",
        icon: "In",
        onSelect: async () => {
          router.push("/inbox");
        },
      },
      {
        id: "action-search",
        group: "Geçişler",
        title: "Arama çalışma alanını aç",
        description: "Filtreli arama sayfası",
        icon: "Ara",
        onSelect: async () => {
          router.push("/search");
        },
      },
      {
        id: "action-templates",
        group: "Geçişler",
        title: "Şablon kütüphanesi",
        description: "Şablon yönetim alanını aç",
        icon: "Tpl",
        onSelect: async () => {
          router.push("/templates");
        },
      },
      {
        id: "action-publish",
        group: "Geçişler",
        title: "Yayın alanı",
        description: "Yayımdaki notları ve dışa aktarımları gör",
        icon: "Yay",
        onSelect: async () => {
          router.push("/publish");
        },
      },
      {
        id: "action-proposals",
        group: "Geçişler",
        title: "Öneri kuyruğu",
        description: "YZ öneri inceleme alanını aç",
        icon: "YZ",
        onSelect: async () => {
          router.push("/proposals");
        },
      },
      {
        id: "action-settings",
        group: "Geçişler",
        title: "Ayarlar",
        description: "Tema, yerel kuyruk ve tercihleri aç",
        icon: "Ay",
        onSelect: async () => {
          router.push("/settings");
        },
      },
      {
        id: "action-account",
        group: "Geçişler",
        title: "Hesap",
        description: "Profil ve şifre işlemleri",
        icon: "Hs",
        onSelect: async () => {
          router.push("/account");
        },
      },
    ];

    const noteItems = notes
      .filter((note) =>
        normalizedPaletteQuery
          ? note.title.toLowerCase().includes(normalizedPaletteQuery)
          : true
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((note) => ({
        id: `note-${note.id}`,
        group: "Notlar",
        title: note.title,
        description: "Notu düzenleyicide aç",
        icon: note.icon ?? "Not",
        onSelect: async () => {
          router.push(`/notes/${note.id}`);
        },
      }));

    const folderItems = flattenedFolders
      .filter((folder) =>
        normalizedPaletteQuery
          ? folder.name.toLowerCase().includes(normalizedPaletteQuery)
          : true
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((folder) => ({
        id: `folder-${folder.id}`,
        group: "Klasörler",
        title: folder.name,
        description: "Klasör görünümünü aç",
        icon: folder.icon ?? "Kls",
        onSelect: async () => {
          router.push(`/folders/${folder.id}`);
        },
      }));

    const tagItems = tags
      .filter((tag) =>
        normalizedPaletteQuery
          ? tag.name.toLowerCase().includes(normalizedPaletteQuery)
          : true
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((tag) => ({
        id: `tag-${tag.id}`,
        group: "Etiketler",
        title: `#${tag.name}`,
        description: `${tag.noteCount} not içeren etiket`,
        icon: "#",
        onSelect: async () => {
          router.push(`/tags/${tag.name}`);
        },
      }));

    const templateItems = templates
      .filter((template) =>
        normalizedPaletteQuery
          ? `${template.name} ${template.description ?? ""}`
              .toLowerCase()
              .includes(normalizedPaletteQuery)
          : true
      )
      .slice(0, normalizedPaletteQuery ? 6 : 4)
      .map<CommandPaletteItem>((template) => ({
        id: `template-${template.id}`,
        group: "Şablonlar",
        title: template.name,
        description:
          template.description ?? `${getTemplateCategoryLabel(template.category)} şablonu`,
        icon: template.icon ?? "Tpl",
        onSelect: async () => {
          router.push(`/templates?selected=${template.id}`);
        },
      }));

    if (!normalizedPaletteQuery) {
      return [
        ...actionItems,
        ...noteItems,
        ...folderItems,
        ...tagItems,
        ...templateItems,
      ];
    }

    const filteredActions = actionItems.filter((item) => {
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      return haystack.includes(normalizedPaletteQuery);
    });

    return [
      ...filteredActions,
      ...noteItems,
      ...folderItems,
      ...tagItems,
      ...templateItems,
    ];
  }, [flattenedFolders, normalizedPaletteQuery, notes, router, tags, templates]);

  const isFoldersCollapsed = hasQuery ? false : collapsedSections.folders;
  const isTagsCollapsed = hasQuery ? false : collapsedSections.tags;
  const isRecentNotesCollapsed = hasQuery
    ? false
    : collapsedSections.recentNotes;

  return (
    <aside
      className={`md-nav-drawer md-nav-drawer--graffle-sidebar${isSidebarCompact ? " md-nav-drawer--compact" : ""}${
        isSidebarResizing ? " md-nav-drawer--resizing" : ""
      }`} style={{ 
        width: isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth,
        transition: isSidebarResizing ? "none" : "width var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard)",
      }}
    >
      {isSidebarCompact ? (
        <div className="sidebar-compact-shell">
          <div className="sidebar-compact-stack">
            <button
              type="button"
              className="sidebar-compact-button sidebar-compact-brand"
              onClick={() => router.push("/dashboard")}
              aria-label="Panoya git"
            >
              G
            </button>
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={() => openPalette(searchQuery)}
              aria-label="Komut paletini aç"
            >
              Ara
            </button>
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={handleCreateNote}
              aria-label="Yeni not oluştur"
            >
              +
            </button>
            <button
              type="button"
              className={`sidebar-compact-button ${
                pathname === "/graph" ? "active" : ""
              }`}
              onClick={() => router.push("/graph")}
              aria-label="Bağlantı ağına git"
            >
              Ağ
            </button>
          </div>

          <div className="sidebar-compact-footer">
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={toggleSidebarCompact}
              aria-label="Sidebarı genişlet"
            >
              {">"}
            </button>
            <button
              type="button"
              className="sidebar-compact-avatar"
              onClick={(event) =>
                openContextMenuFromTrigger(event, footerMenuItems)
              }
              aria-label="Hesap menüsü"
            >
              {(user.name ?? user.email ?? "G").slice(0, 1).toUpperCase()}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sidebar-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
            <div
              className="sidebar-workspace-card"
              onClick={() => router.push("/dashboard")}
              style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}
            >
              <div className="sidebar-workspace-logo" style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)", borderRadius: "var(--md-sys-shape-small)", fontWeight: "bold" }}>G</div>
              <div className="sidebar-workspace-copy" style={{ display: "flex", flexDirection: "column" }}>
                <span className="sidebar-workspace-name" style={{ fontSize: "var(--md-sys-typescale-label-large-size)", fontWeight: "bold", color: "var(--md-sys-color-on-surface)" }}>Giraffle</span>
                <span className="sidebar-workspace-meta" style={{ fontSize: "var(--md-sys-typescale-body-small-size)", color: "var(--md-sys-color-on-surface-variant)" }}>
                  Kişisel bilgi alanı
                </span>
              </div>
            </div>
            <div className="sidebar-topbar-actions" style={{ display: "flex", gap: "4px" }}>
              <Button
                variant="text"
                icon
                onClick={handleCreateNote}
                aria-label="Yeni not oluştur"
              >
                <PlusIcon />
              </Button>
              <Button
                variant="text"
                icon
                onClick={toggleSidebarCompact}
                aria-label="Sidebarı daralt"
              >
                <ChevronLeftIcon />
              </Button>
            </div>
          </div>

          <div style={{ padding: "0 16px 12px" }}>
            <button
              type="button"
              className="md-text-field-container"
              style={{ width: "100%", borderRadius: "var(--md-sys-shape-full)", height: "40px", cursor: "pointer", background: "var(--md-sys-color-surface-container-high)", border: "1px solid var(--md-sys-color-outline-variant)" }}
              onClick={() => openPalette("")}
              aria-label="Arama veya komut paleti"
            >
              <span style={{ margin: "0 12px", color: "var(--md-sys-color-on-surface-variant)" }}>○</span>
              <span style={{ flex: 1, textAlign: "left", color: "var(--md-sys-color-on-surface-variant)", fontSize: "var(--md-sys-typescale-body-medium-size)" }}>Ara veya komut çalıştır...</span>
              <kbd style={{ margin: "0 12px", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "var(--md-sys-color-surface-container-low)" }}>⌘K</kbd>
            </button>
          </div>

          <div className="md-nav-drawer-content" style={{ padding: "0 12px" }}>
            <ul className="md-list" style={{ padding: 0 }}>
              {([
                {
                  path: "/dashboard",
                  icon: "Ana",
                  label: "Pano",
                  info: `${notes.length} not · ${templates.length} şablon`,
                  actions: [
                    { label: "Yeni not", onClick: () => void handleCreateNote(), primary: true },
                    { label: "Şablondan oluştur", onClick: () => setTemplatePickerOpenSignal((s) => s + 1) },
                  ],
                },
                {
                  path: "/inbox",
                  icon: "In",
                  label: "Gelen kutusu",
                  info: `${notes.filter((n) => !n.folderId).length} klasörsüz not`,
                  actions: [
                    { label: "Yeni not", onClick: () => void handleCreateNote(), primary: true },
                    { label: "Şablondan oluştur", onClick: () => setTemplatePickerOpenSignal((s) => s + 1) },
                  ],
                },
                {
                  path: "/graph",
                  icon: "Ağ",
                  label: "Bağlantı ağı",
                  info: "Notlar arasındaki wikilink projeksiyonu",
                },
              ] as Array<{
                path: string;
                icon: string;
                label: string;
                info: string;
                actions?: Array<{ label: string; onClick: () => void; primary?: boolean }>;
              }>).map(({ path, icon, label, info, actions }) => (
                <li key={path} style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                  <button
                    className={`md-list-item ${pathname === path ? "md-list-item--active" : ""}`}
                    style={{ flex: 1, borderRadius: "var(--md-sys-shape-medium)", minHeight: "48px", padding: "0 12px" }}
                    onClick={() => { closeNavModal(); router.push(path); }}
                  >
                    <div className="md-list-item-start" style={{ marginRight: "16px", width: "24px", justifyContent: "center", fontSize: "var(--md-sys-typescale-label-small-size)", opacity: 0.7 }}>{icon}</div>
                    <div className="md-list-item-content">
                      <span className="md-list-item-headline" style={{ fontSize: "var(--md-sys-typescale-label-large-size)" }}>{label}</span>
                    </div>
                  </button>
                  <Button
                    variant="text"
                    icon
                    className={navModal?.key === path ? "active" : ""}
                    style={{ opacity: 0.5, flexShrink: 0, width: "32px", height: "32px", marginLeft: "4px" }}
                    onClick={(e) => openNavModal(path, label, e, { info, actions })}
                    aria-label={`${label} menüsü`}
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </li>
              ))}
            </ul>

            <div className="md-list-divider" style={{ margin: "12px 0" }} />

            <SidebarGroup
              label="Klasörler"
              meta={
                hasQuery
                  ? `${visibleFolderCount}/${countFolders(folders)}`
                  : `${countFolders(folders)}`
              }
              collapsed={isFoldersCollapsed}
              onToggle={() => toggleSection("folders")}
              onAdd={handleCreateFolder}
            >
              <div className="sidebar-folder-tree">
                {draggedFolderId ? (
                  <div
                    className={`sidebar-folder-dropzone root${
                      folderDropTarget?.folderId === "__root__" ? " active" : ""
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setFolderDropTarget({
                        folderId: "__root__",
                        mode: "after",
                      });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedFolderId) {
                        return;
                      }

                      void handleRelocateFolder(draggedFolderId, {
                        parentId: null,
                        afterFolderId: null,
                      });
                    }}
                  >
                    Kök’e taşı
                  </div>
                ) : null}
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
                      onOpen={(folderId) => router.push(`/folders/${folderId}`)}
                      onMoveFolder={handleMoveFolder}
                      onRelocateFolder={handleRelocateFolder}
                      onQuickCreate={handleCreateNoteInFolder}
                      onContextMenuOpen={(event, currentFolder) =>
                        openContextMenuAtPointer(
                          event,
                          buildFolderMenu(currentFolder)
                        )
                      }
                      onTriggerMenuOpen={(event, currentFolder) =>
                        openContextMenuFromTrigger(
                          event,
                          buildFolderMenu(currentFolder)
                        )
                      }
                      draggedFolderId={draggedFolderId}
                      folderDropTarget={folderDropTarget}
                      onDragFolderChange={setDraggedFolderId}
                      onDropTargetChange={setFolderDropTarget}
                    />
                  ))
                )}
              </div>
            </SidebarGroup>

            <SidebarGroup
              label="Etiketler"
              meta={
                hasQuery
                  ? `${filteredTags.length}/${tags.length}`
                  : `${tags.length}`
              }
              collapsed={isTagsCollapsed}
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
                      className={`sidebar-tag-item ${
                        pathname === `/tags/${tag.name}` ? "active" : ""
                      }`}
                      onClick={() => router.push(`/tags/${tag.name}`)}
                    >
                      <span className="sidebar-tag-label">#{tag.name}</span>
                      <span className="sidebar-tag-count">{tag.noteCount}</span>
                    </button>
                  ))
                )}
              </div>
            </SidebarGroup>

            <SidebarGroup
              label={hasQuery ? "Not eşleşmeleri" : "Son notlar"}
              meta={
                hasQuery
                  ? `${filteredNotes.length}/${notes.length}`
                  : `${notes.length}`
              }
              collapsed={isRecentNotesCollapsed}
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
                  filteredNotes.map((sidebarNote) => (
                    <SidebarNoteRow
                      key={sidebarNote.id}
                      note={sidebarNote}
                      active={sidebarNote.id === currentNoteId}
                      onOpen={(noteId) => router.push(`/notes/${noteId}`)}
                      onContextMenuOpen={(event, currentNote) =>
                        openContextMenuAtPointer(
                          event,
                          buildNoteMenu(currentNote)
                        )
                      }
                      onTriggerMenuOpen={(event, currentNote) =>
                        openContextMenuFromTrigger(
                          event,
                          buildNoteMenu(currentNote)
                        )
                      }
                    />
                  ))
                )}
              </nav>
            </SidebarGroup>
          </div>

          <nav className="sidebar-rail">
            {([
              { path: "/search", icon: "Ara", label: "Arama" },
              { path: "/templates", icon: "Tpl", label: "Şablonlar" },
              { path: "/publish", icon: "Pub", label: "Yayın" },
              { path: "/proposals", icon: "YZ", label: "Öneriler" },
              { path: "/settings", icon: "Ay", label: "Ayarlar" },
              { path: "/account", icon: "Hs", label: "Hesap" },
            ]).map(({ path, icon, label }) => (
              <button
                key={path}
                type="button"
                className={`sidebar-rail-item${pathname === path || pathname.startsWith(path + "/") ? " active" : ""}`}
                onClick={() => router.push(path)}
                aria-label={label}
                title={label}
              >
                {icon}
              </button>
            ))}
          </nav>

          <div className="md-nav-drawer-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--md-sys-color-outline-variant)", padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
              <div style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "var(--md-sys-shape-full)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--md-sys-color-surface-variant)", color: "var(--md-sys-color-on-surface-variant)", fontWeight: "bold" }}>
                {(user.name ?? user.email ?? "G").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                <div style={{ fontSize: "var(--md-sys-typescale-body-medium-size)", fontWeight: "var(--md-sys-typescale-body-medium-weight)", color: "var(--md-sys-color-on-surface)", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user.name ?? user.email ?? "Giraffle Kullanıcı"}
                </div>
                {user.email ? (
                  <div style={{ fontSize: "var(--md-sys-typescale-body-small-size)", color: "var(--md-sys-color-on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.email}
                  </div>
                ) : null}
              </div>
            </div>
            <Button
              variant="text"
              icon
              onClick={(event) => openContextMenuFromTrigger(event, footerMenuItems)}
              aria-label="Hesap ve tema menüsü"
            >
              <MoreHorizontalIcon />
            </Button>
          </div>
        </>
      )}

      <div className="sidebar-template-host" aria-hidden="true">
        <TemplatePicker
          templates={templates}
          buttonLabel="Şablon"
          buttonClassName="sidebar-template-host-button"
          openSignal={templatePickerOpenSignal}
        />
      </div>

      {!isSidebarCompact ? (
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleSidebarResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Sidebar genişliğini değiştir"
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
      {navModal ? (
        <div className="sidebar-nav-modal-overlay" onClick={closeNavModal}>
          <div
            className="sidebar-nav-modal"
            style={{ left: navModal.x, top: navModal.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sidebar-nav-modal-header">
              <div className="sidebar-nav-modal-title">{navModal.label}</div>
              {navModal.info ? (
                <div className="sidebar-nav-modal-desc">{navModal.info}</div>
              ) : null}
            </div>
            <div className="sidebar-nav-modal-body">
              {navModal.isSearch ? (
                <div className="sidebar-nav-modal-search">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim();
                      closeNavModal();
                      router.push(`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`);
                    }}
                  >
                    <input
                      name="q"
                      className="sidebar-nav-modal-input"
                      placeholder="Notlar, klasörler, şablonlar ara..."
                      autoFocus
                    />
                  </form>
                </div>
              ) : null}
              {navModal.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={`sidebar-nav-modal-btn${action.primary ? " primary" : ""}`}
                  onClick={() => { action.onClick(); closeNavModal(); }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function SidebarGroup({
  label,
  meta,
  collapsed = false,
  collapsible = true,
  onToggle,
  onAdd,
  children,
}: {
  label: string;
  meta?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  onToggle?: () => void;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`sidebar-group ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-group-head">
        {collapsible ? (
          <button
            type="button"
            className="sidebar-group-toggle"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            <span className={`sidebar-group-caret ${collapsed ? "collapsed" : ""}`}>
              ▾
            </span>
            <span className="sidebar-group-label">{label}</span>
          </button>
        ) : (
          <div className="sidebar-group-title">
            <span className="sidebar-group-label">{label}</span>
          </div>
        )}
        <div className="sidebar-group-actions">
          {meta ? <span className="sidebar-group-meta">{meta}</span> : null}
          {onAdd ? (
            <button
              type="button"
              className="sidebar-group-add"
              onClick={onAdd}
              aria-label={`${label} ekle`}
            >
              <PlusIcon />
            </button>
          ) : null}
        </div>
      </div>
      {!collapsed ? <div className="sidebar-group-body">{children}</div> : null}
    </section>
  );
}

function SidebarNoteRow({
  note,
  active,
  onOpen,
  onContextMenuOpen,
  onTriggerMenuOpen,
}: {
  note: SidebarNote;
  active: boolean;
  onOpen: (noteId: string) => void;
  onContextMenuOpen: (
    event: ReactMouseEvent<HTMLElement>,
    note: SidebarNote
  ) => void;
  onTriggerMenuOpen: (
    event: ReactMouseEvent<HTMLButtonElement>,
    note: SidebarNote
  ) => void;
}) {
  return (
    <div className={`sidebar-entity-row ${active ? "active" : ""}`}>
      <button
        type="button"
        className={`sidebar-item sidebar-row-main ${active ? "active" : ""}`}
        onClick={() => onOpen(note.id)}
        onContextMenu={(event) => onContextMenuOpen(event, note)}
      >
        <span className="sidebar-item-icon">{note.icon ?? "Not"}</span>
        <span className="sidebar-item-label">
          {note.title}
          {note.isPinned ? " *" : ""}
        </span>
      </button>
      <div className="sidebar-row-actions">
        <button
          type="button"
          className="context-trigger sidebar-row-action"
          onClick={(event) => onTriggerMenuOpen(event, note)}
          aria-label={`${note.title} menüsünü aç`}
          title="Seçenekler"
        >
          <MoreHorizontalIcon />
        </button>
      </div>
    </div>
  );
}

function SidebarFolderItem({
  folder,
  pathname,
  onOpen,
  onMoveFolder,
  onRelocateFolder,
  onQuickCreate,
  onContextMenuOpen,
  onTriggerMenuOpen,
  draggedFolderId,
  folderDropTarget,
  onDragFolderChange,
  onDropTargetChange,
  depth = 0,
}: {
  folder: SidebarFolder;
  pathname: string;
  onOpen: (folderId: string) => void;
  onMoveFolder: (
    folderId: string,
    direction: "up" | "down"
  ) => void | Promise<void>;
  onRelocateFolder: (
    folderId: string,
    placement: {
      parentId?: string | null;
      afterFolderId?: string | null;
    }
  ) => void | Promise<void>;
  onQuickCreate: (folderId: string) => void | Promise<void>;
  onContextMenuOpen: (
    event: ReactMouseEvent<HTMLElement>,
    folder: SidebarFolder
  ) => void;
  onTriggerMenuOpen: (
    event: ReactMouseEvent<HTMLButtonElement>,
    folder: SidebarFolder
  ) => void;
  draggedFolderId: string | null;
  folderDropTarget: FolderDropTarget | null;
  onDragFolderChange: (folderId: string | null) => void;
  onDropTargetChange: (target: FolderDropTarget | null) => void;
  depth?: number;
}) {
  const isActive = pathname === `/folders/${folder.id}`;
  const isInsideDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "inside";
  const isAfterDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "after";

  return (
    <div className="sidebar-folder-node">
      <div
        className={`sidebar-entity-row ${isActive ? "active" : ""}${
          isInsideDropTarget ? " drag-target" : ""
        }`}
      >
        <button
          type="button"
          className={`sidebar-item sidebar-row-main ${isActive ? "active" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => onOpen(folder.id)}
          onContextMenu={(event) => onContextMenuOpen(event, folder)}
          draggable
          onDragStart={() => onDragFolderChange(folder.id)}
          onDragEnd={() => {
            onDragFolderChange(null);
            onDropTargetChange(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (draggedFolderId === folder.id) {
              return;
            }

            onDropTargetChange({
              folderId: folder.id,
              mode: "inside",
            });
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!draggedFolderId || draggedFolderId === folder.id) {
              return;
            }

            void onRelocateFolder(draggedFolderId, {
              parentId: folder.id,
              afterFolderId: null,
            });
          }}
        >
          <span className="sidebar-item-icon">{folder.icon ?? "Kls"}</span>
          <span className="sidebar-item-label">{folder.name}</span>
          <span className="sidebar-folder-count">{folder._count?.notes ?? 0}</span>
        </button>
        <div className="sidebar-row-actions">
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onQuickCreate(folder.id);
            }}
            aria-label={`${folder.name} içine not oluştur`}
            title="Not Oluştur"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => onTriggerMenuOpen(event, folder)}
            aria-label={`${folder.name} menüsünü aç`}
            title="Seçenekler"
          >
            <MoreHorizontalIcon />
          </button>
        </div>
      </div>

      {draggedFolderId && draggedFolderId !== folder.id ? (
        <div
          className={`sidebar-folder-dropzone${isAfterDropTarget ? " active" : ""}`}
          style={{ marginLeft: `${12 + depth * 16}px` }}
          onDragOver={(event) => {
            event.preventDefault();
            onDropTargetChange({
              folderId: folder.id,
              mode: "after",
            });
          }}
          onDrop={(event) => {
            event.preventDefault();
            void onRelocateFolder(draggedFolderId, {
              parentId: folder.parentId ?? null,
              afterFolderId: folder.id,
            });
          }}
        >
          {isInsideDropTarget ? "İçine bırak" : "Altına bırak"}
        </div>
      ) : null}

      {(folder.children ?? []).length > 0 ? (
        <div className="sidebar-folder-children">
          {(folder.children ?? []).map((childFolder) => (
            <SidebarFolderItem
              key={childFolder.id}
              folder={childFolder}
              pathname={pathname}
              onOpen={onOpen}
              onMoveFolder={onMoveFolder}
              onRelocateFolder={onRelocateFolder}
              onQuickCreate={onQuickCreate}
              onContextMenuOpen={onContextMenuOpen}
              onTriggerMenuOpen={onTriggerMenuOpen}
              draggedFolderId={draggedFolderId}
              folderDropTarget={folderDropTarget}
              onDragFolderChange={onDragFolderChange}
              onDropTargetChange={onDropTargetChange}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function extractActiveNoteId(pathname: string | null) {
  if (!pathname?.startsWith("/notes/")) {
    return null;
  }

  const [, , noteId] = pathname.split("/");
  return noteId ?? null;
}

function areSidebarCollapseStatesEqual(
  left: SidebarCollapseState,
  right: SidebarCollapseState
) {
  return (
    left.folders === right.folders &&
    left.tags === right.tags &&
    left.recentNotes === right.recentNotes
  );
}

function loadSidebarCollapseState(): SidebarCollapseState {
  if (typeof window === "undefined") {
    return DEFAULT_COLLAPSED_SECTIONS;
  }

  try {
    const storedValue = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);

    if (!storedValue) {
      return DEFAULT_COLLAPSED_SECTIONS;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<SidebarCollapseState>;

    return {
      folders: Boolean(parsedValue.folders),
      tags: Boolean(parsedValue.tags),
      recentNotes: Boolean(parsedValue.recentNotes),
    };
  } catch {
    return DEFAULT_COLLAPSED_SECTIONS;
  }
}

function loadSidebarWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  }

  const storedValue = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : NaN;

  if (Number.isNaN(parsedValue)) {
    return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  }

  return clampSidebarWidth(parsedValue);
}

function loadSidebarCompactState(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return JSON.parse(
      window.localStorage.getItem(SIDEBAR_COMPACT_STORAGE_KEY) ?? "false"
    ) as boolean;
  } catch {
    return false;
  }
}

function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
}

function filterFolderTree(
  folderTree: SidebarFolder[],
  query: string
): SidebarFolder[] {
  return folderTree.flatMap((folder) => {
    const filteredChildren = filterFolderTree(folder.children ?? [], query);
    const matchesSelf = folder.name.toLowerCase().includes(query);

    if (!matchesSelf && filteredChildren.length === 0) {
      return [];
    }

    return [
      {
        ...folder,
        children: matchesSelf ? folder.children ?? [] : filteredChildren,
      },
    ];
  });
}

function countFolders(folderTree: SidebarFolder[]): number {
  return folderTree.reduce(
    (total, folder) => total + 1 + countFolders(folder.children ?? []),
    0
  );
}

function getFirstFolderId(folderTree: SidebarFolder[]): string | null {
  if (folderTree.length === 0) {
    return null;
  }

  return folderTree[0]?.id ?? null;
}

function findFolderById(
  folderTree: SidebarFolder[],
  folderId: string
): SidebarFolder | null {
  for (const folder of folderTree) {
    if (folder.id === folderId) {
      return folder;
    }

    const childMatch = findFolderById(folder.children ?? [], folderId);

    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function flattenFolderTree(folderTree: SidebarFolder[]): SidebarFolder[] {
  return folderTree.flatMap((folder) => [
    folder,
    ...flattenFolderTree(folder.children ?? []),
  ]);
}

// UI Icons
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="19" cy="12" r="1"></circle>
      <circle cx="5" cy="12" r="1"></circle>
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  );
}
