"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import {
  createNoteFromWikilinkAction,
  findNoteByTitleAction,
  getNoteExportAction,
  saveNoteContentAction,
  searchNotesByTitleAction,
  updateNoteAction,
} from "@/server/api/notes";
import type { NoteReference, TiptapDocument } from "@/domain/note/note.types";
import type { BacklinkResult } from "@/domain/link/link.types";

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
      await updateNoteAction(note.id, { title: newTitle || "Untitled" });
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

  return (
    <div className="note-page">
      <div className="note-header">
        <div className="note-toolbar">
          <select
            className="note-folder-select"
            value={currentFolderId ?? ""}
            onChange={(event) => handleFolderChange(event.target.value)}
          >
            <option value="">Workspace root</option>
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>

          <button className="note-toolbar-btn" onClick={handlePublishToggle}>
            {isPublished ? "Unpublish" : "Publish"}
          </button>
          <button
            className="note-toolbar-btn"
            disabled={isExportPending}
            onClick={() => handleCopyExport("markdown")}
          >
            Copy Markdown
          </button>
          <button
            className="note-toolbar-btn"
            disabled={isExportPending}
            onClick={() => handleCopyExport("mdx")}
          >
            Copy MDX
          </button>
          <button
            className="note-toolbar-btn"
            disabled={!isPublished}
            onClick={handleOpenPublishedPage}
          >
            Open Published
          </button>
        </div>

        <input
          className="note-title-input"
          value={title}
          onChange={(event) => handleTitleChange(event.target.value)}
          placeholder="Untitled"
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
            <span className="backlinks-icon">Link</span>
            <span className="backlinks-title">
              Backlinks ({backlinks.length})
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
    </div>
  );
}

function buildFolderLabel(
  folder: { id: string; name: string; parentId: string | null },
  folders: Array<{ id: string; name: string; parentId: string | null }>
) {
  const foldersById = new Map(folders.map((candidate) => [candidate.id, candidate]));
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
