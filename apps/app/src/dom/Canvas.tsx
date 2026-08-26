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
  normalizeReferenceLinks,
  pageIdForElement,
  referenceSkeleton,
  sceneMatches,
  sceneViewport,
  type CanvasReferenceRequest,
} from "./scene";
import { canvasCssVariables, type CanvasTheme } from "./theme";

/** Excalidraw fires on every pointer move; the vault only needs the rest state. */
const SCENE_DEBOUNCE_MS = 400;

export interface CanvasProps {
  /** Seeds the scene. Later revisions are not pushed back in; see below. */
  elements: CanvasElement[];
  theme: CanvasTheme;
  /** Increments when the host receives a scene from CLI or sync. */
  sceneRevision: number;
  /** A canonical Page the host wants placed on the canvas. */
  pendingReference: CanvasReferenceRequest | null;
  onChange: (elements: CanvasElement[], appState: Record<string, unknown>) => void;
  fitRequest: number;
  onOpenPage: (pageId: string) => void;
  onError: (message: string) => void;
  dom?: DOMProps;
}

const STYLES = `
/* Excalidraw measures its container, so every ancestor up to the document needs
   a definite height — a percentage against an auto-height body collapses to 0
   and the canvas renders nothing. */
html, body, #root {
  margin: 0;
  height: 100%;
}
.giraffle-canvas {
  box-sizing: border-box;
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
  sceneRevision,
  pendingReference,
  fitRequest,
  onChange,
  onOpenPage,
  onError,
}: CanvasProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // The host saves what comes out of here and sends the saved scene straight
  // back, so adopting later revisions would fight the user's own strokes.
  const [seed] = useState(() => normalizeReferenceLinks(elements));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedReference = useRef<string | null>(null);
  const initiallyFit = useRef(false);
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
    if (!api || !seed.length || initiallyFit.current) return;
    initiallyFit.current = true;
    const frame = requestAnimationFrame(() =>
      api.scrollToContent(seed as never, {
        fitToViewport: true,
        viewportZoomFactor: 0.12,
        maxZoom: 1,
        animate: false,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [api, seed]);

  useEffect(() => {
    if (!api || sceneRevision <= 0) return;
    const incoming = normalizeReferenceLinks(elements);
    if (sceneMatches(incoming, published.current)) return;
    published.current = incoming;
    api.updateScene({ elements: incoming as never });
  }, [api, elements, sceneRevision]);

  useEffect(() => {
    if (!api || fitRequest <= 0) return;
    const current = api.getSceneElements();
    if (current.length) api.scrollToContent(current, { fitToViewport: true, viewportZoomFactor: 0.12, maxZoom: 1, animate: true });
  }, [api, fitRequest]);

  useEffect(() => {
    if (
      !api ||
      !pendingReference ||
      appliedReference.current === pendingReference.elementId
    ) return;
    appliedReference.current = pendingReference.elementId;
    try {
      const existing = api.getSceneElements();
      const skeleton = referenceSkeleton(pendingReference, existing.length);
      const added = convertToExcalidrawElements([skeleton as never]);
      const next = [...existing, ...added];
      api.updateScene({ elements: next });
      api.scrollToContent(added, {
        fitToViewport: true,
        viewportZoomFactor: 0.28,
        maxZoom: 1,
        animate: true,
      });
      publish(next, api.getAppState());
    } catch (error) {
      onError(describe(error));
    }
  }, [api, onError, pendingReference, publish]);

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
          if (!pageId) return;
          event.preventDefault();
          onOpenPage(pageId);
        }}
      />
    </div>
  );
}
