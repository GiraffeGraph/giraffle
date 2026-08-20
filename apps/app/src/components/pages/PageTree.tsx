import { pageAncestors, type Id, type Page } from "@giraffle/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { DragSortItem, DragSortProvider, useDragSort, type DropTarget } from "@/components/dnd/DragSortContext";
import { PageTreeRow } from "@/components/pages/PageTreeRow";

export interface PageMove {
  pageId: Id;
  parentId: Id | null;
  afterPageId: Id | null;
}

interface FlatRow {
  page: Page;
  depth: number;
  hasChildren: boolean;
}

/**
 * Flattens the visible part of the tree: collapsed branches contribute their
 * row but not their children.
 */
function flatten(
  pages: Page[],
  parentId: Id | null,
  depth: number,
  expanded: ReadonlySet<Id>,
): FlatRow[] {
  return pages
    .filter((page) => (page.parentId ?? null) === parentId)
    .flatMap((page) => {
      const children = pages.filter((candidate) => candidate.parentId === page.id);
      const row: FlatRow = { page, depth, hasChildren: children.length > 0 };

      return expanded.has(page.id)
        ? [row, ...flatten(pages, page.id, depth + 1, expanded)]
        : [row];
    });
}

function subtreeIds(pages: Page[], pageId: Id): Id[] {
  const ids: Id[] = [];
  let frontier = [pageId];

  while (frontier.length > 0) {
    const children = pages.filter((page) => page.parentId && frontier.includes(page.parentId));
    frontier = children.map((child) => child.id);
    ids.push(...frontier);
  }

  return ids;
}

export function PageTree(props: {
  pages: Page[];
  activePageId?: Id;
  onOpen(pageId: Id): void;
  onAddChild(parentId: Id): void;
  onOpenMenu(page: Page): void;
  onMove(move: PageMove): void;
}) {
  return (
    <DragSortProvider>
      <PageTreeBody {...props} />
    </DragSortProvider>
  );
}

function PageTreeBody({
  pages,
  activePageId,
  onOpen,
  onAddChild,
  onOpenMenu,
  onMove,
}: {
  pages: Page[];
  activePageId?: Id;
  onOpen(pageId: Id): void;
  onAddChild(parentId: Id): void;
  onOpenMenu(page: Page): void;
  onMove(move: PageMove): void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<Id>>(() => new Set<Id>());
  const drag = useDragSort();
  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  // Opening a nested page from search or a link has to reveal it in the tree.
  // Only the active page drives this, so a branch closed by hand stays closed
  // while its pages are edited.
  useEffect(() => {
    if (!activePageId) return;
    const trail = pageAncestors(pagesRef.current, activePageId).map((crumb) => crumb.id);
    if (!trail.length) return;
    setExpanded((current) => {
      if (trail.every((id) => current.has(id))) return current;
      const next = new Set(current);
      for (const id of trail) next.add(id);
      return next;
    });
  }, [activePageId]);

  const rows = useMemo(
    () => flatten(pages, null, 0, expanded),
    [expanded, pages],
  );

  const toggle = useCallback((pageId: Id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    (sourceId: Id, target: DropTarget) => {
      const dropped = pages.find((page) => page.id === target.id);
      if (!dropped || dropped.id === sourceId) return;

      if (target.zone === "inside") {
        onMove({ pageId: sourceId, parentId: dropped.id, afterPageId: null });
        setExpanded((current) => new Set(current).add(dropped.id));
        return;
      }

      const siblings = pages.filter(
        (page) => (page.parentId ?? null) === (dropped.parentId ?? null),
      );
      const index = siblings.findIndex((page) => page.id === dropped.id);
      const afterPage = target.zone === "after" ? dropped : siblings[index - 1];

      onMove({
        pageId: sourceId,
        parentId: dropped.parentId ?? null,
        afterPageId: afterPage?.id ?? null,
      });
    },
    [onMove, pages],
  );

  return (
    <View>
      {rows.map((row) => (
        <DragSortItem
          key={row.page.id}
          id={row.page.id}
          blockedIds={subtreeIds(pages, row.page.id)}
          onDrop={handleDrop}
        >
          <PageTreeRow
            page={row.page}
            depth={row.depth}
            hasChildren={row.hasChildren}
            expanded={expanded.has(row.page.id)}
            dragging={drag.draggingId === row.page.id}
            dropZone={drag.target?.id === row.page.id ? drag.target.zone : null}
            {...(activePageId ? { activePageId } : {})}
            onToggle={() => toggle(row.page.id)}
            onOpen={onOpen}
            onAddChild={onAddChild}
            onOpenMenu={onOpenMenu}
          />
        </DragSortItem>
      ))}
    </View>
  );
}
