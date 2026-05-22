"use client";

import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { createNoteAction } from "@/server/api/notes";
import {
  DEFAULT_KIND_ICON,
  editorTabsStore,
  useEditorTabs,
  type EditorTab,
} from "./editor-tabs-store";

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function deriveActiveKey(
  pathname: string | null,
  search: URLSearchParams | null,
): string | null {
  if (!pathname) return null;
  const noteMatch = pathname.match(/^\/notes\/([^/?#]+)/);
  if (noteMatch) return `note:${decodeURIComponent(noteMatch[1])}`;
  const savannaMatch = pathname.match(/^\/savanna\/([^/?#]+)/);
  if (savannaMatch) return `savanna:${decodeURIComponent(savannaMatch[1])}`;
  if (pathname === "/spotter") {
    const session = search?.get("session");
    return session ? `spotter:${session}` : null;
  }
  return null;
}

interface ContextMenuState {
  key: string;
  x: number;
  y: number;
}

export function EditorTabs() {
  const { tabs, activeKey } = useEditorTabs();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => deriveActiveKey(pathname, searchParams),
    [pathname, searchParams],
  );
  const effectiveActiveKey = routeKey ?? activeKey;
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [, startTransition] = useTransition();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (routeKey && routeKey !== activeKey) {
      editorTabsStore.setActive(routeKey);
    }
  }, [routeKey, activeKey]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [effectiveActiveKey]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [contextMenu]);

  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const el = contextMenuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (x + rect.width + margin > window.innerWidth) {
      x = window.innerWidth - rect.width - margin;
    }
    if (y + rect.height + margin > window.innerHeight) {
      y = window.innerHeight - rect.height - margin;
    }
    el.style.left = `${Math.max(margin, x)}px`;
    el.style.top = `${Math.max(margin, y)}px`;
  }, [contextMenu]);

  const openTab = useCallback(
    (tab: EditorTab) => {
      if (tab.key === routeKey) return;
      router.push(tab.href);
    },
    [routeKey, router],
  );

  const closeTab = useCallback(
    (key: string, e?: ReactMouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      const target = editorTabsStore.getTabs().find((t) => t.key === key);
      if (target?.pinned) return;
      const wasActive = (routeKey ?? activeKey) === key;
      const { next } = editorTabsStore.closeTab(key);
      if (wasActive) {
        router.push(next ? next.href : "/spotter");
      }
    },
    [activeKey, routeKey, router],
  );

  const onMouseDown = useCallback(
    (e: ReactMouseEvent, key: string) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(key);
      }
    },
    [closeTab],
  );

  const onContextMenu = useCallback(
    (e: ReactMouseEvent, key: string) => {
      e.preventDefault();
      setContextMenu({ key, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const onDragStart = useCallback(
    (e: DragEvent<HTMLElement>, key: string) => {
      setDragKey(key);
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", key);
      } catch {}
    },
    [],
  );

  const onDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (!dragKey) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [dragKey],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>, overKey: string) => {
      e.preventDefault();
      if (!dragKey || dragKey === overKey) {
        setDragKey(null);
        return;
      }
      const targetIdx = tabs.findIndex((t) => t.key === overKey);
      if (targetIdx === -1) {
        setDragKey(null);
        return;
      }
      editorTabsStore.reorderTab(dragKey, targetIdx);
      setDragKey(null);
    },
    [dragKey, tabs],
  );

  const onDragEnd = useCallback(() => setDragKey(null), []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (e.deltaY === 0) return;
    el.scrollLeft += e.deltaY;
  }, []);

  const handleNewNote = useCallback(() => {
    startTransition(async () => {
      const id = await createNoteAction();
      router.push(`/notes/${id}`);
    });
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "w" && !e.altKey) {
        const target = editorTabsStore.getActiveKey();
        if (!target) return;
        const targetTab = editorTabsStore.getTabs().find((t) => t.key === target);
        if (targetTab?.pinned) return;
        e.preventDefault();
        e.stopPropagation();
        const wasActive = target === routeKey;
        const { next } = editorTabsStore.closeTab(target);
        if (wasActive) router.push(next ? next.href : "/spotter");
        return;
      }

      if (key === "t" && e.shiftKey) {
        const restored = editorTabsStore.popClosed();
        if (!restored) return;
        e.preventDefault();
        editorTabsStore.openTab(restored);
        router.push(restored.href);
        return;
      }

      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const current = editorTabsStore.getTabs();
        if (current.length < 2) return;
        const aKey = editorTabsStore.getActiveKey();
        const idx = current.findIndex((t) => t.key === aKey);
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const nextIdx = (idx + dir + current.length) % current.length;
        const next = current[nextIdx];
        if (!next) return;
        e.preventDefault();
        router.push(next.href);
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        const current = editorTabsStore.getTabs();
        const i = Number(e.key) - 1;
        if (i >= current.length) return;
        e.preventDefault();
        router.push(current[i].href);
      }
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () =>
      document.removeEventListener(
        "keydown",
        onKey,
        { capture: true } as AddEventListenerOptions,
      );
  }, [routeKey, router]);

  if (tabs.length === 0) {
    return (
      <div className="editor-tabs editor-tabs-empty" aria-label="Tabs">
        <button
          type="button"
          className="editor-tabs-action"
          title="New note"
          aria-label="New note"
          onClick={handleNewNote}
        >
          <PlusIcon />
        </button>
      </div>
    );
  }

  const menuTab = contextMenu
    ? tabs.find((t) => t.key === contextMenu.key)
    : null;
  const hasNonPinned = tabs.some((t) => !t.pinned);

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open tabs">
      <div
        className="editor-tabs-scroller"
        ref={scrollerRef}
        onWheel={onWheel}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === effectiveActiveKey;
          const iconValue = tab.icon ?? DEFAULT_KIND_ICON[tab.kind];
          return (
            <div
              key={tab.key}
              ref={isActive ? activeTabRef : undefined}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              draggable
              className={`editor-tab editor-tab-${tab.kind}${
                isActive ? " active" : ""
              }${dragKey === tab.key ? " dragging" : ""}${
                tab.pinned ? " pinned" : ""
              }`}
              onClick={() => openTab(tab)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openTab(tab);
                }
              }}
              onAuxClick={(e) => onMouseDown(e, tab.key)}
              onMouseDown={(e) => onMouseDown(e, tab.key)}
              onContextMenu={(e) => onContextMenu(e, tab.key)}
              onDragStart={(e) => onDragStart(e, tab.key)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, tab.key)}
              onDragEnd={onDragEnd}
              title={tab.title || "Untitled"}
            >
              <span className="editor-tab-icon" aria-hidden="true">
                {renderStoredIcon(iconValue, {
                  fallback: (
                    <span
                      className="material-symbols-outlined sm"
                      aria-hidden="true"
                    >
                      {DEFAULT_KIND_ICON[tab.kind]}
                    </span>
                  ),
                })}
              </span>
              <span className="editor-tab-label">
                {tab.title || "Untitled"}
              </span>
              {tab.pinned ? (
                <span className="editor-tab-pin" aria-label="Pinned">
                  <PinIcon />
                </span>
              ) : (
                <button
                  type="button"
                  className={`editor-tab-close${tab.dirty ? " has-dirty" : ""}`}
                  aria-label={`Close ${tab.title || "Untitled"}`}
                  onClick={(e) => closeTab(tab.key, e)}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {tab.dirty ? (
                    <span className="editor-tab-dirty-dot" aria-label="Unsaved" />
                  ) : null}
                  <CloseIcon />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="editor-tabs-action"
        title="New note"
        aria-label="New note"
        onClick={handleNewNote}
      >
        <PlusIcon />
      </button>

      {contextMenu && menuTab ? (
        <div
          ref={contextMenuRef}
          role="menu"
          className="editor-tabs-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!!menuTab.pinned}
            onClick={() => {
              closeTab(contextMenu.key);
              setContextMenu(null);
            }}
          >
            Close
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasNonPinned}
            onClick={() => {
              editorTabsStore.closeOthers(contextMenu.key);
              const targetHref = menuTab.href;
              router.push(targetHref);
              setContextMenu(null);
            }}
          >
            Close Others
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasNonPinned}
            onClick={() => {
              editorTabsStore.closeAll();
              const remaining = editorTabsStore.getTabs();
              router.push(remaining[0]?.href ?? "/spotter");
              setContextMenu(null);
            }}
          >
            Close All
          </button>
          <div className="editor-tabs-context-divider" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              editorTabsStore.togglePin(contextMenu.key);
              setContextMenu(null);
            }}
          >
            {menuTab.pinned ? "Unpin" : "Pin"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
