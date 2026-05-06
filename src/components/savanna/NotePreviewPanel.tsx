"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSavannaNoteEditorAction } from "@/server/api/savanna";
import { saveNoteContentAction } from "@/server/api/notes";
import type { TiptapDocument } from "@/domain/note/note.types";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const SafeEditor = dynamic<{
  initialContent?: TiptapDocument;
  onSave?: (content: TiptapDocument) => void;
}>(
  () => import("@/components/editor/SafeEditor").then((mod) => mod.SafeEditor as ComponentType<{
    initialContent?: TiptapDocument;
    onSave?: (content: TiptapDocument) => void;
  }>),
  {
    ssr: false,
    loading: () => <div className="svn-note-preview-loading">Loading editor…</div>,
  },
);

interface NotePreviewPanelProps {
  noteId: string;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}

type NoteData = {
  id: string;
  title: string;
  icon: string | null;
  document: TiptapDocument;
};

export function NotePreviewPanel({ noteId, anchorX, anchorY, onClose }: NotePreviewPanelProps) {
  const [noteData, setNoteData] = useState<NoteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchNote() {
      try {
        setIsLoading(true);
        setError(null);
        const note = await getSavannaNoteEditorAction(noteId);

        if (!mounted) return;

        if (!note) {
          setError("Note not found");
          return;
        }

        setNoteData({
          id: note.id,
          title: note.title,
          icon: note.icon,
          document: note.document,
        });
      } catch (err) {
        if (!mounted) return;
        console.error("Failed to load note:", err);
        setError("Failed to load note");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchNote();

    return () => {
      mounted = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [noteId]);

  const handleEditorChange = useCallback(
    (document: TiptapDocument) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(async () => {
        try {
          await saveNoteContentAction(noteId, document);
        } catch (err) {
          console.error("Failed to save note:", err);
        }
      }, 800);
    },
    [noteId],
  );

  const handleOpenFullNote = useCallback(() => {
    window.open(`/notes/${noteId}`, "_blank");
  }, [noteId]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    // Add a small delay to prevent immediate close from the click that opened the panel
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Calculate position to keep panel within viewport
  const [position, setPosition] = useState({ left: anchorX, top: anchorY });

  useEffect(() => {
    if (!panelRef.current) return;

    const panel = panelRef.current;
    const rect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorX;
    let top = anchorY;

    // Adjust horizontal position
    if (left + rect.width > viewportWidth - 20) {
      left = viewportWidth - rect.width - 20;
    }
    if (left < 20) {
      left = 20;
    }

    // Adjust vertical position
    if (top + rect.height > viewportHeight - 20) {
      top = viewportHeight - rect.height - 20;
    }
    if (top < 80) {
      // Account for topbar
      top = 80;
    }

    setPosition({ left, top });
  }, [anchorX, anchorY]);

  return (
    <div
      ref={panelRef}
      className="svn-note-preview-panel"
      style={{
        position: "absolute",
        left: `${position.left}px`,
        top: `${position.top}px`,
        zIndex: 100,
      }}
    >
      <div className="svn-note-preview-header">
        {isLoading ? (
          <div className="svn-note-preview-title-skeleton" />
        ) : error ? (
          <div className="svn-note-preview-title">{error}</div>
        ) : (
          <div className="svn-note-preview-title">
            {noteData?.icon && <span className="svn-note-preview-icon">{noteData.icon}</span>}
            <span>{noteData?.title || "Untitled"}</span>
          </div>
        )}
        <button
          type="button"
          className="svn-note-preview-close"
          onClick={onClose}
          aria-label="Close preview"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="svn-note-preview-body">
        {isLoading ? (
          <div className="svn-note-preview-skeleton">
            <div className="svn-note-preview-skeleton-line" />
            <div className="svn-note-preview-skeleton-line" />
            <div className="svn-note-preview-skeleton-line svn-note-preview-skeleton-line--short" />
          </div>
        ) : error ? (
          <div className="svn-note-preview-error">{error}</div>
        ) : noteData ? (
          <SafeEditor
            key={noteData.id}
            initialContent={noteData.document}
            onSave={handleEditorChange}
          />
        ) : null}
      </div>

      {!isLoading && !error && (
        <div className="svn-note-preview-footer">
          <button
            type="button"
            className="svn-note-preview-open-link"
            onClick={handleOpenFullNote}
          >
            Open full note →
          </button>
        </div>
      )}
    </div>
  );
}
