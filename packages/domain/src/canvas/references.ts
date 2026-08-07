import type { CanvasElement, Id } from "../entities";

export interface CanvasReference { elementId: Id; pageId: Id }
export interface CanvasTaskReference { elementId: Id; taskId: Id }

/**
 * The page links a scene currently declares, keyed by element so a rebuilt
 * reference table is a pure function of the saved scene. Sorted by element id
 * so two devices writing the same scene produce the same rows.
 */
export function extractCanvasReferences(elements: readonly CanvasElement[]): CanvasReference[] {
  const references = new Map<string, CanvasReference>();
  for (const element of elements) {
    const pageId = element.customData?.girafflePageId;
    if (!element.isDeleted && pageId) references.set(element.id, { elementId: element.id, pageId });
  }
  return [...references.values()].sort((a, b) => a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0);
}

/** Canonical task links declared by a scene, rebuilt alongside page links. */
export function extractCanvasTaskReferences(
  elements: readonly CanvasElement[],
): CanvasTaskReference[] {
  const references = new Map<string, CanvasTaskReference>();
  for (const element of elements) {
    const taskId = element.customData?.giraffleTaskId;
    if (!element.isDeleted && taskId) {
      references.set(element.id, { elementId: element.id, taskId });
    }
  }
  return [...references.values()].sort((left, right) =>
    left.elementId < right.elementId ? -1 : left.elementId > right.elementId ? 1 : 0,
  );
}
