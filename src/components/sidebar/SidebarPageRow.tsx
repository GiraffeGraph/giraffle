"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isSidebarPageDragData, type SidebarPage, type SidebarPageDropTarget } from "./sidebar.types";
import { renderStoredIcon } from "./sidebar-icon-utils";

function MoreHorizontalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

const PAGE_DRAG_TYPE = "application/coat-note";
const PAGE_DRAG_META_TYPE = "application/coat-note-meta";
const INDENT_STEP_PX = 12;

export function SidebarPageRow({
  page,
  depth,
  activeNoteId,
  ancestorsOfActive,
  draggedPageId,
  dropTarget,
  onOpen,
  onCreateChild,
  onContextMenuOpen,
  onTriggerMenuOpen,
}: {
  page: SidebarPage;
  depth: number;
  activeNoteId?: string;
  ancestorsOfActive: ReadonlySet<string>;
  draggedPageId: string | null;
  dropTarget: SidebarPageDropTarget | null;
  onOpen: (noteId: string) => void;
  onCreateChild: (parentId: string) => void;
  onContextMenuOpen: (event: ReactMouseEvent<HTMLElement>, page: SidebarPage) => void;
  onTriggerMenuOpen: (event: ReactMouseEvent<HTMLButtonElement>, page: SidebarPage) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const afterRef = useRef<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const isActive = page.id === activeNoteId;
  const hasChildren = page.children.length > 0;
  const containsActive = ancestorsOfActive.has(page.id);
  const showChildren = hasChildren && (isExpanded || containsActive);
  const isInsideTarget = dropTarget?.pageId === page.id && dropTarget.mode === "inside";
  const isAfterTarget = dropTarget?.pageId === page.id && dropTarget.mode === "after";

  useEffect(() => {
    const row = rowRef.current;
    const after = afterRef.current;

    if (!row || !after) {
      return;
    }

    return combine(
      draggable({
        element: row,
        getInitialData: () => ({
          type: "sidebar-page",
          pageId: page.id,
          parentId: page.parentId,
          isPinned: page.isPinned,
        }),
      }),
      dropTargetForElements({
        element: row,
        canDrop: ({ source }) =>
          isSidebarPageDragData(source.data) && source.data.pageId !== page.id,
        getData: () => ({
          type: "sidebar-page-drop-target",
          mode: "inside",
          parentId: page.id,
          afterNoteId: null,
          pageId: page.id,
        }),
      }),
      dropTargetForElements({
        element: after,
        canDrop: ({ source }) =>
          isSidebarPageDragData(source.data) && source.data.pageId !== page.id,
        getData: () => ({
          type: "sidebar-page-drop-target",
          mode: "after",
          parentId: page.parentId,
          afterNoteId: page.id,
          pageId: page.id,
        }),
      })
    );
  }, [page.id, page.isPinned, page.parentId]);

  return (
    <div className="sidebar-folder-node">
      <div
        ref={rowRef}
        className={`sidebar-entity-row${isActive ? " active" : ""}${
          isInsideTarget ? " drag-target" : ""
        }${isAfterTarget ? " drag-target-after" : ""}${
          draggedPageId === page.id ? " drag-source" : ""
        }`}
        style={{ paddingLeft: depth * INDENT_STEP_PX }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copyMove";
          event.dataTransfer.setData(PAGE_DRAG_TYPE, page.id);
          event.dataTransfer.setData(
            PAGE_DRAG_META_TYPE,
            JSON.stringify({ id: page.id, title: page.title, icon: page.icon })
          );
          event.dataTransfer.setData("text/plain", `note:${page.id}`);
        }}
      >
        <button
          type="button"
          className="sidebar-folder-icon-btn"
          onClick={() => setIsExpanded((value) => !value)}
          aria-label={showChildren ? `Collapse ${page.title}` : `Expand ${page.title}`}
          aria-expanded={showChildren}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            <span className="material-symbols-outlined sm" aria-hidden="true">
              {showChildren ? "expand_more" : "chevron_right"}
            </span>
          ) : (
            <span className="sidebar-tree-leaf" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={`sidebar-item sidebar-row-main${isActive ? " active" : ""}`}
          onClick={() => onOpen(page.id)}
          onContextMenu={(event) => onContextMenuOpen(event, page)}
        >
          <span className="sidebar-item-icon">
            {renderStoredIcon(page.icon, {
              fallback: (
                <span className="material-symbols-outlined sm" aria-hidden="true">
                  description
                </span>
              ),
            })}
          </span>
          <span className="sidebar-item-label">{page.title || "Untitled"}</span>
          {page.isPinned ? (
            <span className="sidebar-pin-indicator" aria-label="Pinned" title="Pinned">
              <PinIcon />
            </span>
          ) : null}
        </button>
        <div className="sidebar-row-actions">
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={() => {
              setIsExpanded(true);
              onCreateChild(page.id);
            }}
            aria-label={`Add a page inside ${page.title}`}
            title="Add a page inside"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => onTriggerMenuOpen(event, page)}
            aria-label={`${page.title} open menu`}
            title="Options"
          >
            <MoreHorizontalIcon />
          </button>
        </div>
      </div>
      <div ref={afterRef} className="sidebar-drop-gap" aria-hidden="true" />
      {showChildren ? (
        <div className="sidebar-folder-children">
          {page.children.map((child) => (
            <SidebarPageRow
              key={child.id}
              page={child}
              depth={depth + 1}
              activeNoteId={activeNoteId}
              ancestorsOfActive={ancestorsOfActive}
              draggedPageId={draggedPageId}
              dropTarget={dropTarget}
              onOpen={onOpen}
              onCreateChild={onCreateChild}
              onContextMenuOpen={onContextMenuOpen}
              onTriggerMenuOpen={onTriggerMenuOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
