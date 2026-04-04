"use client";

import { useState, useCallback } from "react";
import { Editor } from "@/components/editor/Editor";
import { updateNoteAction, saveNoteContentAction } from "@/server/api/notes";
import type { TiptapDocument } from "@/domain/note/note.types";
import type { BacklinkResult } from "@/domain/link/link.types";

interface NoteEditorPageProps {
  note: {
    id: string;
    title: string;
    icon: string | null;
    document: TiptapDocument;
  };
  backlinks: BacklinkResult[];
}

export function NoteEditorPage({ note, backlinks }: NoteEditorPageProps) {
  const [title, setTitle] = useState(note.title);

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      setTitle(newTitle);
      await updateNoteAction(note.id, { title: newTitle || "Untitled" });
    },
    [note.id]
  );

  const handleSave = useCallback(
    async (content: TiptapDocument) => {
      await saveNoteContentAction(note.id, content);
    },
    [note.id]
  );

  return (
    <div className="note-page">
      <div className="note-header">
        <input
          className="note-title-input"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          spellCheck={false}
        />
      </div>

      <div className="note-editor-container">
        <Editor initialContent={note.document} onSave={handleSave} />
      </div>

      {backlinks.length > 0 && (
        <div className="backlinks-section">
          <div className="backlinks-header">
            <span className="backlinks-icon">🔗</span>
            <span className="backlinks-title">
              Backlinks ({backlinks.length})
            </span>
          </div>
          <div className="backlinks-list">
            {backlinks.map((bl) => (
              <a
                key={`${bl.sourceNoteId}-${bl.targetRaw}`}
                href={`/notes/${bl.sourceNoteId}`}
                className="backlink-item"
              >
                <span className="backlink-source">{bl.sourceNoteTitle}</span>
                <span className="backlink-target">→ {bl.targetRaw}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
