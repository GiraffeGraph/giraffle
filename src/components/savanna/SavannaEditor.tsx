"use client";

import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { isSidebarNoteDragData } from "@/components/sidebar/sidebar.types";
import { saveSavannaStateAction } from "@/server/api/savanna";
import { NotePreviewPanel } from "./NotePreviewPanel";
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

type ViewportPoint = { clientX: number; clientY: number };

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
  const [theme, setTheme] = useState<ExcalidrawTheme>("light");
  const [isNoteDragOver, setIsNoteDragOver] = useState(false);
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);
  const [previewAnchor, setPreviewAnchor] = useState<{ x: number; y: number } | null>(null);
  const canvasDropRef = useRef<HTMLElement | null>(null);
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

  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);

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
    async (note: SavannaNote, viewportPoint?: ViewportPoint) => {
      if (!excalidrawAPI) return;

      const { convertToExcalidrawElements, viewportCoordsToSceneCoords } = await import(
        "@excalidraw/excalidraw"
      );
      const appState = excalidrawAPI.getAppState();
      const scenePoint = viewportPoint
        ? viewportCoordsToSceneCoords(viewportPoint, appState)
        : getCanvasCenter(appState);
      const currentElements = excalidrawAPI.getSceneElements();

      const newElements = convertToExcalidrawElements([
        {
          type: "text",
          text: `${note.icon ?? "📄"} ${note.title || "Untitled"}`,
          x: scenePoint.x - 120,
          y: scenePoint.y - 20,
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

  useEffect(() => {
    const element = canvasDropRef.current;
    if (!element) return;

    return combine(
      dropTargetForElements({
        element,
        canDrop: ({ source }) => isSidebarNoteDragData(source.data),
        onDragEnter: () => setIsNoteDragOver(true),
        onDragLeave: () => setIsNoteDragOver(false),
        onDrop: ({ location, source }) => {
          setIsNoteDragOver(false);
          if (!isSidebarNoteDragData(source.data)) return;

          const note = noteById.get(source.data.noteId);
          if (!note) return;

          void addNoteToCanvas(note, {
            clientX: location.current.input.clientX,
            clientY: location.current.input.clientY,
          });
        },
      }),
    );
  }, [addNoteToCanvas, noteById]);

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
        <main
          ref={canvasDropRef}
          className={`svn-excalidraw-canvas${isNoteDragOver ? " svn-excalidraw-canvas--drop-over" : ""}`}
        >
          <Excalidraw
            excalidrawAPI={setExcalidrawAPI}
            initialData={initialData}
            onChange={handleChange}
            onLinkOpen={(element, event) => {
              if (typeof element.link === "string") {
                event.preventDefault();
                
                // Check if it's a note link
                const match = element.link.match(/^\/notes\/(.+)$/);
                if (match && excalidrawAPI) {
                  const noteId = match[1];
                  const appState = excalidrawAPI.getAppState();
                  
                  // Calculate screen position from element position
                  const zoom = typeof appState.zoom?.value === "number" ? appState.zoom.value : 1;
                  const screenX = (element.x + element.width / 2 + appState.scrollX) * zoom;
                  const screenY = (element.y + appState.scrollY) * zoom;
                  
                  setPreviewNoteId(noteId);
                  setPreviewAnchor({ x: screenX, y: screenY });
                } else if (element.link.startsWith("/")) {
                  // For other internal links, navigate
                  router.push(element.link);
                }
              }
            }}
            theme={theme}
          />
          
          {previewNoteId && previewAnchor && (
            <NotePreviewPanel
              noteId={previewNoteId}
              anchorX={previewAnchor.x}
              anchorY={previewAnchor.y}
              onClose={() => {
                setPreviewNoteId(null);
                setPreviewAnchor(null);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
