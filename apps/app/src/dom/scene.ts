import type { CanvasElement } from "@giraffle/domain";

export interface PageReferenceRequest {
  pageId: string;
  title: string;
  elementId: string;
  versionNonce: number;
}

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

/**
 * A labelled rectangle standing in for a page. Excalidraw fills in the rest of
 * the element from this skeleton, which is why the shape stays this small.
 * Cards are laid out two per row so a busy canvas does not stack them.
 */
export function pageReferenceSkeleton(
  request: PageReferenceRequest,
  index: number,
): Record<string, unknown> {
  return {
    type: "rectangle",
    id: request.elementId,
    versionNonce: request.versionNonce,
    x: 24 + (index % 2) * 260,
    y: 24 + Math.floor(index / 2) * 140,
    width: 220,
    height: 100,
    label: { text: request.title },
    customData: { girafflePageId: request.pageId },
  };
}
