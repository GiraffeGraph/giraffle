import type { Id, Page } from "../entities";
import type { PageBreadcrumb } from "../note/note.types";

/**
 * Ancestors of a page, outermost first, excluding the page itself. The visited
 * set bounds the walk so a corrupted parent link cannot loop forever.
 */
export function pageAncestors(pages: Page[], pageId: Id): PageBreadcrumb[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const ancestors: PageBreadcrumb[] = [];
  const visited = new Set<Id>([pageId]);
  let currentId = byId.get(pageId)?.parentId ?? null;

  while (currentId && !visited.has(currentId)) {
    const parent = byId.get(currentId);
    if (!parent) break;
    visited.add(parent.id);
    ancestors.unshift({ id: parent.id, title: parent.title, icon: parent.icon });
    currentId = parent.parentId;
  }

  return ancestors;
}

/**
 * Pages that may become the parent of `pageId`: everything except the page
 * itself and its descendants, which would create a cycle.
 */
export function selectableParentPages(pages: Page[], pageId: Id): Page[] {
  const childrenByParent = new Map<Id, Page[]>();

  for (const page of pages) {
    if (!page.parentId) continue;
    const siblings = childrenByParent.get(page.parentId) ?? [];
    siblings.push(page);
    childrenByParent.set(page.parentId, siblings);
  }

  const blocked = new Set<Id>([pageId]);
  const frontier: Id[] = [pageId];

  while (frontier.length > 0) {
    const currentId = frontier.pop() as Id;

    for (const child of childrenByParent.get(currentId) ?? []) {
      if (blocked.has(child.id)) continue;
      blocked.add(child.id);
      frontier.push(child.id);
    }
  }

  return pages.filter((page) => !blocked.has(page.id));
}

/** Full ancestor label of a page, e.g. "Project / Research / Notes". */
export function pageLabel(pages: Page[], page: Page): string {
  return [...pageAncestors(pages, page.id).map((item) => item.title), page.title].join(" / ");
}
