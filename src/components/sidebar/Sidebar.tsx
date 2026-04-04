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
import {
  APP_THEMES,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  type AppThemeId,
  isAppThemeId,
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
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    loadSidebarWidth()
  );
  const [isSidebarCompact, setIsSidebarCompact] = useState<boolean>(() =>
    loadSidebarCompactState()
  );
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [collapsedSections, setCollapsedSections] =
    useState<SidebarCollapseState>(() => loadSidebarCollapseState());
  const deferredSearchQuery = useDeferredValue(searchQuery);

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
    document.documentElement.dataset.theme = themeId;
    localStorage.setItem(APP_THEME_STORAGE_KEY, themeId);
    setActiveThemeId(themeId);
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
        document.documentElement.dataset.theme = storedTheme;
      } else {
        document.documentElement.dataset.theme = DEFAULT_APP_THEME;
        localStorage.setItem(APP_THEME_STORAGE_KEY, DEFAULT_APP_THEME);
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
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsedSections)
    );
  }, [collapsedSections]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(
      SIDEBAR_COMPACT_STORAGE_KEY,
      JSON.stringify(isSidebarCompact)
    );
  }, [isSidebarCompact]);

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
    const folderName = window.prompt("Klasor adi", "Yeni Klasor")?.trim();

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
        label: "Notu ac",
        hint: "Secili notu duzenleyicide ac",
        onSelect: () => router.push(`/notes/${sidebarNote.id}`),
      },
      {
        label: sidebarNote.isPinned ? "Sabitlemeyi kaldir" : "Sabitle",
        hint: "Notu sirali listelerde ustte tut veya birak",
        onSelect: async () => {
          await updateNoteAction(sidebarNote.id, {
            isPinned: !sidebarNote.isPinned,
          });
          router.refresh();
        },
      },
      {
        label: "Yukari tasi",
        hint: "Not sirasini bir adim yukari al",
        onSelect: async () => {
          await moveNoteAction(sidebarNote.id, "up");
          router.refresh();
        },
      },
      {
        label: "Asagi tasi",
        hint: "Not sirasini bir adim asagi al",
        onSelect: async () => {
          await moveNoteAction(sidebarNote.id, "down");
          router.refresh();
        },
      },
      {
        label: "Not baglantisini kopyala",
        hint: "Dahili not adresini panoya kopyala",
        onSelect: () => copyInternalLink(`/notes/${sidebarNote.id}`),
      },
      {
        label: "Arsive tasi",
        hint: "Notu aktif listelerden kaldir",
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
        label: "Klasoru ac",
        hint: "Klasordeki notlari goruntule",
        onSelect: () => router.push(`/folders/${folder.id}`),
      },
      {
        label: "Bu klasore not olustur",
        hint: "Yeni notu dogrudan bu klasore ekle",
        onSelect: async () => {
          const noteId = await createNoteAction({ folderId: folder.id });
          router.push(`/notes/${noteId}`);
        },
      },
      {
        label: "Klasor baglantisini kopyala",
        hint: "Klasor adresini panoya kopyala",
        onSelect: () => copyInternalLink(`/folders/${folder.id}`),
      },
      {
        label: "Yukari tasi",
        hint: "Klasor sirasini bir adim yukari al",
        onSelect: () => handleMoveFolder(folder.id, "up"),
      },
      {
        label: "Asagi tasi",
        hint: "Klasor sirasini bir adim asagi al",
        onSelect: () => handleMoveFolder(folder.id, "down"),
      },
    ],
    [copyInternalLink, handleMoveFolder, router]
  );

  const themeMenuItems = useMemo<ContextMenuItem[]>(
    () =>
      APP_THEMES.map((theme) => ({
        label: theme.label,
        hint:
          theme.id === activeThemeId ? "Su an secili tema" : theme.description,
        onSelect: () => applyTheme(theme.id),
      })),
    [activeThemeId, applyTheme]
  );

  const paletteItems = useMemo<CommandPaletteItem[]>(() => {
    const actionItems: CommandPaletteItem[] = [
      {
        id: "action-new-note",
        group: "Hizli islemler",
        title: "Yeni not olustur",
        description: "Bos bir not ac",
        icon: "+",
        hint: "Enter",
        onSelect: async () => {
          const noteId = await createNoteAction();
          router.push(`/notes/${noteId}`);
        },
      },
      {
        id: "action-new-folder",
        group: "Hizli islemler",
        title: "Yeni klasor olustur",
        description: "Calisma alanina yeni klasor ekle",
        icon: "K",
        onSelect: async () => {
          const folderName = window.prompt("Klasor adi", "Yeni Klasor")?.trim();

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
        group: "Hizli islemler",
        title: "Sablondan not olustur",
        description: "Template picker ac",
        icon: "T",
        onSelect: async () => {
          setTemplatePickerOpenSignal((currentValue) => currentValue + 1);
        },
      },
      {
        id: "action-dashboard",
        group: "Gecisler",
        title: "Panoya git",
        description: "Ana calisma alani gorunumu",
        icon: "Ana",
        onSelect: async () => {
          router.push("/dashboard");
        },
      },
      {
        id: "action-graph",
        group: "Gecisler",
        title: "Baglanti agina git",
        description: "Not graph gorunumu",
        icon: "Ag",
        onSelect: async () => {
          router.push("/graph");
        },
      },
      {
        id: "action-inbox",
        group: "Gecisler",
        title: "Gelen kutusuna git",
        description: "Klasorsuz notlari ac",
        icon: "In",
        onSelect: async () => {
          router.push("/inbox");
        },
      },
      {
        id: "action-search",
        group: "Gecisler",
        title: "Arama calisma alanini ac",
        description: "Filtreli arama sayfasi",
        icon: "Ara",
        onSelect: async () => {
          router.push("/search");
        },
      },
      {
        id: "action-templates",
        group: "Gecisler",
        title: "Sablon kutuphanesi",
        description: "Template yonetim alanini ac",
        icon: "Tpl",
        onSelect: async () => {
          router.push("/templates");
        },
      },
      {
        id: "action-publish",
        group: "Gecisler",
        title: "Publish alani",
        description: "Yayindaki notlari ve exportleri gor",
        icon: "Pub",
        onSelect: async () => {
          router.push("/publish");
        },
      },
      {
        id: "action-proposals",
        group: "Gecisler",
        title: "Oneri kuyrugu",
        description: "AI proposal review alanini ac",
        icon: "AI",
        onSelect: async () => {
          router.push("/proposals");
        },
      },
      {
        id: "action-settings",
        group: "Gecisler",
        title: "Ayarlar",
        description: "Tema, local queue ve tercihleri ac",
        icon: "Ay",
        onSelect: async () => {
          router.push("/settings");
        },
      },
      {
        id: "action-account",
        group: "Gecisler",
        title: "Hesap",
        description: "Profil ve sifre islemleri",
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
        description: "Notu duzenleyicide ac",
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
        group: "Klasorler",
        title: folder.name,
        description: "Klasor gorunumunu ac",
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
        description: `${tag.noteCount} not iceren etiket`,
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
        group: "Sablonlar",
        title: template.name,
        description: template.description ?? `${template.category} sablonu`,
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
      className={`sidebar${isSidebarCompact ? " compact" : ""}${
        isSidebarResizing ? " resizing" : ""
      }`}
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
              aria-label="Komut paletini ac"
            >
              Ara
            </button>
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={handleCreateNote}
              aria-label="Yeni not olustur"
            >
              +
            </button>
            <button
              type="button"
              className={`sidebar-compact-button ${
                pathname === "/graph" ? "active" : ""
              }`}
              onClick={() => router.push("/graph")}
              aria-label="Baglanti agina git"
            >
              Ag
            </button>
          </div>

          <div className="sidebar-compact-footer">
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={toggleSidebarCompact}
              aria-label="Sidebari genislet"
            >
              {">"}
            </button>
            <button
              type="button"
              className="sidebar-compact-avatar"
              onClick={(event) =>
                openContextMenuFromTrigger(event, themeMenuItems)
              }
              aria-label="Tema sec"
            >
              {(user.name ?? user.email ?? "G").slice(0, 1).toUpperCase()}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sidebar-topbar">
            <button
              type="button"
              className="sidebar-workspace-card"
              onClick={() => router.push("/dashboard")}
            >
              <span className="sidebar-workspace-logo">G</span>
              <span className="sidebar-workspace-copy">
                <span className="sidebar-workspace-name">Graffle</span>
                <span className="sidebar-workspace-meta">
                  Kisisel bilgi alani
                </span>
              </span>
            </button>
            <div className="sidebar-topbar-actions">
              <button
                type="button"
                className="sidebar-icon-button"
                onClick={handleCreateNote}
                aria-label="Yeni not olustur"
              >
                +
              </button>
              <button
                type="button"
                className="sidebar-icon-button sidebar-collapse-button"
                onClick={toggleSidebarCompact}
                aria-label="Sidebari daralt"
              >
                {"<"}
              </button>
            </div>
          </div>

          <div className="sidebar-command-shell">
            <div className="sidebar-command">
              <input
                ref={commandInputRef}
                type="text"
                className="sidebar-command-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCommandSubmit();
                  }
                }}
                placeholder="Ara veya komut calistir..."
                spellCheck={false}
              />
              <button
                type="button"
                className="sidebar-command-shortcut"
                onClick={() => openPalette(searchQuery)}
                aria-label="Arama kisayolu"
              >
                Ctrl K
              </button>
            </div>

            <div className="sidebar-command-summary">
              {hasQuery ? (
                commandMatch ? (
                  <button
                    type="button"
                    className="sidebar-command-result"
                    onClick={handleCommandSubmit}
                  >
                    <span>Enter ile ac</span>
                    <span>{commandMatch.label}</span>
                  </button>
                ) : (
                  <span className="sidebar-command-empty">
                    Eslesen sonuc yok.
                  </span>
                )
              ) : (
                <span className="sidebar-command-hint">
                  Notlar, klasorler ve etiketler burada filtrelenir.
                </span>
              )}
            </div>
          </div>

          <div className="sidebar-inline-actions">
            <button
              type="button"
              className="sidebar-inline-action"
              onClick={() =>
                setTemplatePickerOpenSignal((currentValue) => currentValue + 1)
              }
            >
              Sablon
            </button>
            <button
              type="button"
              className="sidebar-inline-action"
              onClick={handleCreateFolder}
            >
              Klasor
            </button>
          </div>

          <div className="sidebar-section">
            <SidebarGroup
              label="Calisma alani"
              meta={hasQuery ? "Sabit" : undefined}
              collapsible={false}
            >
              <nav className="sidebar-nav">
                <button
                  className={`sidebar-item ${
                    pathname === "/dashboard" ? "active" : ""
                  }`}
                  onClick={() => router.push("/dashboard")}
                >
                  <span className="sidebar-item-icon">Ana</span>
                  <span className="sidebar-item-label">Pano</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/inbox" ? "active" : ""
                  }`}
                  onClick={() => router.push("/inbox")}
                >
                  <span className="sidebar-item-icon">In</span>
                  <span className="sidebar-item-label">Gelen kutusu</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/search" ? "active" : ""
                  }`}
                  onClick={() => router.push("/search")}
                >
                  <span className="sidebar-item-icon">Ara</span>
                  <span className="sidebar-item-label">Arama</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/graph" ? "active" : ""
                  }`}
                  onClick={() => router.push("/graph")}
                >
                  <span className="sidebar-item-icon">Ag</span>
                  <span className="sidebar-item-label">Baglanti agi</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/templates" ? "active" : ""
                  }`}
                  onClick={() => router.push("/templates")}
                >
                  <span className="sidebar-item-icon">Tpl</span>
                  <span className="sidebar-item-label">Sablonlar</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/publish" ? "active" : ""
                  }`}
                  onClick={() => router.push("/publish")}
                >
                  <span className="sidebar-item-icon">Pub</span>
                  <span className="sidebar-item-label">Publish</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/proposals" ? "active" : ""
                  }`}
                  onClick={() => router.push("/proposals")}
                >
                  <span className="sidebar-item-icon">AI</span>
                  <span className="sidebar-item-label">Oneriler</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/settings" ? "active" : ""
                  }`}
                  onClick={() => router.push("/settings")}
                >
                  <span className="sidebar-item-icon">Ay</span>
                  <span className="sidebar-item-label">Ayarlar</span>
                </button>
                <button
                  className={`sidebar-item ${
                    pathname === "/account" ? "active" : ""
                  }`}
                  onClick={() => router.push("/account")}
                >
                  <span className="sidebar-item-icon">Hs</span>
                  <span className="sidebar-item-label">Hesap</span>
                </button>
              </nav>
            </SidebarGroup>

            <SidebarGroup
              label="Klasorler"
              meta={
                hasQuery
                  ? `${visibleFolderCount}/${countFolders(folders)}`
                  : `${countFolders(folders)}`
              }
              collapsed={isFoldersCollapsed}
              onToggle={() => toggleSection("folders")}
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
                    Koke tasi
                  </div>
                ) : null}
                {filteredFolders.length === 0 ? (
                  <div className="sidebar-empty">
                    {hasQuery ? "Eslesen klasor yok." : "Henuz klasor yok."}
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
                      ? "Eslesen etiket yok."
                      : "Henuz indekslenmis etiket yok."}
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
              label={hasQuery ? "Not eslesmeleri" : "Son notlar"}
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
                      ? "Eslesen not yok."
                      : "Henuz not yok. Ilk notunu olustur."}
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

          <div className="sidebar-footer">
            <div className="sidebar-user-card">
              <div className="sidebar-user-meta">
                <span className="sidebar-user-avatar">
                  {(user.name ?? user.email ?? "G").slice(0, 1).toUpperCase()}
                </span>
                <div className="sidebar-user-copy">
                  <div className="sidebar-user-name">
                    {user.name ?? user.email ?? "Graffle Kullanici"}
                  </div>
                  {user.email ? (
                    <div className="sidebar-user-email">{user.email}</div>
                  ) : null}
                </div>
              </div>
              <div className="sidebar-user-actions">
                <button
                  type="button"
                  className="sidebar-theme-button"
                  onClick={(event) =>
                    openContextMenuFromTrigger(event, themeMenuItems)
                  }
                  aria-label="Tema sec"
                >
                  <span className="sidebar-theme-label">Tema</span>
                  <span className="sidebar-theme-value">{activeTheme.label}</span>
                </button>
              </div>
            </div>

            <form action={signOutAction}>
              <button type="submit" className="sidebar-sign-out">
                Cikis yap
              </button>
            </form>
          </div>
        </>
      )}

      <div className="sidebar-template-host" aria-hidden="true">
        <TemplatePicker
          templates={templates}
          buttonLabel="Sablon"
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
          aria-label="Sidebar genisligini degistir"
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

function SidebarGroup({
  label,
  meta,
  collapsed = false,
  collapsible = true,
  onToggle,
  children,
}: {
  label: string;
  meta?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  onToggle?: () => void;
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
        {meta ? <span className="sidebar-group-meta">{meta}</span> : null}
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
          aria-label={`${note.title} menusunu ac`}
        >
          ...
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
              void onMoveFolder(folder.id, "up");
            }}
            aria-label={`${folder.name} klasorunu yukari tasi`}
          >
            ^
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onMoveFolder(folder.id, "down");
            }}
            aria-label={`${folder.name} klasorunu asagi tasi`}
          >
            v
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onQuickCreate(folder.id);
            }}
            aria-label={`${folder.name} icine not olustur`}
          >
            +
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => onTriggerMenuOpen(event, folder)}
            aria-label={`${folder.name} menusunu ac`}
          >
            ...
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
          {isInsideDropTarget ? "Icine birak" : "Altina birak"}
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
