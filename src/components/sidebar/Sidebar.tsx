"use client";

import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import Image from "next/image";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/sidebar/CommandPalette";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { Button } from "@/components/ui/Button";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { cn } from "@/lib/utils";
import {
  archiveNoteAction,
  createNoteAction,
  moveNoteAction,
  relocateNoteAction,
  updateNoteAction,
} from "@/server/api/notes";
import {
  DEFAULT_COLLAPSED_SECTIONS,
  DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_COMPACT_STORAGE_KEY,
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  type SidebarCollapseState,
} from "@/lib/workspace-preferences";
import {
  isSidebarPageDragData,
  isSidebarPageDropData,
  type SidebarMenuState,
  type SidebarPageDropTarget,
  type SidebarProps,
} from "./sidebar.types";
import {
  areSidebarCollapseStatesEqual,
  clampSidebarWidth,
  countPages,
  extractActiveNoteId,
  filterPageTree,
  flattenPageTree,
  loadSidebarCollapseState,
  loadSidebarCompactState,
  loadSidebarWidth,
} from "./sidebar.utils";
import { SidebarGroup } from "./SidebarGroup";
import type { SidebarGroupAction } from "./SidebarGroup";
import { SidebarPageRow } from "./SidebarPageRow";
import { encodeMaterialSymbol } from "./sidebar-icon-utils";

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
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FileNewIcon() {
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
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function ChevronLeftIcon() {
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
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function Sidebar({ pages, activeNoteId }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const teardownResizeRef = useRef<(() => void) | null>(null);
  const isMobileViewport = useIsMobileViewport(900);

  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [pageDropTarget, setPageDropTarget] =
    useState<SidebarPageDropTarget | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  );
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [collapsedSections, setCollapsedSections] =
    useState<SidebarCollapseState>(DEFAULT_COLLAPSED_SECTIONS);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pageTreeRef = useRef<HTMLDivElement | null>(null);

  const normalizedPaletteQuery = paletteQuery.trim().toLowerCase();
  const currentNoteId =
    activeNoteId ?? extractActiveNoteId(pathname) ?? undefined;
  const effectiveIsSidebarCompact = !isMobileViewport && isSidebarCompact;
  const shouldShowSidebarPanel = !isMobileViewport || isMobileSidebarOpen;

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const navigateToNote = useCallback(
    (noteId: string) => {
      router.push(`/notes/${noteId}`);
    },
    [router],
  );
  const openPalette = useCallback((initialQuery = "") => {
    setPaletteQuery(initialQuery);
    setIsPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => {
    setIsPaletteOpen(false);
    setPaletteQuery("");
  }, []);

  const openContextMenuAtPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
      event.preventDefault();
      const position = { x: event.clientX, y: event.clientY };
      setContextMenu({ position, items });
    },
    [],
  );

  const openContextMenuFromTrigger = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, items: ContextMenuItem[]) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const position = { x: rect.right - 14, y: rect.bottom + 8 };
      setContextMenu({ position, items });
    },
    [],
  );

  const copyInternalLink = useCallback(async (path: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
  }, []);

  const togglePagesSection = useCallback(() => {
    setCollapsedSections((current) => ({ pages: !current.pages }));
  }, []);

  const toggleSidebarCompact = useCallback(
    () => setIsSidebarCompact((v) => !v),
    [],
  );
  const toggleMobileSidebar = useCallback(
    () => setIsMobileSidebarOpen((v) => !v),
    [],
  );

  // Load preferences from localStorage
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const nextWidth = loadSidebarWidth();
      const nextCompact = loadSidebarCompactState();
      const nextSections = loadSidebarCollapseState();
      setSidebarWidth((w) => (w === nextWidth ? w : nextWidth));
      setIsSidebarCompact((c) => (c === nextCompact ? c : nextCompact));
      setCollapsedSections((s) =>
        areSidebarCollapseStatesEqual(s, nextSections) ? s : nextSections,
      );
      setHasLoadedPreferences(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (!isMobileViewport) {
        setIsMobileSidebarOpen(false);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isMobileViewport]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsMobileSidebarOpen(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [pathname]);

  // Persist collapsed sections
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsedSections),
    );
  }, [collapsedSections, hasLoadedPreferences]);

  // Persist sidebar width
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [hasLoadedPreferences, sidebarWidth]);

  // Persist compact state
  useEffect(() => {
    if (!hasLoadedPreferences) return;
    localStorage.setItem(
      SIDEBAR_COMPACT_STORAGE_KEY,
      JSON.stringify(isSidebarCompact),
    );
  }, [hasLoadedPreferences, isSidebarCompact]);

  // Sync CSS variable for sidebar width
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth}px`,
    );
  }, [isSidebarCompact, sidebarWidth]);

  // Teardown resize listeners on unmount
  useEffect(
    () => () => {
      teardownResizeRef.current?.();
    },
    [],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (typeof window === "undefined") return;
      const startX = event.clientX;
      const initialWidth = sidebarWidth;
      if (isSidebarCompact) setIsSidebarCompact(false);
      setIsSidebarResizing(true);
      const handleMove = (e: MouseEvent) =>
        setSidebarWidth(clampSidebarWidth(initialWidth + (e.clientX - startX)));
      const handleUp = () => {
        setIsSidebarResizing(false);
        teardownResizeRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      teardownResizeRef.current = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [isSidebarCompact, sidebarWidth],
  );

  // Note actions
  const handleCreateNote = useCallback(async () => {
    const noteId = await createNoteAction();
    router.push(`/notes/${noteId}`);
    router.refresh();
  }, [router]);

  const handleCreateChildPage = useCallback(
    async (parentId: string) => {
      const noteId = await createNoteAction({ parentId });
      router.push(`/notes/${noteId}`);
      router.refresh();
    },
    [router],
  );

  // Context menus
  const buildNoteMenu = useCallback(
    (note: {
      id: string;
      title: string;
      icon?: string | null;
      isPinned?: boolean;
      parentId?: string | null;
    }): ContextMenuItem[] => [
      {
        label: "Open note",
        tooltip: "Open the selected note in the editor",
        onSelect: () => navigateToNote(note.id),
      },
      {
        label: "Add page inside",
        tooltip: "Create a new page nested under this one",
        onSelect: () => handleCreateChildPage(note.id),
      },
      {
        label: "Move to top level",
        tooltip: "Detach the page from its parent",
        disabled: !note.parentId,
        onSelect: async () => {
          await updateNoteAction(note.id, { parentId: null });
          router.refresh();
        },
      },
      {
        label: note.isPinned ? "Unpin" : "Pin",
        tooltip: "Keep the note at the top of ordered lists or release it",
        onSelect: async () => {
          await updateNoteAction(note.id, { isPinned: !note.isPinned });
          router.refresh();
        },
      },
      {
        label: "Move up",
        tooltip: "Move the note up by one position",
        onSelect: async () => {
          await moveNoteAction(note.id, "up");
          router.refresh();
        },
      },
      {
        label: "Move down",
        tooltip: "Move the note down by one position",
        onSelect: async () => {
          await moveNoteAction(note.id, "down");
          router.refresh();
        },
      },
      {
        label: "Copy note link",
        tooltip: "Copy the internal note address to the clipboard",
        onSelect: () => copyInternalLink(`/notes/${note.id}`),
      },
      {
        label: "Move to archive",
        tooltip: "Remove the note from active lists",
        tone: "danger" as const,
        onSelect: async () => {
          await archiveNoteAction(note.id);
          if (currentNoteId === note.id) router.push("/notes");
          router.refresh();
        },
      },
    ],
    [
      copyInternalLink,
      currentNoteId,
      handleCreateChildPage,
      navigateToNote,
      router,
    ],
  );

  useEffect(() => {
    if (!pageTreeRef.current) {
      return;
    }

    return combine(
      // Empty space below the tree drops a page back to the top level.
      dropTargetForElements({
        element: pageTreeRef.current,
        canDrop: ({ source }) => isSidebarPageDragData(source.data),
        getData: () => ({
          type: "sidebar-page-drop-target",
          mode: "root",
          parentId: null,
          afterNoteId: null,
          pageId: null,
        }),
      }),
      monitorForElements({
        canMonitor: ({ source }) => isSidebarPageDragData(source.data),
        onDragStart: ({ source }) => {
          if (isSidebarPageDragData(source.data)) {
            setDraggedPageId(source.data.pageId);
          }
        },
        onDropTargetChange: ({ location }) => {
          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isSidebarPageDropData(currentTarget)) {
            setPageDropTarget(null);
            return;
          }

          setPageDropTarget({
            pageId: currentTarget.pageId,
            mode: currentTarget.mode,
          });
        },
        onDrop: async ({ source, location }) => {
          setDraggedPageId(null);
          setPageDropTarget(null);

          if (!isSidebarPageDragData(source.data)) {
            return;
          }

          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isSidebarPageDropData(currentTarget)) {
            return;
          }

          if (currentTarget.pageId === source.data.pageId) {
            return;
          }

          await relocateNoteAction(source.data.pageId, {
            parentId: currentTarget.parentId,
            afterNoteId: currentTarget.afterNoteId,
          });

          router.refresh();
        },
      }),
    );
  }, [router]);

  // Derived / filtered data
  const flattenedPages = useMemo(() => flattenPageTree(pages), [pages]);

  const deferredSearchQuery = useDeferredValue(paletteQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  const visiblePages = useMemo(
    () => (hasQuery ? filterPageTree(pages, normalizedQuery) : pages),
    [hasQuery, normalizedQuery, pages],
  );

  // Ancestors of the open page stay expanded so the active row is reachable.
  const ancestorsOfActive = useMemo(() => {
    const byId = new Map(flattenedPages.map((page) => [page.id, page]));
    const ancestors = new Set<string>();
    let current = currentNoteId ? byId.get(currentNoteId) : undefined;

    while (current?.parentId) {
      if (ancestors.has(current.parentId)) break;
      ancestors.add(current.parentId);
      current = byId.get(current.parentId);
    }

    return ancestors;
  }, [currentNoteId, flattenedPages]);

  // Palette items
  const paletteItems = useMemo<CommandPaletteItem[]>(() => {
    const actionItems: CommandPaletteItem[] = [
      {
        id: "action-new-note",
        group: "Quick actions",
        title: "Create new note",
        description: "Open a blank note",
        icon: encodeMaterialSymbol("add"),
        hint: "Enter",
        onSelect: async () => {
          const id = await createNoteAction();
          navigateToNote(id);
        },
      },
      {
        id: "action-savanna",
        group: "Navigation",
        title: "Savanna",
        description: "Open free-form infinite canvas",
        icon: encodeMaterialSymbol("landscape"),
        onSelect: async () => {
          router.push("/savanna");
        },
      },
      {
        id: "action-notes",
        group: "Navigation",
        title: "Go to notes",
        description: "Browse all notes",
        icon: encodeMaterialSymbol("description"),
        onSelect: async () => {
          router.push("/notes");
        },
      },
      {
        id: "action-stride",
        group: "Navigation",
        title: "Stride — Calendar",
        description: "Open the Stride todo calendar view",
        icon: encodeMaterialSymbol("calendar_month"),
        onSelect: async () => {
          router.push("/stride");
        },
      },
      {
        id: "action-trek",
        group: "Navigation",
        title: "Trek — Kanban boards",
        description: "Open Trek kanban boards",
        icon: encodeMaterialSymbol("view_kanban"),
        onSelect: async () => {
          router.push("/kanban");
        },
      },
      {
        id: "action-search",
        group: "Navigation",
        title: "Open search workspace",
        description: "Filtered search page",
        icon: encodeMaterialSymbol("search"),
        onSelect: async () => {
          router.push("/search");
        },
      },
      {
        id: "action-settings",
        group: "Navigation",
        title: "Settings",
        description: "Open app settings",
        icon: encodeMaterialSymbol("settings"),
        onSelect: async () => {
          router.push("/settings");
        },
      },
      {
        id: "action-account",
        group: "Navigation",
        title: "Account",
        description: "Profile and password settings",
        icon: encodeMaterialSymbol("account_circle"),
        onSelect: async () => {
          router.push("/account");
        },
      },
    ];

    const noteItems = flattenedPages
      .filter(
        (n) =>
          !normalizedPaletteQuery ||
          n.title.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((n) => ({
        id: `note-${n.id}`,
        group: "Pages",
        title: n.title,
        description: "Open the page in the editor",
        icon: n.icon ?? encodeMaterialSymbol("description"),
        onSelect: async () => {
          navigateToNote(n.id);
        },
      }));

    if (!normalizedPaletteQuery) return [...actionItems, ...noteItems];

    const filteredActions = actionItems.filter((item) =>
      `${item.title} ${item.description}`
        .toLowerCase()
        .includes(normalizedPaletteQuery),
    );
    return [...filteredActions, ...noteItems];
  }, [
    flattenedPages,
    navigateToNote,
    normalizedPaletteQuery,
    router,
  ]);

  const pageGroupActions = useMemo<SidebarGroupAction[]>(
    () => [
      {
        icon: <FileNewIcon />,
        label: "New page",
        onClick: () => void handleCreateNote(),
      },
    ],
    [handleCreateNote],
  );

  const isPagesCollapsed = hasQuery ? false : collapsedSections.pages;
  const pageCount = countPages(pages);
  const pageCountLabel = pageCount > 0 ? String(pageCount) : undefined;

  return (
    <aside
      className={cn(
        "md-nav-drawer md-nav-drawer--giraffle-sidebar sidebar",
        effectiveIsSidebarCompact && "md-nav-drawer--compact compact",
        isSidebarResizing && "md-nav-drawer--resizing",
        isMobileViewport && "sidebar-mobile",
        isMobileSidebarOpen && "mobile-open"
      )}
      style={{
        width: isMobileViewport
          ? "100%"
          : effectiveIsSidebarCompact
            ? SIDEBAR_COMPACT_WIDTH
            : sidebarWidth,
        transition:
          isMobileViewport || isSidebarResizing
            ? "none"
            : "width var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard)",
      }}
    >
      {effectiveIsSidebarCompact ? (
        <div className="sidebar-compact-shell">
          <div className="sidebar-compact-stack">
            <button
              type="button"
              className="sidebar-compact-button sidebar-compact-brand"
              onClick={toggleSidebarCompact}
              aria-label="Expand sidebar"
            >
              <Image
                src="/apple-icon.png"
                alt="Giraffe"
                width={24}
                height={24}
              />
            </button>
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={() => openPalette()}
              aria-label="Open command palette"
            >
              <span className="material-symbols-outlined sm" aria-hidden="true">
                &#xE8B6;
              </span>
            </button>
            <button
              type="button"
              className="sidebar-compact-button"
              onClick={handleCreateNote}
              aria-label="Create new note"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div
            className="sidebar-topbar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px 8px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                minWidth: 0,
                flex: 1,
              }}
            >
              {isMobileViewport ? (
                <Button
                  variant="text"
                  icon
                  onClick={toggleMobileSidebar}
                  aria-label={
                    isMobileSidebarOpen
                      ? "Close side menu"
                      : "Open side menu"
                  }
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    {isMobileSidebarOpen ? "close" : "menu"}
                  </span>
                </Button>
              ) : null}
              <div
                className="sidebar-workspace-card"
                onClick={() => router.push("/notes")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                }}
              >
                <div
                  className="sidebar-workspace-logo"
                  style={{
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderRadius: "var(--md-sys-shape-small)",
                  }}
                >
                  <Image
                    src="/apple-icon.png"
                    alt="Giraffe"
                    width={28}
                    height={28}
                  />
                </div>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--md-sys-color-on-surface)",
                  }}
                >
                  Giraffe
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
              {isMobileViewport ? <ThemeSelector mobileInline /> : null}
              <Button
                variant="text"
                icon
                onClick={handleCreateNote}
                aria-label="Create new page"
              >
                <PlusIcon />
              </Button>
              {isMobileViewport ? null : (
                <Button
                  variant="text"
                  icon
                  onClick={toggleSidebarCompact}
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeftIcon />
                </Button>
              )}
            </div>
          </div>

          {shouldShowSidebarPanel ? (
            <div className="sidebar-mobile-panel">
              {/* Search */}
              <div style={{ padding: "0 10px 8px" }}>
                <button
                  type="button"
                  className="sidebar-search-trigger"
                  onClick={() => openPalette()}
                  aria-label="Search or command palette"
                >
                  <span
                    className="material-symbols-outlined sm"
                    aria-hidden="true"
                  >
                    &#xE8B6;
                  </span>
                  <kbd className="sidebar-search-kbd">⌘K</kbd>
                </button>
              </div>

              {/* Scrollable content */}
              <div
                className="md-nav-drawer-content"
                style={{ padding: "0 8px" }}
              >
                {/* Primary nav */}
                <div className="sidebar-primary-nav">
                  {(
                    [
                      {
                        path: "/notes",
                        icon: "description",
                        label: "All notes",
                      },
                      {
                        path: "/savanna",
                        icon: "landscape",
                        label: "Savanna",
                      },
                      {
                        path: "/kanban",
                        icon: "view_kanban",
                        label: "Trek",
                      },
                      {
                        path: "/stride",
                        icon: "calendar_month",
                        label: "Stride",
                      },
                      {
                        path: "/tower-matrix",
                        icon: "grid_4x4",
                        label: "Tower Matrix",
                      },
                    ] as Array<{
                      path: string;
                      icon: string;
                      label: string;
                    }>
                  ).map(({ path, icon, label }) => (
                    <button
                      key={path}
                      className={`sidebar-item${pathname === path ? " active" : ""}`}
                      onClick={() => router.push(path)}
                    >
                      <span className="sidebar-item-icon" aria-hidden="true">
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: "16px", lineHeight: 1 }}
                        >
                          {icon}
                        </span>
                      </span>
                      <span className="sidebar-item-label">{label}</span>
                    </button>
                  ))}

                </div>

                <div className="sidebar-divider" />

                {/* Every page lives in one tree; a page nests inside another page. */}
                <SidebarGroup
                  label="Pages"
                  meta={pageCountLabel}
                  collapsed={isPagesCollapsed}
                  showChevron
                  onToggle={togglePagesSection}
                  actions={pageGroupActions}
                >
                  <div ref={pageTreeRef} className="sidebar-folder-tree">
                    {visiblePages.map((page) => (
                      <SidebarPageRow
                        key={page.id}
                        page={page}
                        depth={0}
                        activeNoteId={currentNoteId}
                        ancestorsOfActive={ancestorsOfActive}
                        draggedPageId={draggedPageId}
                        dropTarget={pageDropTarget}
                        onOpen={navigateToNote}
                        onCreateChild={(parentId) =>
                          void handleCreateChildPage(parentId)
                        }
                        onContextMenuOpen={(event, selectedPage) =>
                          openContextMenuAtPointer(
                            event,
                            buildNoteMenu(selectedPage),
                          )
                        }
                        onTriggerMenuOpen={(event, selectedPage) =>
                          openContextMenuFromTrigger(
                            event,
                            buildNoteMenu(selectedPage),
                          )
                        }
                      />
                    ))}
                    {visiblePages.length === 0 ? (
                      <div className="sidebar-empty">
                        {hasQuery
                          ? "No matching pages."
                          : "No pages yet. Create your first page."}
                      </div>
                    ) : null}
                  </div>
                </SidebarGroup>
              </div>

            </div>
          ) : null}
        </>
      )}
      {!effectiveIsSidebarCompact && !isMobileViewport ? (
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleSidebarResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      ) : null}

      {isMobileViewport && isMobileSidebarOpen ? (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Close side menu"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      ) : null}


      <ContextMenu
        items={contextMenu?.items ?? []}
        position={contextMenu?.position ?? null}
        onClose={closeContextMenu}
      />
      <CommandPalette
        open={isPaletteOpen}
        query={paletteQuery}
        items={paletteItems}
        onQueryChange={setPaletteQuery}
        onClose={closePalette}
      />
    </aside>
  );
}
