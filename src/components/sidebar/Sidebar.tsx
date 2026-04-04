"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { createFolderAction } from "@/server/api/folders";
import { archiveNoteAction, createNoteAction } from "@/server/api/notes";
import type { TemplateVariable } from "@/domain/template/template.types";

interface SidebarNote {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: Date;
}

interface SidebarFolder {
  id: string;
  name: string;
  icon: string | null;
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
  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [activeThemeId, setActiveThemeId] =
    useState<AppThemeId>(DEFAULT_APP_THEME);

  const currentNoteId =
    activeNoteId ?? extractActiveNoteId(pathname) ?? undefined;
  const recentNotes = notes.slice(0, 8);
  const visibleTags = tags.slice(0, 8);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
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

  const activeTheme = useMemo(
    () =>
      APP_THEMES.find((theme) => theme.id === activeThemeId) ?? APP_THEMES[0],
    [activeThemeId]
  );

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

  const buildNoteMenu = useCallback(
    (sidebarNote: SidebarNote): ContextMenuItem[] => [
      {
        label: "Notu ac",
        hint: "Secili notu duzenleyicide ac",
        onSelect: () => router.push(`/notes/${sidebarNote.id}`),
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
    ],
    [copyInternalLink, router]
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

  return (
    <aside className="sidebar">
      <div className="sidebar-topbar">
        <button
          type="button"
          className="sidebar-workspace-card"
          onClick={() => router.push("/dashboard")}
        >
          <span className="sidebar-workspace-logo">G</span>
          <span className="sidebar-workspace-copy">
            <span className="sidebar-workspace-name">Graffle</span>
            <span className="sidebar-workspace-meta">Kisisel bilgi alani</span>
          </span>
        </button>
        <button
          type="button"
          className="sidebar-quick-create"
          onClick={handleCreateNote}
          aria-label="Yeni not olustur"
        >
          +
        </button>
      </div>

      <div className="sidebar-inline-actions">
        <TemplatePicker
          templates={templates}
          buttonLabel="Sablon"
          buttonClassName="sidebar-inline-action"
        />
        <button
          type="button"
          className="sidebar-inline-action"
          onClick={handleCreateFolder}
        >
          Klasor
        </button>
      </div>

      <div className="sidebar-section">
        <section className="sidebar-group">
          <div className="sidebar-group-head">
            <span className="sidebar-group-label">Calisma alani</span>
          </div>
          <nav className="sidebar-nav">
            <button
              className={`sidebar-item ${pathname === "/dashboard" ? "active" : ""}`}
              onClick={() => router.push("/dashboard")}
            >
              <span className="sidebar-item-icon">Ana</span>
              <span className="sidebar-item-label">Pano</span>
            </button>
            <button
              className={`sidebar-item ${pathname === "/graph" ? "active" : ""}`}
              onClick={() => router.push("/graph")}
            >
              <span className="sidebar-item-icon">Ag</span>
              <span className="sidebar-item-label">Baglanti agi</span>
            </button>
          </nav>
        </section>

        <section className="sidebar-group">
          <div className="sidebar-group-head">
            <span className="sidebar-group-label">Klasorler</span>
            <span className="sidebar-group-meta">{folders.length}</span>
          </div>
          <div className="sidebar-folder-tree">
            {folders.length === 0 ? (
              <div className="sidebar-empty">Henuz klasor yok.</div>
            ) : (
              folders.map((folder) => (
                <SidebarFolderItem
                  key={folder.id}
                  folder={folder}
                  pathname={pathname}
                  onOpen={(folderId) => router.push(`/folders/${folderId}`)}
                  onContextMenuOpen={(event, currentFolder) =>
                    openContextMenuAtPointer(event, buildFolderMenu(currentFolder))
                  }
                  onTriggerMenuOpen={(event, currentFolder) =>
                    openContextMenuFromTrigger(event, buildFolderMenu(currentFolder))
                  }
                />
              ))
            )}
          </div>
        </section>

        <section className="sidebar-group">
          <div className="sidebar-group-head">
            <span className="sidebar-group-label">Etiketler</span>
            <span className="sidebar-group-meta">{tags.length}</span>
          </div>
          <div className="sidebar-tag-list">
            {tags.length === 0 ? (
              <div className="sidebar-empty">Henuz indekslenmis etiket yok.</div>
            ) : (
              visibleTags.map((tag) => (
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
        </section>

        <section className="sidebar-group">
          <div className="sidebar-group-head">
            <span className="sidebar-group-label">Son notlar</span>
            <span className="sidebar-group-meta">{notes.length}</span>
          </div>
          <nav className="sidebar-nav">
            {notes.length === 0 ? (
              <div className="sidebar-empty">Henuz not yok. Ilk notunu olustur.</div>
            ) : (
              recentNotes.map((sidebarNote) => (
                <SidebarNoteRow
                  key={sidebarNote.id}
                  note={sidebarNote}
                  active={sidebarNote.id === currentNoteId}
                  onOpen={(noteId) => router.push(`/notes/${noteId}`)}
                  onContextMenuOpen={(event, currentNote) =>
                    openContextMenuAtPointer(event, buildNoteMenu(currentNote))
                  }
                  onTriggerMenuOpen={(event, currentNote) =>
                    openContextMenuFromTrigger(event, buildNoteMenu(currentNote))
                  }
                />
              ))
            )}
          </nav>
        </section>
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

      <ContextMenu
        items={contextMenu?.items ?? []}
        position={contextMenu?.position ?? null}
        onClose={closeContextMenu}
      />
    </aside>
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
        <span className="sidebar-item-label">{note.title}</span>
      </button>
      <button
        type="button"
        className="context-trigger sidebar-row-trigger"
        onClick={(event) => onTriggerMenuOpen(event, note)}
        aria-label={`${note.title} menusunu ac`}
      >
        ...
      </button>
    </div>
  );
}

function SidebarFolderItem({
  folder,
  pathname,
  onOpen,
  onContextMenuOpen,
  onTriggerMenuOpen,
  depth = 0,
}: {
  folder: SidebarFolder;
  pathname: string;
  onOpen: (folderId: string) => void;
  onContextMenuOpen: (
    event: ReactMouseEvent<HTMLElement>,
    folder: SidebarFolder
  ) => void;
  onTriggerMenuOpen: (
    event: ReactMouseEvent<HTMLButtonElement>,
    folder: SidebarFolder
  ) => void;
  depth?: number;
}) {
  const isActive = pathname === `/folders/${folder.id}`;

  return (
    <div className="sidebar-folder-node">
      <div className={`sidebar-entity-row ${isActive ? "active" : ""}`}>
        <button
          type="button"
          className={`sidebar-item sidebar-row-main ${isActive ? "active" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => onOpen(folder.id)}
          onContextMenu={(event) => onContextMenuOpen(event, folder)}
        >
          <span className="sidebar-item-icon">{folder.icon ?? "Kls"}</span>
          <span className="sidebar-item-label">{folder.name}</span>
          <span className="sidebar-folder-count">{folder._count?.notes ?? 0}</span>
        </button>
        <button
          type="button"
          className="context-trigger sidebar-row-trigger"
          onClick={(event) => onTriggerMenuOpen(event, folder)}
          aria-label={`${folder.name} menusunu ac`}
        >
          ...
        </button>
      </div>

      {(folder.children ?? []).length > 0 ? (
        <div className="sidebar-folder-children">
          {(folder.children ?? []).map((childFolder) => (
            <SidebarFolderItem
              key={childFolder.id}
              folder={childFolder}
              pathname={pathname}
              onOpen={onOpen}
              onContextMenuOpen={onContextMenuOpen}
              onTriggerMenuOpen={onTriggerMenuOpen}
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
