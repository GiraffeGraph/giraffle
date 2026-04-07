"use client";

import Image from "next/image";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CommandPalette, type CommandPaletteItem } from "@/components/sidebar/CommandPalette";
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
import { createFolderAction, moveFolderAction, relocateFolderAction } from "@/server/api/folders";
import { archiveNoteAction, createNoteAction, moveNoteAction, updateNoteAction } from "@/server/api/notes";
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
import type { FolderDropTarget, SidebarMenuState, SidebarProps, SidebarSectionKey } from "./sidebar.types";
import {
  areSidebarCollapseStatesEqual,
  clampSidebarWidth,
  extractActiveNoteId,
  filterFolderTree,
  findFolderById,
  flattenFolderTree,
  getFirstFolderId,
  loadSidebarCollapseState,
  loadSidebarCompactState,
  loadSidebarWidth,
} from "./sidebar.utils";
import { SidebarGroup } from "./SidebarGroup";
import { SidebarNoteRow } from "./SidebarNoteRow";
import { SidebarFolderItem } from "./SidebarFolderItem";

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

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
  const teardownResizeRef = useRef<(() => void) | null>(null);

  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [templatePickerOpenSignal, setTemplatePickerOpenSignal] = useState(0);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<FolderDropTarget | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<AppThemeId>(DEFAULT_APP_THEME);
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_EXPANDED_SIDEBAR_WIDTH);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<SidebarCollapseState>(DEFAULT_COLLAPSED_SECTIONS);
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

  const normalizedPaletteQuery = paletteQuery.trim().toLowerCase();
  const currentNoteId = activeNoteId ?? extractActiveNoteId(pathname) ?? undefined;

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openPalette = useCallback((initialQuery = "") => {
    setPaletteQuery(initialQuery);
    setIsPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => {
    setIsPaletteOpen(false);
    setPaletteQuery("");
  }, []);
  const closeNavModal = useCallback(() => setNavModal(null), []);

  const openNavModal = useCallback(
    (
      key: string,
      label: string,
      event: ReactMouseEvent<HTMLButtonElement>,
      extra?: { info?: string; isSearch?: boolean; actions?: Array<{ label: string; onClick: () => void; primary?: boolean }> }
    ) => {
      event.stopPropagation();
      if (navModal?.key === key) { setNavModal(null); return; }
      const rect = event.currentTarget.getBoundingClientRect();
      setNavModal({ key, label, x: rect.right + 6, y: rect.top, ...extra });
    },
    [navModal]
  );

  const openContextMenuAtPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
      event.preventDefault();
      setContextMenu({ position: { x: event.clientX, y: event.clientY }, items });
    },
    []
  );

  const openContextMenuFromTrigger = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, items: ContextMenuItem[]) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setContextMenu({ position: { x: rect.right - 14, y: rect.bottom + 8 }, items });
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

  const toggleSection = useCallback((section: SidebarSectionKey) => {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  const toggleSidebarCompact = useCallback(() => setIsSidebarCompact((v) => !v), []);

  // Load preferences from localStorage
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const nextWidth = loadSidebarWidth();
      const nextCompact = loadSidebarCompactState();
      const nextSections = loadSidebarCollapseState();
      setSidebarWidth((w) => (w === nextWidth ? w : nextWidth));
      setIsSidebarCompact((c) => (c === nextCompact ? c : nextCompact));
      setCollapsedSections((s) => (areSidebarCollapseStatesEqual(s, nextSections) ? s : nextSections));
      setHasLoadedPreferences(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  // Sync theme from DOM/localStorage
  useEffect(() => {
    const currentTheme = document.documentElement.dataset.theme;
    let nextTheme = DEFAULT_APP_THEME;
    if (currentTheme && isAppThemeId(currentTheme)) {
      nextTheme = currentTheme;
    } else {
      const stored = localStorage.getItem(APP_THEME_STORAGE_KEY);
      if (stored && isAppThemeId(stored)) {
        nextTheme = stored;
        persistAppTheme(stored);
      } else {
        persistAppTheme(DEFAULT_APP_THEME);
      }
    }
    if (nextTheme === activeThemeId) return;
    const frameId = window.requestAnimationFrame(() => setActiveThemeId(nextTheme));
    return () => window.cancelAnimationFrame(frameId);
  }, [activeThemeId]);

  // Persist collapsed sections
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedSections));
  }, [collapsedSections, hasLoadedPreferences]);

  // Persist sidebar width
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [hasLoadedPreferences, sidebarWidth]);

  // Persist compact state
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(SIDEBAR_COMPACT_STORAGE_KEY, JSON.stringify(isSidebarCompact));
  }, [hasLoadedPreferences, isSidebarCompact]);

  // Sync CSS variable for sidebar width
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth}px`
    );
  }, [isSidebarCompact, sidebarWidth]);

  // Teardown resize listeners on unmount
  useEffect(() => () => { teardownResizeRef.current?.(); }, []);

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
      const handleMove = (e: MouseEvent) => setSidebarWidth(clampSidebarWidth(initialWidth + (e.clientX - startX)));
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
    [isSidebarCompact, sidebarWidth]
  );

  // Note actions
  const handleCreateNote = async () => {
    const noteId = await createNoteAction();
    router.push(`/notes/${noteId}`);
  };

  const handleCreateFolder = async () => {
    const folderName = window.prompt("Klasör adı", "Yeni Klasör")?.trim();
    if (!folderName) return;
    const folderId = await createFolderAction({ name: folderName });
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
    async (folderId: string, placement: { parentId?: string | null; afterFolderId?: string | null }) => {
      await relocateFolderAction(folderId, placement);
      setFolderDropTarget(null);
      setDraggedFolderId(null);
      router.refresh();
    },
    [router]
  );

  // Context menus
  const buildNoteMenu = useCallback(
    (note: { id: string; title: string; isPinned?: boolean }): ContextMenuItem[] => [
      { label: "Notu aç", hint: "Seçili notu düzenleyicide aç", onSelect: () => router.push(`/notes/${note.id}`) },
      {
        label: note.isPinned ? "Sabitlemeyi kaldır" : "Sabitle",
        hint: "Notu sıralı listelerde üstte tut veya bırak",
        onSelect: async () => { await updateNoteAction(note.id, { isPinned: !note.isPinned }); router.refresh(); },
      },
      { label: "Yukarı taşı", hint: "Not sırasını bir adım yukarı al", onSelect: async () => { await moveNoteAction(note.id, "up"); router.refresh(); } },
      { label: "Aşağı taşı", hint: "Not sırasını bir adım aşağı al", onSelect: async () => { await moveNoteAction(note.id, "down"); router.refresh(); } },
      { label: "Not bağlantısını kopyala", hint: "Dahili not adresini panoya kopyala", onSelect: () => copyInternalLink(`/notes/${note.id}`) },
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
    [copyInternalLink, currentNoteId, router]
  );

  const buildFolderMenu = useCallback(
    (folder: { id: string; name: string }): ContextMenuItem[] => [
      { label: "Klasörü aç", hint: "Klasördeki notları görüntüle", onSelect: () => router.push(`/folders/${folder.id}`) },
      { label: "Bu klasöre not oluştur", hint: "Yeni notu doğrudan bu klasöre ekle", onSelect: async () => { const noteId = await createNoteAction({ folderId: folder.id }); router.push(`/notes/${noteId}`); } },
      { label: "Klasör bağlantısını kopyala", hint: "Klasör adresini panoya kopyala", onSelect: () => copyInternalLink(`/folders/${folder.id}`) },
      { label: "Yukarı taşı", hint: "Klasör sırasını bir adım yukarı al", onSelect: () => handleMoveFolder(folder.id, "up") },
      { label: "Aşağı taşı", hint: "Klasör sırasını bir adım aşağı al", onSelect: () => handleMoveFolder(folder.id, "down") },
    ],
    [copyInternalLink, handleMoveFolder, router]
  );

  const footerMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      { label: "Tercihleri sıfırla", hint: "Tema ve sidebar tercihlerini varsayılana al", onSelect: resetPreferences },
      { label: "Çıkış yap", hint: "Oturumu kapat", tone: "danger" as const, onSelect: () => void signOutAction() },
    ],
    [resetPreferences]
  );

  // Derived / filtered data
  const flattenedFolders = useMemo(() => flattenFolderTree(folders), [folders]);

  const filteredFolders = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return q ? filterFolderTree(folders, q) : folders;
  }, [folders, paletteQuery]);

  const filteredTags = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    const source = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags.slice(0, 8);
    return source.slice(0, 10);
  }, [paletteQuery, tags]);

  const deferredSearchQuery = useDeferredValue(paletteQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  const filteredNotes = useMemo(() => {
    const source = hasQuery ? notes.filter((n) => n.title.toLowerCase().includes(normalizedQuery)) : notes.slice(0, 8);
    return source.slice(0, hasQuery ? 12 : 8);
  }, [hasQuery, normalizedQuery, notes]);

  const commandMatch = useMemo(() => {
    if (filteredNotes.length > 0) return { type: "note" as const, label: filteredNotes[0].title, href: `/notes/${filteredNotes[0].id}` };
    const firstFolderId = getFirstFolderId(filteredFolders);
    if (firstFolderId) {
      const folder = findFolderById(filteredFolders, firstFolderId);
      if (folder) return { type: "folder" as const, label: folder.name, href: `/folders/${folder.id}` };
    }
    if (filteredTags.length > 0) return { type: "tag" as const, label: `#${filteredTags[0].name}`, href: `/tags/${filteredTags[0].name}` };
    return null;
  }, [filteredFolders, filteredNotes, filteredTags]);

  // Palette items
  const paletteItems = useMemo<CommandPaletteItem[]>(() => {
    const actionItems: CommandPaletteItem[] = [
      { id: "action-new-note", group: "Hızlı işlemler", title: "Yeni not oluştur", description: "Boş bir not aç", icon: "+", hint: "Enter", onSelect: async () => { const id = await createNoteAction(); router.push(`/notes/${id}`); } },
      { id: "action-new-folder", group: "Hızlı işlemler", title: "Yeni klasör oluştur", description: "Çalışma alanına yeni klasör ekle", icon: "K", onSelect: async () => { const name = window.prompt("Klasör adı", "Yeni Klasör")?.trim(); if (!name) return; const id = await createFolderAction({ name }); router.push(`/folders/${id}`); } },
      { id: "action-template-note", group: "Hızlı işlemler", title: "Şablondan not oluştur", description: "Şablon seçiciyi aç", icon: "T", onSelect: async () => { setTemplatePickerOpenSignal((v) => v + 1); } },
      { id: "action-dashboard", group: "Geçişler", title: "Panoya git", description: "Ana çalışma alanı görünümü", icon: "Ana", onSelect: async () => { router.push("/dashboard"); } },
      { id: "action-graph", group: "Geçişler", title: "Bağlantı ağına git", description: "Not grafiği görünümü", icon: "Ağ", onSelect: async () => { router.push("/graph"); } },
      { id: "action-inbox", group: "Geçişler", title: "Gelen kutusuna git", description: "Klasörsüz notları aç", icon: "In", onSelect: async () => { router.push("/inbox"); } },
      { id: "action-search", group: "Geçişler", title: "Arama çalışma alanını aç", description: "Filtreli arama sayfası", icon: "Ara", onSelect: async () => { router.push("/search"); } },
      { id: "action-templates", group: "Geçişler", title: "Şablon kütüphanesi", description: "Şablon yönetim alanını aç", icon: "Tpl", onSelect: async () => { router.push("/templates"); } },
      { id: "action-publish", group: "Geçişler", title: "Yayın alanı", description: "Yayımdaki notları ve dışa aktarımları gör", icon: "Yay", onSelect: async () => { router.push("/publish"); } },
      { id: "action-proposals", group: "Geçişler", title: "Öneri kuyruğu", description: "YZ öneri inceleme alanını aç", icon: "YZ", onSelect: async () => { router.push("/proposals"); } },
      { id: "action-settings", group: "Geçişler", title: "Ayarlar", description: "Tema, yerel kuyruk ve tercihleri aç", icon: "Ay", onSelect: async () => { router.push("/settings"); } },
      { id: "action-account", group: "Geçişler", title: "Hesap", description: "Profil ve şifre işlemleri", icon: "Hs", onSelect: async () => { router.push("/account"); } },
    ];

    const noteItems = notes
      .filter((n) => !normalizedPaletteQuery || n.title.toLowerCase().includes(normalizedPaletteQuery))
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((n) => ({ id: `note-${n.id}`, group: "Notlar", title: n.title, description: "Notu düzenleyicide aç", icon: n.icon ?? "Not", onSelect: async () => { router.push(`/notes/${n.id}`); } }));

    const folderItems = flattenedFolders
      .filter((f) => !normalizedPaletteQuery || f.name.toLowerCase().includes(normalizedPaletteQuery))
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((f) => ({ id: `folder-${f.id}`, group: "Klasörler", title: f.name, description: "Klasör görünümünü aç", icon: f.icon ?? "Kls", onSelect: async () => { router.push(`/folders/${f.id}`); } }));

    const tagItems = tags
      .filter((t) => !normalizedPaletteQuery || t.name.toLowerCase().includes(normalizedPaletteQuery))
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((t) => ({ id: `tag-${t.id}`, group: "Etiketler", title: `#${t.name}`, description: `${t.noteCount} not içeren etiket`, icon: "#", onSelect: async () => { router.push(`/tags/${t.name}`); } }));

    const templateItems = templates
      .filter((t) => !normalizedPaletteQuery || `${t.name} ${t.description ?? ""}`.toLowerCase().includes(normalizedPaletteQuery))
      .slice(0, normalizedPaletteQuery ? 6 : 4)
      .map<CommandPaletteItem>((t) => ({ id: `template-${t.id}`, group: "Şablonlar", title: t.name, description: t.description ?? `${getTemplateCategoryLabel(t.category)} şablonu`, icon: t.icon ?? "Tpl", onSelect: async () => { router.push(`/templates?selected=${t.id}`); } }));

    if (!normalizedPaletteQuery) return [...actionItems, ...noteItems, ...folderItems, ...tagItems, ...templateItems];

    const filteredActions = actionItems.filter((item) =>
      `${item.title} ${item.description}`.toLowerCase().includes(normalizedPaletteQuery)
    );
    return [...filteredActions, ...noteItems, ...folderItems, ...tagItems, ...templateItems];
  }, [flattenedFolders, normalizedPaletteQuery, notes, router, tags, templates]);

  const activeTheme = useMemo(
    () => APP_THEMES.find((t) => t.id === activeThemeId) ?? APP_THEMES[0],
    [activeThemeId]
  );

  const isFoldersCollapsed = hasQuery ? false : collapsedSections.folders;
  const isTagsCollapsed = hasQuery ? false : collapsedSections.tags;
  const isRecentNotesCollapsed = hasQuery ? false : collapsedSections.recentNotes;

  // Suppress unused variable warnings for commandMatch / activeTheme (used in future features)
  void commandMatch;
  void activeTheme;
  void applyTheme;

  return (
    <aside
      className={`md-nav-drawer md-nav-drawer--giraffle-sidebar sidebar${isSidebarCompact ? " md-nav-drawer--compact compact" : ""}${isSidebarResizing ? " md-nav-drawer--resizing" : ""}`}
      style={{
        width: isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth,
        transition: isSidebarResizing ? "none" : "width var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard)",
      }}
    >
      {isSidebarCompact ? (
        <div className="sidebar-compact-shell">
          <div className="sidebar-compact-stack">
            <button type="button" className="sidebar-compact-button sidebar-compact-brand" onClick={toggleSidebarCompact} aria-label="Sidebarı genişlet">
              <Image src="/apple-icon.png" alt="Giraffle" width={24} height={24} />
            </button>
            <button type="button" className="sidebar-compact-button" onClick={() => openPalette()} aria-label="Komut paletini aç">
              <span className="material-symbols-outlined sm" aria-hidden="true">&#xE8B6;</span>
            </button>
            <button type="button" className="sidebar-compact-button" onClick={handleCreateNote} aria-label="Yeni not oluştur">+</button>
            <button type="button" className={`sidebar-compact-button ${pathname === "/graph" ? "active" : ""}`} onClick={() => router.push("/graph")} aria-label="Bağlantı ağına git">
              <span className="material-symbols-outlined sm" aria-hidden="true">&#xF1E2;</span>
            </button>
          </div>
          <div className="sidebar-compact-footer">
            <button type="button" className="sidebar-compact-avatar" onClick={(e) => openContextMenuFromTrigger(e, footerMenuItems)} aria-label="Hesap menüsü">
              {(user.name ?? user.email ?? "G").slice(0, 1).toUpperCase()}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="sidebar-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px 8px" }}>
            <div className="sidebar-workspace-card" onClick={() => router.push("/dashboard")} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <div className="sidebar-workspace-logo" style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: "var(--md-sys-shape-small)" }}>
                <Image src="/apple-icon.png" alt="Giraffle" width={28} height={28} />
              </div>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--md-sys-color-on-surface)" }}>Giraffle</span>
            </div>
            <div style={{ display: "flex", gap: "2px" }}>
              <Button variant="text" icon onClick={handleCreateNote} aria-label="Yeni not oluştur"><PlusIcon /></Button>
              <Button variant="text" icon onClick={toggleSidebarCompact} aria-label="Sidebarı daralt"><ChevronLeftIcon /></Button>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: "0 10px 8px" }}>
            <button
              type="button"
              className="sidebar-search-trigger"
              onClick={() => openPalette()}
              aria-label="Arama veya komut paleti"
            >
              <span style={{ fontSize: "14px", opacity: 0.5 }}>○</span>
              <span style={{ flex: 1, textAlign: "left", fontSize: "12px" }}>Ara veya komut çalıştır...</span>
              <kbd className="sidebar-search-kbd">⌘K</kbd>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="md-nav-drawer-content" style={{ padding: "0 8px" }}>
            {/* Primary nav */}
            <div className="sidebar-primary-nav">
              {([
                { path: "/dashboard", icon: "\uE88A", label: "Pano", info: `${notes.length} not · ${templates.length} şablon`, actions: [{ label: "Yeni not", onClick: () => void handleCreateNote(), primary: true }, { label: "Şablondan oluştur", onClick: () => setTemplatePickerOpenSignal((s) => s + 1) }] },
                { path: "/inbox", icon: "\uE156", label: "Gelen kutusu", info: `${notes.filter((n) => !n.folderId).length} klasörsüz not`, actions: [{ label: "Yeni not", onClick: () => void handleCreateNote(), primary: true }, { label: "Şablondan oluştur", onClick: () => setTemplatePickerOpenSignal((s) => s + 1) }] },
                { path: "/graph", icon: "\uF1E2", label: "Bağlantı ağı", info: "Notlar arasındaki wikilink projeksiyonu" },
              ] as Array<{ path: string; icon: string; label: string; info: string; actions?: Array<{ label: string; onClick: () => void; primary?: boolean }> }>).map(({ path, icon, label, info, actions }) => (
                <div key={path} className="sidebar-nav-item-row">
                  <button className={`sidebar-item${pathname === path ? " active" : ""}`} onClick={() => { closeNavModal(); router.push(path); }}>
                    <span className="sidebar-item-icon" aria-hidden="true">
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", lineHeight: 1 }}>{icon}</span>
                    </span>
                    <span className="sidebar-item-label">{label}</span>
                  </button>
                  <button type="button" className={`sidebar-nav-menu${navModal?.key === path ? " active" : ""}`} onClick={(e) => openNavModal(path, label, e, { info, actions })} aria-label={`${label} menüsü`}>···</button>
                </div>
              ))}
            </div>

            <div className="sidebar-divider" />

            {/* Folders */}
            <SidebarGroup label="Klasörler" collapsed={isFoldersCollapsed} onToggle={() => toggleSection("folders")} onAdd={handleCreateFolder}>
              <div className="sidebar-folder-tree">
                {draggedFolderId ? (
                  <div
                    className={`sidebar-folder-dropzone root${folderDropTarget?.folderId === "__root__" ? " active" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setFolderDropTarget({ folderId: "__root__", mode: "after" }); }}
                    onDrop={(e) => { e.preventDefault(); if (draggedFolderId) void handleRelocateFolder(draggedFolderId, { parentId: null, afterFolderId: null }); }}
                  >
                    Kök&apos;e taşı
                  </div>
                ) : null}
                {filteredFolders.length === 0 ? (
                  <div className="sidebar-empty">{hasQuery ? "Eşleşen klasör yok." : "Henüz klasör yok."}</div>
                ) : filteredFolders.map((folder) => (
                  <SidebarFolderItem
                    key={folder.id}
                    folder={folder}
                    pathname={pathname}
                    onOpen={(id) => router.push(`/folders/${id}`)}
                    onMoveFolder={handleMoveFolder}
                    onRelocateFolder={handleRelocateFolder}
                    onQuickCreate={handleCreateNoteInFolder}
                    onContextMenuOpen={(e, f) => openContextMenuAtPointer(e, buildFolderMenu(f))}
                    onTriggerMenuOpen={(e, f) => openContextMenuFromTrigger(e, buildFolderMenu(f))}
                    draggedFolderId={draggedFolderId}
                    folderDropTarget={folderDropTarget}
                    onDragFolderChange={setDraggedFolderId}
                    onDropTargetChange={setFolderDropTarget}
                  />
                ))}
              </div>
            </SidebarGroup>

            {/* Tags */}
            <SidebarGroup label="Etiketler" collapsed={isTagsCollapsed} onToggle={() => toggleSection("tags")}>
              <div className="sidebar-tag-list">
                {filteredTags.length === 0 ? (
                  <div className="sidebar-empty">{hasQuery ? "Eşleşen etiket yok." : "Henüz indekslenmiş etiket yok."}</div>
                ) : filteredTags.map((tag) => (
                  <button key={tag.id} className={`sidebar-item sidebar-tag-item${pathname === `/tags/${tag.name}` ? " active" : ""}`} onClick={() => router.push(`/tags/${tag.name}`)}>
                    <span className="sidebar-item-label">#{tag.name}</span>
                  </button>
                ))}
              </div>
            </SidebarGroup>

            {/* Recent notes */}
            <SidebarGroup label={hasQuery ? "Not eşleşmeleri" : "Son notlar"} collapsed={isRecentNotesCollapsed} onToggle={() => toggleSection("recentNotes")}>
              <nav className="sidebar-nav">
                {filteredNotes.length === 0 ? (
                  <div className="sidebar-empty">{hasQuery ? "Eşleşen not yok." : "Henüz not yok. İlk notunu oluştur."}</div>
                ) : filteredNotes.map((note) => (
                  <SidebarNoteRow
                    key={note.id}
                    note={note}
                    active={note.id === currentNoteId}
                    onOpen={(id) => router.push(`/notes/${id}`)}
                    onContextMenuOpen={(e, n) => openContextMenuAtPointer(e, buildNoteMenu(n))}
                    onTriggerMenuOpen={(e, n) => openContextMenuFromTrigger(e, buildNoteMenu(n))}
                  />
                ))}
              </nav>
            </SidebarGroup>
          </div>

          {/* Secondary nav rail */}
          <nav className="sidebar-rail" aria-label="İkincil gezinme">
            {([
              { path: "/search", icon: "\uE8B6", label: "Arama" },
              { path: "/templates", icon: "\uE02F", label: "Şablonlar" },
              { path: "/publish", icon: "\uE255", label: "Yayın" },
              { path: "/proposals", icon: "\uE65F", label: "Öneriler" },
              { path: "/settings", icon: "\uE8B8", label: "Ayarlar" },
              { path: "/account", icon: "\uF20B", label: "Hesap" },
            ]).map(({ path, icon, label }) => (
              <button key={path} type="button" className={`sidebar-item sidebar-rail-item${pathname === path || pathname.startsWith(path + "/") ? " active" : ""}`} onClick={() => router.push(path)} aria-label={label}>
                <span className="sidebar-item-icon" aria-hidden="true">
                  <span className="material-symbols-outlined" style={{ fontSize: "16px", lineHeight: 1 }}>{icon}</span>
                </span>
                <span className="sidebar-item-label">{label}</span>
                <span className="sidebar-rail-chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div className="md-nav-drawer-footer sidebar-footer">
            <div className="sidebar-user-meta">
              <div style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "var(--md-sys-shape-full)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--md-sys-color-surface-variant)", color: "var(--md-sys-color-on-surface-variant)", fontWeight: 700, fontSize: "12px" }}>
                {(user.name ?? user.email ?? "G").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--md-sys-color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name ?? user.email ?? "Giraffle Kullanıcı"}
                </div>
                {user.email ? (
                  <div style={{ fontSize: "11px", color: "var(--md-sys-color-on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.email}
                  </div>
                ) : null}
              </div>
            </div>
            <Button variant="text" icon className="sidebar-footer-menu" onClick={(e) => openContextMenuFromTrigger(e, footerMenuItems)} aria-label="Hesap ve tema menüsü">
              <MoreHorizontalIcon />
            </Button>
          </div>
        </>
      )}

      {/* Template picker (hidden trigger) */}
      <div className="sidebar-template-host" aria-hidden="true">
        <TemplatePicker templates={templates} buttonLabel="Şablon" buttonClassName="sidebar-template-host-button" openSignal={templatePickerOpenSignal} />
      </div>

      {!isSidebarCompact ? (
        <div className="sidebar-resize-handle" onMouseDown={handleSidebarResizeStart} role="separator" aria-orientation="vertical" aria-label="Sidebar genişliğini değiştir" />
      ) : null}

      <ContextMenu items={contextMenu?.items ?? []} position={contextMenu?.position ?? null} onClose={closeContextMenu} />
      <CommandPalette open={isPaletteOpen} query={paletteQuery} items={paletteItems} onQueryChange={setPaletteQuery} onClose={closePalette} />

      {navModal ? (
        <div className="sidebar-nav-modal-overlay" onClick={closeNavModal}>
          <div className="sidebar-nav-modal" style={{ left: navModal.x, top: navModal.y }} onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-nav-modal-header">
              <div className="sidebar-nav-modal-title">{navModal.label}</div>
              {navModal.info ? <div className="sidebar-nav-modal-desc">{navModal.info}</div> : null}
            </div>
            <div className="sidebar-nav-modal-body">
              {navModal.actions?.map((action) => (
                <button key={action.label} type="button" className={`sidebar-nav-modal-btn${action.primary ? " primary" : ""}`} onClick={() => { action.onClick(); closeNavModal(); }}>
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
