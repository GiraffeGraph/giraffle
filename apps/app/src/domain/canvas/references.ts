import type { CanvasElement, Id } from "../models";

export interface CanvasReference { elementId: Id; pageId: Id }

export function extractCanvasReferences(elements: readonly CanvasElement[]): CanvasReference[] {
  const references = new Map<string, CanvasReference>();
  for (const element of elements) {
    const pageId = element.customData?.girafflePageId;
    if (!element.isDeleted && pageId) references.set(element.id, { elementId: element.id, pageId });
  }
  return [...references.values()].sort((a, b) => a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0);
}
