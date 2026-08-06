"use dom";

import type { CanvasElement } from "@giraffle/domain";
import { convertToExcalidrawElements, Excalidraw } from "@excalidraw/excalidraw";
// The stylesheet sits behind an export condition no resolver here sets;
// metro.config.js names the file this specifier stands for.
// eslint-disable-next-line import/no-unresolved
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DOMProps } from "expo/dom";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  liveElements,
  pageIdForElement,
  pageReferenceSkeleton,
  sceneMatches,
  sceneViewport,
  type PageReferenceRequest,
} from "./scene";
import { canvasCssVariables, type CanvasTheme } from "./theme";

/** Excalidraw fires on every pointer move; the vault only needs the rest state. */
const SCENE_DEBOUNCE_MS = 400;

export interface CanvasProps {
  /** Seeds the scene. Later revisions are not pushed back in; see below. */
  elements: CanvasElement[];
  theme: CanvasTheme;
  /** A page the host wants placed on the canvas, or null when there is none. */
  pendingPage: PageReferenceRequest | null;
  onChange: (elements: CanvasElement[], appState: Record<string, unknown>) => void;
  onOpenPage: (pageId: string) => void;
  onError: (message: string) => void;
  dom?: DOMProps;
}

const STYLES = `
.giraffle-canvas {
  width: 100%;
  height: 100%;
  background: var(--giraffle-canvas-bg);
  border-top: 1px solid var(--giraffle-canvas-dot);
}
.giraffle-canvas .excalidraw { --ui-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
`;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300) || "Canvas error";
}

export default function Canvas({
  elements,
  theme,
  pendingPage,
  onChange,
  onOpenPage,
  onError,
}: CanvasProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // The host saves what comes out of here and sends the saved scene straight
  // back, so adopting later revisions would fight the user's own strokes.
  const [seed] = useState(() => elements);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedPage = useRef<string | null>(null);
  const published = useRef<CanvasElement[]>(seed);

  const publish = useCallback(
    (next: readonly unknown[], appState: unknown) => {
      const live = liveElements(next);
      // Excalidraw reports the scene it just mounted, and again on every
      // selection; neither is something the vault needs to write.
      if (sceneMatches(live, published.current)) return;
      published.current = live;
      const viewport = sceneViewport(appState);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        onChange(live, { ...viewport });
      }, SCENE_DEBOUNCE_MS);
    },
    [onChange],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const report = (event: ErrorEvent) => onError(describe(event.error ?? event.message));
    const rejected = (event: PromiseRejectionEvent) => onError(describe(event.reason));
    window.addEventListener("error", report);
    window.addEventListener("unhandledrejection", rejected);
    return () => {
      window.removeEventListener("error", report);
      window.removeEventListener("unhandledrejection", rejected);
    };
  }, [onError]);

  useEffect(() => {
    if (!api) return;
    api.updateScene({ appState: { viewBackgroundColor: theme.bg } });
  }, [api, theme.bg]);

  useEffect(() => {
    if (!api || !pendingPage || appliedPage.current === pendingPage.elementId) return;
    appliedPage.current = pendingPage.elementId;
    try {
      const existing = api.getSceneElements();
      const skeleton = pageReferenceSkeleton(pendingPage, existing.length);
      const added = convertToExcalidrawElements([skeleton as never]);
      const next = [...existing, ...added];
      api.updateScene({ elements: next });
      publish(next, api.getAppState());
    } catch (error) {
      onError(describe(error));
    }
  }, [api, onError, pendingPage, publish]);

  return (
    <div className="giraffle-canvas" style={canvasCssVariables(theme) as CSSProperties}>
      <style>{STYLES}</style>
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={{
          elements: seed as never,
          appState: { viewBackgroundColor: theme.bg },
        }}
        onChange={(next, appState) => publish(next, appState)}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
        // Opening a linked page belongs to the native screen, not the canvas.
        onLinkOpen={(element, event) => {
          const pageId = pageIdForElement(element);
          if (pageId) {
            event.preventDefault();
            onOpenPage(pageId);
          }
        }}
      />
    </div>
  );
}
