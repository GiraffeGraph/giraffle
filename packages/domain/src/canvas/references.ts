import type { CanvasElement, Id } from "../entities";

export interface CanvasReference {
  elementId: Id;
  pageId: Id;
}

/** Canonical Page links declared by a scene, rebuilt atomically when it is saved. */
export function extractCanvasReferences(elements: readonly CanvasElement[]): CanvasReference[] {
  const references = new Map<string, CanvasReference>();
  for (const element of elements) {
    const pageId = element.customData?.girafflePageId;
    if (!element.isDeleted && pageId) {
      references.set(element.id, { elementId: element.id, pageId });
    }
  }
  return [...references.values()].sort((left, right) =>
    left.elementId < right.elementId ? -1 : left.elementId > right.elementId ? 1 : 0,
  );
}
