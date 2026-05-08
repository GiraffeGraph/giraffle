"use client";

import { useCallback, useMemo, useState } from "react";
import { SafeEditor } from "@/components/editor/SafeEditor";
import { ReadingModeOverlay } from "@/components/notes/ReadingModeOverlay";
import { splitDocumentIntoChunks } from "@/components/notes/NoteEditorPage.helpers";
import type { TiptapDocument } from "@/domain/note/note.types";
import { ThemeSelector } from "@/components/theme/ThemeSelector";

interface PublishedNoteViewProps {
  title: string;
  document: TiptapDocument;
}

const noopSearch = async () => [];
const noopResolve = async () => null;
const noopCreate = async () => {
  throw new Error("Wikilink creation disabled in published view");
};

export function PublishedNoteView({
  title,
  document: noteDocument,
}: PublishedNoteViewProps) {
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);

  const chunks = useMemo(
    () => splitDocumentIntoChunks(noteDocument),
    [noteDocument],
  );

  const goToPrev = useCallback(() => {
    setChunkIndex((index) => Math.max(0, index - 1));
  }, []);

  const goToNext = useCallback(() => {
    setChunkIndex((index) => Math.min(chunks.length - 1, index + 1));
  }, [chunks.length]);

  const enterReading = useCallback(() => {
    setChunkIndex(0);
    setIsReadingMode(true);
  }, []);

  return (
    <div className="published-page">
      <div className="published-toolbar">
        <button
          type="button"
          className="published-toolbar-btn"
          onClick={enterReading}
          title="Reading mode"
          aria-label="Reading mode"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            menu_book
          </span>
          <span>Reading mode</span>
        </button>
        <div className="published-toolbar-theme">
          <ThemeSelector vertical={false} mobileInline />
        </div>
      </div>

      <div className="published-shell">
        <div className="published-meta">
          <div className="published-label">Published Note</div>
          <h1 className="published-title">{title}</h1>
        </div>
        <SafeEditor initialContent={noteDocument} editable={false} />
      </div>

      {isReadingMode ? (
        <ReadingModeOverlay
          noteId="published"
          noteTitle={title}
          chunks={chunks}
          chunkIndex={chunkIndex}
          onPrev={goToPrev}
          onNext={goToNext}
          onSelect={setChunkIndex}
          onClose={() => setIsReadingMode(false)}
          searchWikilinkNotes={noopSearch}
          resolveWikilinkNote={noopResolve}
          createWikilinkNote={noopCreate}
        />
      ) : null}
    </div>
  );
}
