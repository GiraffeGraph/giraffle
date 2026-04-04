"use client";

import { useRouter } from "next/navigation";
import { signOutAction } from "@/server/api/auth";
import { createFolderAction } from "@/server/api/folders";
import { createNoteAction } from "@/server/api/notes";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
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

export function Sidebar({
  notes,
  folders,
  templates,
  tags,
  user,
  activeNoteId,
}: SidebarProps) {
  const router = useRouter();

  const handleCreateNote = async () => {
    const noteId = await createNoteAction();
    router.push(`/notes/${noteId}`);
  };

  const handleCreateFolder = async () => {
    const folderName = window.prompt("Folder name", "New Folder")?.trim();

    if (!folderName) {
      return;
    }

    const folderId = await createFolderAction({
      name: folderName,
    });

    router.push(`/folders/${folderId}`);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🦒</span>
          <span className="sidebar-logo-text">Graffle</span>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-new-note" onClick={handleCreateNote}>
          <span className="sidebar-new-icon">+</span>
          <span>New Note</span>
        </button>
        <TemplatePicker
          templates={templates}
          buttonLabel="Use Template"
          buttonClassName="sidebar-secondary-action"
        />
        <button className="sidebar-secondary-action" onClick={handleCreateFolder}>
          New Folder
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Workspace</div>
        <nav className="sidebar-nav">
          <button
            className="sidebar-note-item"
            onClick={() => router.push("/dashboard")}
          >
            <span className="sidebar-note-icon">Home</span>
            <span className="sidebar-note-title">Dashboard</span>
          </button>
          <button
            className="sidebar-note-item"
            onClick={() => router.push("/graph")}
          >
            <span className="sidebar-note-icon">Graph</span>
            <span className="sidebar-note-title">Graph View</span>
          </button>
        </nav>

        <div className="sidebar-section-title">Folders</div>
        <div className="sidebar-folder-tree">
          {folders.length === 0 ? (
            <div className="sidebar-empty">No folders yet.</div>
          ) : (
            folders.map((folder) => (
              <SidebarFolderItem
                key={folder.id}
                folder={folder}
                onOpen={(folderId) => router.push(`/folders/${folderId}`)}
              />
            ))
          )}
        </div>

        <div className="sidebar-section-title">Tags</div>
        <div className="sidebar-tag-list">
          {tags.length === 0 ? (
            <div className="sidebar-empty">No tags indexed yet.</div>
          ) : (
            tags.slice(0, 8).map((tag) => (
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

        <div className="sidebar-section-title">Recent Notes</div>
        <nav className="sidebar-nav">
          {notes.length === 0 ? (
            <div className="sidebar-empty">
              No notes yet. Create your first note.
            </div>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                className={`sidebar-note-item ${
                  note.id === activeNoteId ? "active" : ""
                }`}
                onClick={() => router.push(`/notes/${note.id}`)}
              >
                <span className="sidebar-note-icon">{note.icon ?? "Note"}</span>
                <span className="sidebar-note-title">{note.title}</span>
              </button>
            ))
          )}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div className="sidebar-user-name">
            {user.name ?? user.email ?? "Graffle User"}
          </div>
          {user.email ? (
            <div className="sidebar-user-email">{user.email}</div>
          ) : null}
        </div>

        <form action={signOutAction}>
          <button type="submit" className="sidebar-sign-out">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function SidebarFolderItem({
  folder,
  onOpen,
  depth = 0,
}: {
  folder: SidebarFolder;
  onOpen: (folderId: string) => void;
  depth?: number;
}) {
  return (
    <div className="sidebar-folder-node">
      <button
        className="sidebar-folder-item"
        style={{ paddingLeft: `${16 + depth * 14}px` }}
        onClick={() => onOpen(folder.id)}
      >
        <span className="sidebar-note-icon">{folder.icon ?? "Dir"}</span>
        <span className="sidebar-note-title">{folder.name}</span>
        <span className="sidebar-folder-count">{folder._count?.notes ?? 0}</span>
      </button>

      {(folder.children ?? []).length > 0 ? (
        <div className="sidebar-folder-children">
          {(folder.children ?? []).map((childFolder) => (
            <SidebarFolderItem
              key={childFolder.id}
              folder={childFolder}
              onOpen={onOpen}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
