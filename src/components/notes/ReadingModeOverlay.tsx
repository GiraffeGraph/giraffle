"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SafeEditor } from "@/components/editor/SafeEditor";
import type { NoteReference } from "@giraffle/domain";
import {
  estimateReadingMinutes,
  type NoteChunk,
} from "@/components/notes/NoteEditorPage.helpers";

interface ReadingModeOverlayProps {
  noteId: string;
  noteTitle: string;
  chunks: NoteChunk[];
  chunkIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
  onClose: () => void;
  searchWikilinkNotes: (query: string) => Promise<NoteReference[]>;
  resolveWikilinkNote: (target: string) => Promise<NoteReference | null>;
  createWikilinkNote: (target: string) => Promise<NoteReference>;
  onNavigateToNote?: (id: string) => void;
}

export function ReadingModeOverlay({
  noteId,
  noteTitle,
  chunks,
  chunkIndex,
  onPrev,
  onNext,
  onSelect,
  onClose,
  searchWikilinkNotes,
  resolveWikilinkNote,
  createWikilinkNote,
  onNavigateToNote,
}: ReadingModeOverlayProps) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (typeof document === "undefined") return null;

  const total = chunks.length;
  const safeIndex = Math.min(Math.max(chunkIndex, 0), Math.max(total - 1, 0));
  const chunk = chunks[safeIndex];

  return createPortal(
    <div
      className="note-reading-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Reading mode"
    >
      <div
        className="note-reading-overlay-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <header className="note-reading-overlay-header">
        <div className="note-reading-overlay-title-group">
          <span className="material-symbols-outlined" aria-hidden="true">
            menu_book
          </span>
          <span
            className="note-reading-overlay-note-title"
            title={noteTitle}
          >
            {noteTitle}
          </span>
        </div>
        <div className="note-reading-overlay-meta">
          {chunk && chunk.wordCount > 0 ? (
            <span>
              {chunk.wordCount} words · ~
              {estimateReadingMinutes(chunk.wordCount)} min
            </span>
          ) : null}
          <button
            type="button"
            className="note-reading-overlay-close"
            onClick={onClose}
            aria-label="Exit reading mode"
            title="Exit (Esc)"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </header>

      <main className="note-reading-overlay-page">
        <article className="note-reading-overlay-content">
          {chunk ? (
            <>
              {chunk.isContinuation ? (
                <div className="note-reading-overlay-continuation">
                  <span className="note-reading-overlay-continuation-title">
                    {chunk.title}
                  </span>
                  <span className="note-reading-overlay-continuation-tag">
                    continued
                  </span>
                </div>
              ) : null}
              <SafeEditor
                key={`reading-${safeIndex}`}
                noteId={noteId}
                initialContent={chunk.document}
                editable={false}
                searchWikilinkNotes={searchWikilinkNotes}
                resolveWikilinkNote={resolveWikilinkNote}
                createWikilinkNote={createWikilinkNote}
                onNavigateToNote={onNavigateToNote}
              />
            </>
          ) : (
            <p className="note-reading-overlay-empty">No content.</p>
          )}
        </article>
      </main>

      <footer className="note-reading-overlay-footer">
        <button
          type="button"
          className="note-reading-overlay-pager-btn"
          onClick={onPrev}
          disabled={safeIndex === 0}
          aria-label="Previous page"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_left
          </span>
        </button>

        <div className="note-reading-overlay-progress-wrap">
          <div
            className="note-reading-overlay-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={safeIndex + 1}
          >
            {chunks.map((c) => (
              <button
                key={c.index}
                type="button"
                onClick={() => onSelect(c.index)}
                title={c.title}
                aria-label={`Page ${c.index + 1}: ${c.title}`}
                className={`note-reading-overlay-progress-tick${
                  c.index === safeIndex
                    ? " note-reading-overlay-progress-tick--active"
                    : ""
                }${
                  c.index < safeIndex
                    ? " note-reading-overlay-progress-tick--done"
                    : ""
                }`}
              />
            ))}
          </div>
          <div className="note-reading-overlay-progress-label">
            <span className="note-reading-overlay-page-num">
              {safeIndex + 1} / {total}
            </span>
            {chunk ? (
              <span className="note-reading-overlay-page-title" title={chunk.title}>
                {chunk.title}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className="note-reading-overlay-pager-btn"
          onClick={onNext}
          disabled={safeIndex >= total - 1}
          aria-label="Next page"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </footer>
    </div>,
    document.body,
  );
}
