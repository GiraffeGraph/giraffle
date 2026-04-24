"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { saveSavannaStateAction } from "@/server/api/savanna";
import type { AppState, ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const Excalidraw = dynamic<ExcalidrawProps>(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  {
    ssr: false,
    loading: () => <div className="svn-excalidraw-loading">Loading canvas…</div>,
  },
);

type SavannaNote = {
  id: string;
  title: string;
  icon: string | null;
};

type SavannaCanvas = {
  id: string;
  title: string;
  elements: unknown;
  appState: unknown;
};

interface SavannaEditorProps {
  canvas: SavannaCanvas;
  notes: SavannaNote[];
}

type SaveStatus = "saved" | "saving" | "unsaved";

type ExcalidrawTheme = "light" | "dark";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asElements(value: unknown): readonly ExcalidrawElement[] {
  return Array.isArray(value) ? (value as ExcalidrawElement[]) : [];
}

function asAppState(value: unknown): Partial<AppState> {
  return isRecord(value) ? (value as Partial<AppState>) : {};
}

function getDocumentTheme(): ExcalidrawTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "graphite-night" ? "dark" : "light";
}

function getCanvasCenter(appState: AppState) {
  const zoom = typeof appState.zoom?.value === "number" ? appState.zoom.value : 1;
  return {
    x: (appState.width / 2 - appState.scrollX) / zoom,
    y: (appState.height / 2 - appState.scrollY) / zoom,
  };
}

function pickPersistedAppState(appState: AppState) {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
    theme: appState.theme,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
  };
}

export function SavannaEditor({ canvas, notes }: SavannaEditorProps) {
  const router = useRouter();
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [noteSearch, setNoteSearch] = useState("");
  const [theme, setTheme] = useState<ExcalidrawTheme>("light");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialData = useMemo(
    () => ({
      elements: asElements(canvas.elements),
      appState: asAppState(canvas.appState),
      scrollToContent: asElements(canvas.elements).length > 0,
    }),
    [canvas.appState, canvas.elements],
  );

  useEffect(() => {
    setTheme(getDocumentTheme());

    const observer = new MutationObserver(() => setTheme(getDocumentTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      setSaveStatus("unsaved");

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await saveSavannaStateAction(
            canvas.id,
            [...elements],
            pickPersistedAppState(appState),
          );
          setSaveStatus("saved");
        } catch (error) {
          console.error("Savanna save error:", error);
          setSaveStatus("unsaved");
        }
      }, 1200);
    },
    [canvas.id],
  );

  const addNoteToCanvas = useCallback(
    async (note: SavannaNote) => {
      if (!excalidrawAPI) return;

      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
      const appState = excalidrawAPI.getAppState();
      const center = getCanvasCenter(appState);
      const currentElements = excalidrawAPI.getSceneElements();

      const newElements = convertToExcalidrawElements([
        {
          type: "text",
          text: `${note.icon ?? "📄"} ${note.title || "Untitled"}`,
          x: center.x - 120,
          y: center.y - 20,
          fontSize: 24,
          link: `/notes/${note.id}`,
        },
      ]);

      excalidrawAPI.updateScene({
        elements: [...currentElements, ...newElements],
      });
    },
    [excalidrawAPI],
  );

  const filteredNotes = useMemo(() => {
    const query = noteSearch.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter((note) => note.title.toLowerCase().includes(query));
  }, [noteSearch, notes]);

  return (
    <div className="svn-excalidraw-shell">
      <PageTopbar
        icon="landscape"
        label={canvas.title}
        actions={
          <div className={`svn-save-status svn-save-status--${saveStatus}`} aria-live="polite">
            {saveStatus === "saving" && (
              <>
                <span className="svn-save-dot" />
                Saving…
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <span className="material-symbols-outlined">cloud_done</span>
                Saved
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <span className="svn-save-dot svn-save-dot--unsaved" />
                Unsaved
              </>
            )}
          </div>
        }
      />

      <div className="svn-excalidraw-body">
        <aside className="svn-excalidraw-sidebar">
          <div className="svn-note-panel__header">
            <span className="svn-note-panel__title">Add notes</span>
          </div>

          <div className="svn-note-panel__search">
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Search notes…"
              value={noteSearch}
              onChange={(event) => setNoteSearch(event.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="svn-note-panel__list">
            {filteredNotes.length === 0 ? (
              <div className="svn-note-panel__empty">No notes found</div>
            ) : (
              filteredNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="svn-note-panel__item"
                  onClick={() => void addNoteToCanvas(note)}
                  title="Add as a linked Excalidraw text element"
                >
                  <span className="svn-note-panel__item-title">
                    {note.icon ? `${note.icon} ` : ""}
                    {note.title || "Untitled"}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="svn-excalidraw-canvas">
          <Excalidraw
            excalidrawAPI={setExcalidrawAPI}
            initialData={initialData}
            onChange={handleChange}
            onLinkOpen={(element, event) => {
              if (typeof element.link === "string" && element.link.startsWith("/")) {
                event.preventDefault();
                router.push(element.link);
              }
            }}
            theme={theme}
          />
        </main>
      </div>
    </div>
  );
}
