import type { CanvasElement } from "@giraffle/domain";

export interface PageReferenceRequest {
  kind: "page";
  pageId: string;
  title: string;
  elementId: string;
  versionNonce: number;
}

export interface TaskReferenceRequest {
  kind: "task";
  taskId: string;
  title: string;
  elementId: string;
  versionNonce: number;
}

export type CanvasReferenceRequest = PageReferenceRequest | TaskReferenceRequest;

export interface SceneViewport {
  scrollX: number;
  scrollY: number;
}

/**
 * Excalidraw keeps tombstones in its scene so undo and collaboration work; the
 * vault only stores what is still on the canvas.
 */
export function liveElements(elements: readonly unknown[]): CanvasElement[] {
  return elements.filter(
    (element): element is CanvasElement =>
      typeof element === "object" &&
      element !== null &&
      (element as { isDeleted?: unknown }).isDeleted !== true,
  );
}

/**
 * Whether two scenes are the same drawing. Excalidraw emits a change for every
 * pointer move and selection, so the vault is only written when an element was
 * actually added, edited or removed.
 */
export function sceneMatches(
  left: readonly CanvasElement[],
  right: readonly CanvasElement[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((element, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      other.id === element.id &&
      other.version === element.version &&
      other.versionNonce === element.versionNonce
    );
  });
}

/** The only part of Excalidraw's app state the vault persists. */
export function sceneViewport(appState: unknown): SceneViewport {
  const state = (appState ?? {}) as { scrollX?: unknown; scrollY?: unknown };
  return {
    scrollX: typeof state.scrollX === "number" ? state.scrollX : 0,
    scrollY: typeof state.scrollY === "number" ? state.scrollY : 0,
  };
}

/** The page id a canvas element links to, or null when it links to nothing. */
export function pageIdForElement(element: unknown): string | null {
  if (typeof element !== "object" || element === null) return null;
  const custom = (element as { customData?: { girafflePageId?: unknown } }).customData;
  const pageId = custom?.girafflePageId;
  return typeof pageId === "string" && pageId.length > 0 ? pageId : null;
}

/** The task id a canvas element links to, or null when it links to nothing. */
export function taskIdForElement(element: unknown): string | null {
  if (typeof element !== "object" || element === null) return null;
  const custom = (element as { customData?: { giraffleTaskId?: unknown } }).customData;
  const taskId = custom?.giraffleTaskId;
  return typeof taskId === "string" && taskId.length > 0 ? taskId : null;
}

/** Rewrites legacy custom-scheme links before Excalidraw parses the scene. */
export function normalizeReferenceLinks(
  elements: readonly CanvasElement[],
): CanvasElement[] {
  return elements.map((element) => {
    const pageId = pageIdForElement(element);
    const taskId = taskIdForElement(element);
    const link = pageId
      ? `https://giraffle.local/page/${encodeURIComponent(pageId)}`
      : taskId
        ? `https://giraffle.local/task/${encodeURIComponent(taskId)}`
        : null;
    return link && element.link !== link ? { ...element, link } : element;
  });
}

/**
 * A labelled card standing in for a canonical page or task. Excalidraw fills
 * in the remaining fields; cards are laid out two per row.
 */
export function referenceSkeleton(
  request: CanvasReferenceRequest,
  index: number,
): Record<string, unknown> {
  const task = request.kind === "task";
  return {
    type: "rectangle",
    id: request.elementId,
    versionNonce: request.versionNonce,
    x: 24 + (index % 2) * 260,
    y: 24 + Math.floor(index / 2) * 140,
    width: 220,
    height: task ? 80 : 100,
    roundness: { type: 3 },
    backgroundColor: task ? "#fff4d6" : "#e7f0ff",
    fillStyle: "solid",
    label: { text: request.title },
    link:
      request.kind === "page"
        ? `https://giraffle.local/page/${encodeURIComponent(request.pageId)}`
        : `https://giraffle.local/task/${encodeURIComponent(request.taskId)}`,
    customData:
      request.kind === "page"
        ? { girafflePageId: request.pageId }
        : { giraffleTaskId: request.taskId },
  };
}

/** Kept as the page-specific public helper used by existing clients. */
export function pageReferenceSkeleton(
  request: PageReferenceRequest,
  index: number,
): Record<string, unknown> {
  return referenceSkeleton(request, index);
}
