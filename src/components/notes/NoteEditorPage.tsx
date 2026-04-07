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
  moveNoteAction,
  archiveNoteAction,
  updateNoteAction,
  createNoteFromWikilinkAction,
  findNoteByTitleAction,
  getNoteExportAction,
  saveNoteContentAction,
  searchNotesByTitleAction,
} from "@/server/api/notes";
import {
  applyProposalAction,
  rejectProposalAction,
} from "@/server/api/proposals";
import { createMapFromNoteAction } from "@/server/api/canvas";
import { queueLocalMutation, resolveLocalMutation } from "@/lib/local-sync";

interface NoteEditorPageProps {
  note: {
    id: string;
    title: string;
    slug: string | null;
    icon: string | null;
    folderId: string | null;
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
  backlinks: BacklinkResult[];
  proposals: Array<{
    id: string;
    title: string;
    summary: string | null;
    status: string;
    createdAt: string;
  }>;
}

export function NoteEditorPage({
  note,
  folders,
  backlinks,
  proposals,
}: NoteEditorPageProps) {
  const [title, setTitle] = useState(note.title);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    note.folderId
  );
  const [slug, setSlug] = useState(note.slug);
  const [isPinned, setIsPinned] = useState(note.isPinned);
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

  const currentFolderLabel = useMemo(
    () =>
      folderOptions.find((folder) => folder.id === currentFolderId)?.name ??
      "Çalışma alanı",
    [currentFolderId, folderOptions]
  );

  const effectiveTitle = title.trim() || DEFAULT_NOTE_TITLE;

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      setTitle(newTitle);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "update-title",
        payload: { title: newTitle || DEFAULT_NOTE_TITLE },
      });
      await updateNoteAction(note.id, { title: newTitle || DEFAULT_NOTE_TITLE });
      resolveLocalMutation(mutationId);
    },
    [note.id]
  );

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
    [note.id]
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
    [note.id, router]
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
    [note.id, router]
  );

  const handleApplyProposal = useCallback(
    async (proposalId: string) => {
      await applyProposalAction(proposalId, note.id);
      router.refresh();
    },
    [note.id, router]
  );

  const handleRejectProposal = useCallback(
    async (proposalId: string) => {
      await rejectProposalAction(proposalId, note.id);
      router.refresh();
    },
    [note.id, router]
  );

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
    if (!isPublished || !slug) {
      return;
    }

    window.open(`/published/${slug}`, "_blank", "noopener,noreferrer");
  }, [isPublished, slug]);

  const handleCopyNoteLink = useCallback(async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/notes/${note.id}`);
  }, [note.id]);

  const handleArchiveNote = useCallback(async () => {
    await archiveNoteAction(note.id);
    router.push("/dashboard");
  }, [note.id, router]);

  const handleOpenInCanvas = useCallback(async () => {
    try {
      const canvasId = await createMapFromNoteAction(note.id);
      router.push(`/canvas/${canvasId}`);
    } catch (err) {
      console.error("Failed to open canvas:", err);
    }
  }, [note.id, router]);

  const handleSave = useCallback(
    async (content: TiptapDocument) => {
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "save-document",
        payload: {
          blockCount: content.content.length,
        },
      });
      await saveNoteContentAction(note.id, content);
      resolveLocalMutation(mutationId);
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
        label: "Kanvasta Aç",
        hint: "Bu notu merkez alarak uzamsal haritasını çıkar",
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
        onSelect: () => handleCopyExport("markdown"),
      },
      {
        label: "MDX kopyala",
        hint: "Dışa aktarılan MDX sürümünü kopyala",
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
      handleOpenPublishedPage,
      handlePinToggle,
      handlePublishToggle,
      isPinned,
      isPublished,
    ]
  );

  return (
    <div className="note-page">
      <div className="note-header" onContextMenu={openContextMenuAtPointer}>
        <div className="note-breadcrumb-row">
          <button
            type="button"
            className="note-breadcrumb"
            onClick={() => router.push("/dashboard")}
          >
            Çalışma alanı
          </button>
          <span className="note-breadcrumb-separator">/</span>
          {currentFolderId ? (
            <>
              <button
                type="button"
                className="note-breadcrumb"
                onClick={() => router.push(`/folders/${currentFolderId}`)}
              >
                {currentFolderLabel}
              </button>
              <span className="note-breadcrumb-separator">/</span>
            </>
          ) : null}
          <span className="note-breadcrumb current">{effectiveTitle}</span>
        </div>

        <div className="note-topbar">
          <div className="note-topbar-left">
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
          </div>

          <div className="note-toolbar">
            <button className="note-toolbar-btn primary" onClick={handlePublishToggle}>
              {isPublished ? "Yayımdan kaldır" : "Yayımla"}
            </button>
            <button className="note-toolbar-btn" onClick={handlePinToggle}>
              {isPinned ? "Pini kaldır" : "Sabitle"}
            </button>
            <button
              className="note-toolbar-btn"
              onClick={() => handleMoveNote("up")}
            >
              Yukarı
            </button>
            <button
              className="note-toolbar-btn"
              onClick={() => handleMoveNote("down")}
            >
              Aşağı
            </button>
            <button
              className="note-toolbar-btn"
              disabled={isExportPending}
              onClick={() => handleCopyExport("markdown")}
            >
              Markdown
            </button>
            <button
              className="note-toolbar-btn"
              disabled={isExportPending}
              onClick={() => handleCopyExport("mdx")}
            >
              MDX
            </button>
            <button
              className="context-trigger"
              onClick={openContextMenuFromTrigger}
              aria-label="Not menüsünü aç"
            >
              ...
            </button>
          </div>
        </div>

        <div className="note-title-row">
          <div className="note-page-symbol">{note.icon ?? "Not"}</div>

          <div className="note-title-stack">
            <div className="note-status-row">
              <span
                className={`note-status-pill ${isPublished ? "published" : "draft"}`}
              >
                {isPublished ? "Yayında" : "Taslak"}
              </span>
              {isPinned ? (
                <span className="note-status-pill pinned">Pinli</span>
              ) : null}
              <span className="note-status-text">Otomatik kaydetme açık</span>
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

            <label className="note-slug-field">
              <span>Yayın adresi</span>
              <input
                className="note-slug-input"
                value={slug ?? ""}
                onChange={(event) => setSlug(event.target.value)}
                onBlur={(event) => void handleSlugChange(event.target.value)}
                placeholder="yayin-adresi"
                spellCheck={false}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="note-editor-container">
        <Editor
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
        <div className="backlinks-section">
          <div className="backlinks-header">
            <span className="backlinks-icon">Bag</span>
            <span className="backlinks-title">
              Geri bağlantılar ({backlinks.length})
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
                <span className="backlink-target">-&gt; {backlink.targetRaw}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <div className="backlinks-section">
          <div className="backlinks-header">
            <span className="backlinks-icon">YZ</span>
            <span className="backlinks-title">
              Bekleyen öneriler ({proposals.length})
            </span>
          </div>
          <div className="proposal-list">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="proposal-card">
                <div className="proposal-card-head">
                  <div>
                    <div className="proposal-card-title">{proposal.title}</div>
                    <div className="proposal-card-meta">
                      {proposal.status} ·{" "}
                      {new Date(proposal.createdAt).toLocaleString("tr-TR")}
                    </div>
                  </div>
                  <div className="proposal-card-actions">
                    {proposal.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className="note-toolbar-btn"
                          onClick={() => void handleApplyProposal(proposal.id)}
                        >
                          Uygula
                        </button>
                        <button
                          type="button"
                          className="note-toolbar-btn"
                          onClick={() => void handleRejectProposal(proposal.id)}
                        >
                          Reddet
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {proposal.summary ? (
                  <div className="proposal-card-summary">{proposal.summary}</div>
                ) : null}
              </div>
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
