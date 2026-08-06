import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { convertToExcalidrawElements, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

const BRIDGE_VERSION = 1;
const SCENE_DEBOUNCE_MS = 400;

interface InitPayload {
  elements?: unknown[];
  theme?: Record<string, string>;
}

interface AddPagePayload {
  pageId: string;
  title: string;
  elementId: string;
  versionNonce: number;
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    GiraffleCanvas?: {
      init(payload: InitPayload): void;
      addPage(payload: AddPagePayload): void;
    };
  }
}

function post(message: Record<string, unknown>) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

/**
 * Hosts Excalidraw and speaks the bridge the native screen already uses:
 * `init` and `addPage` arrive through injected JavaScript, scene updates and
 * page taps go back out as posted messages.
 */
function Canvas() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const initialised = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sceneChanged = useCallback(
    (elements: readonly unknown[], appState?: { scrollX?: number; scrollY?: number }) => {
      if (!initialised.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        post({
          type: "scene-change",
          bridgeVersion: BRIDGE_VERSION,
          elements: elements.filter(
            (element) => !(element as { isDeleted?: boolean }).isDeleted,
          ),
          appState: {
            scrollX: appState?.scrollX ?? 0,
            scrollY: appState?.scrollY ?? 0,
          },
        });
      }, SCENE_DEBOUNCE_MS);
    },
    [],
  );

  useEffect(() => {
    if (!api) return;

    window.GiraffleCanvas = {
      init: (payload) => {
        api.updateScene({
          elements: (payload.elements ?? []) as never,
          appState: { viewBackgroundColor: payload.theme?.bg ?? "#ffffff" },
        });
        initialised.current = true;
      },
      addPage: (payload) => {
        const existing = api.getSceneElements();
        const index = existing.length;
        // Skeleton input needs converting, or the element misses the fields
        // Excalidraw and the native validator both expect.
        const added = convertToExcalidrawElements([
          {
            type: "rectangle",
            id: payload.elementId,
            x: 24 + (index % 2) * 260,
            y: 24 + Math.floor(index / 2) * 140,
            width: 220,
            height: 100,
            label: { text: payload.title },
            customData: { girafflePageId: payload.pageId },
          },
        ] as never);
        const next = [...existing, ...added];
        api.updateScene({ elements: next as never });
        sceneChanged(next, api.getAppState());
      },
    };

    post({ type: "ready", bridgeVersion: BRIDGE_VERSION });

    return () => {
      delete window.GiraffleCanvas;
    };
  }, [api, sceneChanged]);

  return (
    <Excalidraw
      excalidrawAPI={setApi}
      onChange={(elements, appState) => sceneChanged(elements, appState)}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
      // Opening a linked page belongs to the native screen, not the canvas.
      onLinkOpen={(element, event) => {
        const pageId = (element.customData as { girafflePageId?: string } | undefined)
          ?.girafflePageId;
        if (pageId) {
          event.preventDefault();
          post({ type: "open-page", bridgeVersion: BRIDGE_VERSION, pageId });
        }
      }}
    />
  );
}

window.addEventListener("error", (event) => {
  post({
    type: "bridge-error",
    bridgeVersion: BRIDGE_VERSION,
    message: String(event.message || "Canvas error").slice(0, 300),
  });
});

const container = document.getElementById("canvas");

if (container) {
  createRoot(container).render(<Canvas />);
}
