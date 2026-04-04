"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import type { BacklinkResult } from "@/domain/link/link.types";
import { DEFAULT_NOTE_TITLE } from "@/domain/note/note.types";
import type { NoteReference, TiptapDocument } from "@/domain/note/note.types";
import {
  archiveNoteAction,
  createNoteFromWikilinkAction,
  findNoteByTitleAction,
  getNoteExportAction,
  saveNoteContentAction,
  searchNotesByTitleAction,
  updateNoteAction,
} from "@/server/api/notes";

interface NoteEditorPageProps {
  note: {
    id: string;
    title: string;
    icon: string | null;
    folderId: string | null;
    isPublished: boolean;
    tags: string[];
    document: TiptapDocument;
  };
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>;
  backlinks: BacklinkResult[];
}

export function NoteEditorPage({
  note,
  folders,
  backlinks,
}: NoteEditorPageProps) {
  const [title, setTitle] = useState(note.title);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    note.folderId
  );
  const [isPublished, setIsPublished] = useState(note.isPublished);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isExportPending, startExportTransition] = useTransition();
  const router = useRouter();

  const folderOptions = useMemo(
    () =>
      folders.map((folder) => ({
        id: folder.id,
        name: buildFolderLabel(folder, folders),
      })),
    [folders]
  );

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      setTitle(newTitle);
      await updateNoteAction(note.id, { title: newTitle || DEFAULT_NOTE_TITLE });
    },
    [note.id]
  );

  const handleFolderChange = useCallback(
    async (nextFolderId: string) => {
      const normalizedFolderId = nextFolderId || null;
      setCurrentFolderId(normalizedFolderId);
      await updateNoteAction(note.id, { folderId: normalizedFolderId });
    },
    [note.id]
  );

  const handlePublishToggle = useCallback(async () => {
    const nextValue = !isPublished;
    setIsPublished(nextValue);
    await updateNoteAction(note.id, { isPublished: nextValue });
  }, [isPublished, note.id]);

  const handleCopyExport = useCallback(
    (format: "markdown" | "mdx") => {
      startExportTransition(async () => {
        const content = await getNoteExportAction(note.id, format);
        await navigator.clipboard.writeText(content);
      });
    },
    [note.id]
  );

  const handleOpenPublishedPage = useCallback(() => {
    if (!isPublished) {
      return;
    }

    window.open(`/p/${note.id}`, "_blank", "noopener,noreferrer");
  }, [isPublished, note.id]);

  const handleCopyNoteLink = useCallback(async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/notes/${note.id}`);
  }, [note.id]);

  const handleArchiveNote = useCallback(async () => {
    await archiveNoteAction(note.id);
    router.push("/dashboard");
  }, [note.id, router]);

  const handleSave = useCallback(
    async (content: TiptapDocument) => {
      await saveNoteContentAction(note.id, content);
    },
    [note.id]
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
    [currentFolderId]
  );

  const handleNavigateToNote = useCallback(
    (noteId: string) => {
      router.push(`/notes/${noteId}`);
    },
    [router]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const openContextMenuAtPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      setContextMenuPosition({
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const openContextMenuFromTrigger = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setContextMenuPosition({
        x: rect.right - 14,
        y: rect.bottom + 8,
      });
    },
    []
  );

  const noteContextItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        label: isPublished ? "Yayından Kaldır" : "Yayınla",
        hint: "Notun yayın durumunu değiştir",
        onSelect: handlePublishToggle,
      },
      {
        label: "Not Bağlantısını Kopyala",
        hint: "Dahili not adresini panoya kopyala",
        onSelect: handleCopyNoteLink,
      },
      {
        label: "Markdown Kopyala",
        hint: "Dışa aktarılan Markdown sürümünü kopyala",
        onSelect: () => handleCopyExport("markdown"),
      },
      {
        label: "MDX Kopyala",
        hint: "Dışa aktarılan MDX sürümünü kopyala",
        onSelect: () => handleCopyExport("mdx"),
      },
      {
        label: "Yayındaki Sayfayı Aç",
        hint: "Genel görünümü yeni sekmede aç",
        disabled: !isPublished,
        onSelect: handleOpenPublishedPage,
      },
      {
        label: "Arşive Taşı",
        hint: "Notu aktif listelerden kaldır",
        tone: "danger",
        onSelect: handleArchiveNote,
      },
    ],
    [
      handleArchiveNote,
      handleCopyExport,
      handleCopyNoteLink,
      handleOpenPublishedPage,
      handlePublishToggle,
      isPublished,
    ]
  );

  return (
    <div className="note-page">
      <div className="note-header" onContextMenu={openContextMenuAtPointer}>
        <div className="note-status-row">
          <span className={`note-status-pill ${isPublished ? "published" : "draft"}`}>
            {isPublished ? "Yayında" : "Taslak"}
          </span>
          <span className="note-status-text">Otomatik kaydetme açık</span>
          <button
            type="button"
            className="context-trigger"
            onClick={openContextMenuFromTrigger}
            aria-label="Not menüsünü aç"
          >
            •••
          </button>
        </div>
        <div className="note-toolbar">
          <select
            className="note-folder-select"
            value={currentFolderId ?? ""}
            onChange={(event) => handleFolderChange(event.target.value)}
          >
            <option value="">Çalışma alanı kökü</option>
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>

          <button className="note-toolbar-btn" onClick={handlePublishToggle}>
            {isPublished ? "Yayından Kaldır" : "Yayınla"}
          </button>
          <button
            className="note-toolbar-btn"
            disabled={isExportPending}
            onClick={() => handleCopyExport("markdown")}
          >
            Markdown Kopyala
          </button>
          <button
            className="note-toolbar-btn"
            disabled={isExportPending}
            onClick={() => handleCopyExport("mdx")}
          >
            MDX Kopyala
          </button>
          <button
            className="note-toolbar-btn"
            disabled={!isPublished}
            onClick={handleOpenPublishedPage}
          >
            Yayındaki Sayfayı Aç
          </button>
        </div>

        <input
          className="note-title-input"
          value={title}
          onChange={(event) => handleTitleChange(event.target.value)}
          placeholder={DEFAULT_NOTE_TITLE}
          spellCheck={false}
        />

        {note.tags.length > 0 ? (
          <div className="note-tag-list">
            {note.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="note-tag-chip"
                onClick={() => router.push(`/tags/${tag}`)}
              >
                #{tag}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="note-editor-container">
        <Editor
          initialContent={note.document}
          onSave={handleSave}
          searchWikilinkNotes={handleSearchWikilinks}
          resolveWikilinkNote={handleResolveWikilink}
          createWikilinkNote={handleCreateWikilink}
          onNavigateToNote={handleNavigateToNote}
        />
      </div>

      {backlinks.length > 0 ? (
        <div className="backlinks-section">
          <div className="backlinks-header">
            <span className="backlinks-icon">Bağ</span>
            <span className="backlinks-title">
              Geri Bağlantılar ({backlinks.length})
            </span>
          </div>
          <div className="backlinks-list">
            {backlinks.map((backlink) => (
              <button
                key={`${backlink.sourceNoteId}-${backlink.targetRaw}`}
                type="button"
                className="backlink-item"
                onClick={() => router.push(`/notes/${backlink.sourceNoteId}`)}
              >
                <span className="backlink-source">{backlink.sourceNoteTitle}</span>
                <span className="backlink-target">→ {backlink.targetRaw}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ContextMenu
        items={noteContextItems}
        position={contextMenuPosition}
        onClose={closeContextMenu}
      />
    </div>
  );
}

function buildFolderLabel(
  folder: { id: string; name: string; parentId: string | null },
  folders: Array<{ id: string; name: string; parentId: string | null }>
) {
  const foldersById = new Map(
    folders.map((candidate) => [candidate.id, candidate])
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
