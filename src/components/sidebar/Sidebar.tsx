"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
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
  const recentNotes = notes.slice(0, 7);
  const visibleTags = tags.slice(0, 6);

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

  const buildNoteMenu = useCallback(
    (sidebarNote: SidebarNote): ContextMenuItem[] => [
      {
        label: "Notu Aç",
        hint: "Seçili notu düzenleyicide aç",
        onSelect: () => router.push(`/notes/${sidebarNote.id}`),
      },
      {
        label: "Not Bağlantısını Kopyala",
        hint: "Dahili not adresini panoya kopyala",
        onSelect: () => copyInternalLink(`/notes/${sidebarNote.id}`),
      },
      {
        label: "Arşive Taşı",
        hint: "Notu aktif listelerden kaldır",
        tone: "danger",
        onSelect: async () => {
          await archiveNoteAction(sidebarNote.id);
          if (activeNoteId === sidebarNote.id) {
            router.push("/dashboard");
          }
        },
      },
    ],
    [activeNoteId, copyInternalLink, router]
  );

  const buildFolderMenu = useCallback(
    (folder: SidebarFolder): ContextMenuItem[] => [
      {
        label: "Klasörü Aç",
        hint: "Klasördeki notları görüntüle",
        onSelect: () => router.push(`/folders/${folder.id}`),
      },
      {
        label: "Bu Klasöre Not Oluştur",
        hint: "Yeni notu doğrudan bu klasöre ekle",
        onSelect: async () => {
          const noteId = await createNoteAction({ folderId: folder.id });
          router.push(`/notes/${noteId}`);
        },
      },
      {
        label: "Klasör Bağlantısını Kopyala",
        hint: "Klasör adresini panoya kopyala",
        onSelect: () => copyInternalLink(`/folders/${folder.id}`),
      },
    ],
    [copyInternalLink, router]
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">G</span>
          <div className="sidebar-logo-copy">
            <span className="sidebar-logo-text">Graffle</span>
            <span className="sidebar-logo-subtitle">Kişisel bilgi ağı</span>
          </div>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-new-note" onClick={handleCreateNote}>
          <span className="sidebar-new-icon">+</span>
          <span>Yeni Not</span>
        </button>
        <TemplatePicker
          templates={templates}
          buttonLabel="Şablon Kullan"
          buttonClassName="sidebar-secondary-action"
        />
        <button className="sidebar-secondary-action" onClick={handleCreateFolder}>
          Yeni Klasör
        </button>
      </div>

      <div className="sidebar-overview">
        <div className="sidebar-overview-card">
          <div className="sidebar-overview-eyebrow">Çalışma Alanı</div>
          <div className="sidebar-overview-title">Yerel bilgi ağın hazır</div>
          <div className="sidebar-overview-meta">
            {notes.length} not · {folders.length} klasör · {tags.length} etiket
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <section className="sidebar-panel">
          <div className="sidebar-panel-head">
            <div className="sidebar-panel-title">Gezin</div>
            <div className="sidebar-panel-meta">Hızlı erişim</div>
          </div>
          <nav className="sidebar-nav">
            <button
              className={`sidebar-note-item ${
                pathname === "/dashboard" ? "active" : ""
              }`}
              onClick={() => router.push("/dashboard")}
            >
              <span className="sidebar-note-icon">Ana</span>
              <span className="sidebar-note-title">Pano</span>
            </button>
            <button
              className={`sidebar-note-item ${pathname === "/graph" ? "active" : ""}`}
              onClick={() => router.push("/graph")}
            >
              <span className="sidebar-note-icon">Ağ</span>
              <span className="sidebar-note-title">Bağlantı Ağı</span>
            </button>
          </nav>
        </section>

        <section className="sidebar-panel">
          <div className="sidebar-panel-head">
            <div className="sidebar-panel-title">Klasörler</div>
            <div className="sidebar-panel-meta">{folders.length}</div>
          </div>
          <div className="sidebar-folder-tree">
            {folders.length === 0 ? (
              <div className="sidebar-empty">Henüz klasör yok.</div>
            ) : (
              folders.map((folder) => (
                <SidebarFolderItem
                  key={folder.id}
                  folder={folder}
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

        <section className="sidebar-panel">
          <div className="sidebar-panel-head">
            <div className="sidebar-panel-title">Etiketler</div>
            <div className="sidebar-panel-meta">{tags.length}</div>
          </div>
          <div className="sidebar-tag-list">
            {tags.length === 0 ? (
              <div className="sidebar-empty">Henüz indekslenmiş etiket yok.</div>
            ) : (
              visibleTags.map((tag) => (
                <button
                  key={tag.id}
                  className="sidebar-tag-pill"
                  onClick={() => router.push(`/tags/${tag.name}`)}
                >
                  <span>#{tag.name}</span>
                  <span>{tag.noteCount}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="sidebar-panel">
          <div className="sidebar-panel-head">
            <div className="sidebar-panel-title">Son Notlar</div>
            <div className="sidebar-panel-meta">{notes.length}</div>
          </div>
          <nav className="sidebar-nav">
            {notes.length === 0 ? (
              <div className="sidebar-empty">
                Henüz not yok. İlk notunu oluştur.
              </div>
            ) : (
              recentNotes.map((sidebarNote) => (
                <SidebarNoteRow
                  key={sidebarNote.id}
                  note={sidebarNote}
                  active={sidebarNote.id === activeNoteId}
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
          <div className="sidebar-user-name">
            {user.name ?? user.email ?? "Graffle Kullanıcısı"}
          </div>
          {user.email ? (
            <div className="sidebar-user-email">{user.email}</div>
          ) : null}
        </div>

        <form action={signOutAction}>
          <button type="submit" className="sidebar-sign-out">
            Çıkış Yap
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
        className={`sidebar-note-item sidebar-row-main ${active ? "active" : ""}`}
        onClick={() => onOpen(note.id)}
        onContextMenu={(event) => onContextMenuOpen(event, note)}
      >
        <span className="sidebar-note-icon">{note.icon ?? "Not"}</span>
        <span className="sidebar-note-title">{note.title}</span>
      </button>
      <button
        type="button"
        className="context-trigger sidebar-row-trigger"
        onClick={(event) => onTriggerMenuOpen(event, note)}
        aria-label={`${note.title} menüsünü aç`}
      >
        •••
      </button>
    </div>
  );
}

function SidebarFolderItem({
  folder,
  onOpen,
  onContextMenuOpen,
  onTriggerMenuOpen,
  depth = 0,
}: {
  folder: SidebarFolder;
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
  return (
    <div className="sidebar-folder-node">
      <div className="sidebar-entity-row">
        <button
          type="button"
          className="sidebar-folder-item sidebar-row-main"
          style={{ paddingLeft: `${16 + depth * 14}px` }}
          onClick={() => onOpen(folder.id)}
          onContextMenu={(event) => onContextMenuOpen(event, folder)}
        >
          <span className="sidebar-note-icon">{folder.icon ?? "Kls"}</span>
          <span className="sidebar-note-title">{folder.name}</span>
          <span className="sidebar-folder-count">{folder._count?.notes ?? 0}</span>
        </button>
        <button
          type="button"
          className="context-trigger sidebar-row-trigger"
          onClick={(event) => onTriggerMenuOpen(event, folder)}
          aria-label={`${folder.name} menüsünü aç`}
        >
          •••
        </button>
      </div>

      {(folder.children ?? []).length > 0 ? (
        <div className="sidebar-folder-children">
          {(folder.children ?? []).map((childFolder) => (
            <SidebarFolderItem
              key={childFolder.id}
              folder={childFolder}
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
