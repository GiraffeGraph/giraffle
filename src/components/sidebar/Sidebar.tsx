"use client";

import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import Image from "next/image";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/sidebar/CommandPalette";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { Button } from "@/components/ui/Button";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { cn } from "@/lib/utils";
import { createFolderAction, relocateFolderAction } from "@/server/api/folders";
import {
  archiveNoteAction,
  createNoteAction,
  moveNoteAction,
  relocateNoteAction,
  updateNoteAction,
} from "@/server/api/notes";
import {
  deleteAllSpotterSessionsAction,
  deleteSpotterSessionAction,
  renameSpotterSessionAction,
} from "@/server/api/spotter";
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
  isSidebarFolderDragData,
  isSidebarFolderDropData,
  isSidebarNoteDragData,
  isSidebarNoteDropData,
  type FolderDropTarget,
  type SidebarMenuState,
  type SidebarProps,
  type SidebarSectionKey,
} from "./sidebar.types";
import {
  areSidebarCollapseStatesEqual,
  clampSidebarWidth,
  extractActiveNoteId,
  filterFolderTree,
  flattenFolderTree,
  loadSidebarCollapseState,
  loadSidebarCompactState,
  loadSidebarWidth,
} from "./sidebar.utils";
import { SidebarGroup } from "./SidebarGroup";
import type { SidebarGroupAction } from "./SidebarGroup";
import { SidebarNoteRow } from "./SidebarNoteRow";
import { SidebarFolderItem } from "./SidebarFolderItem";
import { encodeMaterialSymbol } from "./sidebar-icon-utils";

type SpotterDialogState =
  | {
      type: "rename";
      session: { id: string; title: string };
    }
  | {
      type: "delete";
      session: { id: string; title: string };
    }
  | {
      type: "deleteAll";
      count: number;
    };

const sidebarSessionDateFormatter = new Intl.DateTimeFormat("tr", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function formatSidebarSessionDate(value: Date) {
  return sidebarSessionDateFormatter.format(new Date(value));
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

function MoreHorizontalIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

function FolderNewIcon() {
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
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

export function Sidebar({
  notes,
  folders,
  spotterSessions,
  activeNoteId,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teardownResizeRef = useRef<(() => void) | null>(null);
  const isMobileViewport = useIsMobileViewport(900);

  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] =
    useState<FolderDropTarget | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [noteDropTarget, setNoteDropTarget] = useState<{
    folderId: string | null;
    noteId: string | null;
    mode: "inside" | "after" | "root";
  } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  );
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [collapsedSections, setCollapsedSections] =
    useState<SidebarCollapseState>(DEFAULT_COLLAPSED_SECTIONS);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [spotterDialog, setSpotterDialog] = useState<SpotterDialogState | null>(null);
  const [spotterTitleDraft, setSpotterTitleDraft] = useState("");
  const [spotterSearchQuery, setSpotterSearchQuery] = useState("");
  const [isSpotterDialogSubmitting, setIsSpotterDialogSubmitting] = useState(false);
  const folderCreationHandledRef = useRef(false);
  const folderTreeRef = useRef<HTMLDivElement | null>(null);

  const normalizedPaletteQuery = paletteQuery.trim().toLowerCase();
  const currentNoteId =
    activeNoteId ?? extractActiveNoteId(pathname) ?? undefined;
  const activeSpotterSessionId =
    pathname === "/spotter" ? searchParams.get("session") : null;
  const effectiveIsSidebarCompact = !isMobileViewport && isSidebarCompact;
  const shouldShowSidebarPanel = !isMobileViewport || isMobileSidebarOpen;
  const normalizedSpotterSearchQuery = spotterSearchQuery.trim().toLowerCase();

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeSpotterDialog = useCallback(() => {
    if (isSpotterDialogSubmitting) {
      return;
    }

    setSpotterDialog(null);
    setSpotterTitleDraft("");
  }, [isSpotterDialogSubmitting]);
  const navigateToNote = useCallback(
    (noteId: string) => {
      const href = `/notes/${noteId}`;
      if (typeof window !== "undefined") {
        window.location.assign(href);
        return;
      }
      router.push(href);
    },
    [router],
  );
  const navigateToSpotterSession = useCallback(
    (sessionId: string) => {
      router.push(`/spotter?session=${sessionId}`);
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

  const toggleSection = useCallback((section: SidebarSectionKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
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

  useEffect(() => {
    if (collapsedSections.spotter && spotterSearchQuery.length > 0) {
      setSpotterSearchQuery("");
    }
  }, [collapsedSections.spotter, spotterSearchQuery]);

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
      if (spotterDialog && event.key === "Escape") {
        event.preventDefault();
        closeSpotterDialog();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeSpotterDialog, openPalette, spotterDialog]);

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
    navigateToNote(noteId);
  }, [navigateToNote]);

  const doCreateFolder = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const folderId = await createFolderAction({ name: trimmed });
      router.push(`/folders/${folderId}`);
    },
    [router],
  );

  const handleStartCreateFolder = useCallback(() => {
    setIsCreatingFolder(true);
    // Open the folders section if it is collapsed
    setCollapsedSections((s) => ({ ...s, folders: false }));
  }, []);

  const handleCreateNoteInFolder = useCallback(
    async (folderId: string) => {
      const noteId = await createNoteAction({ folderId });
      navigateToNote(noteId);
    },
    [navigateToNote],
  );

  const handleCreateSubFolder = useCallback(
    async (parentId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await createFolderAction({ name: trimmed, parentId });
      router.refresh();
    },
    [router],
  );

  const handleRelocateFolder = useCallback(
    async (
      folderId: string,
      placement: { parentId?: string | null; afterFolderId?: string | null },
    ) => {
      await relocateFolderAction(folderId, placement);
      setFolderDropTarget(null);
      setDraggedFolderId(null);
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
    }): ContextMenuItem[] => [
      {
        label: "Open note",
        hint: "Open the selected note in the editor",
        onSelect: () => navigateToNote(note.id),
      },
      {
        label: note.isPinned ? "Unpin" : "Pin",
        hint: "Keep the note at the top of ordered lists or release it",
        onSelect: async () => {
          await updateNoteAction(note.id, { isPinned: !note.isPinned });
          router.refresh();
        },
      },
      {
        label: "Move up",
        hint: "Move the note up by one position",
        onSelect: async () => {
          await moveNoteAction(note.id, "up");
          router.refresh();
        },
      },
      {
        label: "Move down",
        hint: "Move the note down by one position",
        onSelect: async () => {
          await moveNoteAction(note.id, "down");
          router.refresh();
        },
      },
      {
        label: "Copy note link",
        hint: "Copy the internal note address to the clipboard",
        onSelect: () => copyInternalLink(`/notes/${note.id}`),
      },
      {
        label: "Move to archive",
        hint: "Remove the note from active lists",
        tone: "danger" as const,
        onSelect: async () => {
          await archiveNoteAction(note.id);
          if (currentNoteId === note.id) router.push("/dashboard");
          router.refresh();
        },
      },
    ],
    [copyInternalLink, currentNoteId, navigateToNote, router],
  );

  const buildSpotterSessionMenu = useCallback(
    (session: { id: string; title: string }): ContextMenuItem[] => [
      {
        label: "Open chat",
        hint: "Open this Spotter session",
        onSelect: () => navigateToSpotterSession(session.id),
      },
      {
        label: "Rename chat",
        hint: "Change the title of this Spotter session",
        onSelect: () => {
          setSpotterTitleDraft(session.title);
          setSpotterDialog({ type: "rename", session });
        },
      },
      {
        label: "Delete chat",
        hint: "Permanently delete this Spotter session",
        tone: "danger",
        onSelect: () => {
          setSpotterDialog({ type: "delete", session });
        },
      },
    ],
    [navigateToSpotterSession],
  );

  const buildSpotterMenu = useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: "New chat",
        hint: "Start a fresh Spotter conversation",
        onSelect: () => router.push("/spotter"),
      },
    ];

    if (spotterSessions.length > 0) {
      items.push({
        label: "Delete all chats",
        hint: `Permanently delete all ${spotterSessions.length} Spotter sessions`,
        tone: "danger",
        onSelect: () => {
          setSpotterDialog({
            type: "deleteAll",
            count: spotterSessions.length,
          });
        },
      });
    }

    return items;
  }, [router, spotterSessions.length]);

  useEffect(() => {
    if (!folderTreeRef.current) {
      return;
    }

    return combine(
      dropTargetForElements({
        element: folderTreeRef.current,
        canDrop: ({ source }) =>
          isSidebarFolderDragData(source.data) ||
          isSidebarNoteDragData(source.data),
        getData: ({ source }) => {
          if (isSidebarNoteDragData(source.data)) {
            return {
              type: "sidebar-note-drop-target",
              folderId: null,
              mode: "root",
              afterNoteId: null,
              isPinned: source.data.isPinned,
            };
          }

          return {
            type: "sidebar-folder-drop-target",
            folderId: "__root__",
            mode: "root",
            parentId: null,
            afterFolderId: null,
          };
        },
      }),
      monitorForElements({
        canMonitor: ({ source }) => isSidebarFolderDragData(source.data),
        onDragStart: ({ source }) => {
          if (isSidebarFolderDragData(source.data)) {
            setDraggedFolderId(source.data.folderId);
          }
        },
        onDropTargetChange: ({ location }) => {
          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isSidebarFolderDropData(currentTarget)) {
            setFolderDropTarget(null);
            return;
          }

          if (currentTarget.mode === "root") {
            setFolderDropTarget({ folderId: "__root__", mode: "after" });
            return;
          }

          setFolderDropTarget({
            folderId: currentTarget.folderId,
            mode: currentTarget.mode,
          });
        },
        onDrop: async ({ source, location }) => {
          setDraggedFolderId(null);
          setFolderDropTarget(null);

          if (!isSidebarFolderDragData(source.data)) {
            return;
          }

          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isSidebarFolderDropData(currentTarget)) {
            return;
          }

          if (currentTarget.folderId === source.data.folderId) {
            return;
          }

          await handleRelocateFolder(source.data.folderId, {
            parentId: currentTarget.parentId,
            afterFolderId: currentTarget.afterFolderId,
          });
        },
      }),
    );
  }, [handleRelocateFolder]);

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => isSidebarNoteDragData(source.data),
      onDragStart: ({ source }) => {
        if (isSidebarNoteDragData(source.data)) {
          setDraggedNoteId(source.data.noteId);
        }
      },
      onDropTargetChange: ({ location }) => {
        const currentTarget = location.current.dropTargets[0]?.data;

        if (!isSidebarNoteDropData(currentTarget)) {
          setNoteDropTarget(null);
          return;
        }

        setNoteDropTarget({
          folderId: currentTarget.folderId,
          noteId: currentTarget.afterNoteId,
          mode: currentTarget.mode,
        });
      },
      onDrop: async ({ source, location }) => {
        setDraggedNoteId(null);
        setNoteDropTarget(null);

        if (!isSidebarNoteDragData(source.data)) {
          return;
        }

        const currentTarget = location.current.dropTargets[0]?.data;

        if (!isSidebarNoteDropData(currentTarget)) {
          return;
        }

        if (currentTarget.afterNoteId === source.data.noteId) {
          return;
        }

        await relocateNoteAction(source.data.noteId, {
          folderId: currentTarget.folderId,
          afterNoteId: currentTarget.afterNoteId,
        });

        router.refresh();
      },
    });
  }, [router]);

  // Derived / filtered data
  const flattenedFolders = useMemo(() => flattenFolderTree(folders), [folders]);

  const filteredFolders = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return q ? filterFolderTree(folders, q) : folders;
  }, [folders, paletteQuery]);


  const deferredSearchQuery = useDeferredValue(paletteQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  const filteredNotes = useMemo(() => {
    const source = hasQuery
      ? notes.filter((n) => n.title.toLowerCase().includes(normalizedQuery))
      : notes.slice(0, 8);
    return source.slice(0, hasQuery ? 12 : 8);
  }, [hasQuery, normalizedQuery, notes]);

  const filteredSpotterSessions = useMemo(() => {
    if (!normalizedSpotterSearchQuery) {
      return spotterSessions;
    }

    return spotterSessions.filter((session) =>
      session.title.toLowerCase().includes(normalizedSpotterSearchQuery),
    );
  }, [normalizedSpotterSearchQuery, spotterSessions]);

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
        id: "action-new-folder",
        group: "Quick actions",
        title: "Create new folder",
        description: "Add a new folder to the workspace",
        icon: encodeMaterialSymbol("create_new_folder"),
        onSelect: async () => {
          closePalette();
          handleStartCreateFolder();
        },
      },      {
        id: "action-dashboard",
        group: "Navigation",
        title: "Go to dashboard",
        description: "Main workspace view",
        icon: encodeMaterialSymbol("dashboard"),
        onSelect: async () => {
          router.push("/dashboard");
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
        id: "action-library",
        group: "Navigation",
        title: "Library",
        description: "Open all notes and folders on one page",
        icon: encodeMaterialSymbol("library_books"),
        onSelect: async () => {
          router.push("/library");
        },
      },
      {
        id: "action-spotter",
        group: "Navigation",
        title: "Ask Spotter",
        description: "Open the insight spotter workspace",
        icon: encodeMaterialSymbol("smart_toy"),
        onSelect: async () => {
          router.push("/spotter");
        },
      },
      {
        id: "action-agents",
        group: "Navigation",
        title: "Inbox Triage Agent",
        description: "Review and apply durable inbox organization proposals",
        icon: encodeMaterialSymbol("rule"),
        onSelect: async () => {
          router.push("/agents/inbox-triage");
        },
      },
      {
        id: "action-graph",
        group: "Navigation",
        title: "Go to graph view",
        description: "Note graph view",
        icon: "__graph__",
        onSelect: async () => {
          router.push("/graph");
        },
      },
      {
        id: "action-inbox",
        group: "Navigation",
        title: "Go to inbox",
        description: "Open notes without folders",
        icon: encodeMaterialSymbol("inbox"),
        onSelect: async () => {
          router.push("/inbox");
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
        id: "action-search",
        group: "Navigation",
        title: "Open search workspace",
        description: "Filtered search page",
        icon: encodeMaterialSymbol("search"),
        onSelect: async () => {
          router.push("/search");
        },
      },      {
        id: "action-publish",
        group: "Navigation",
        title: "Publishing area",
        description: "See published notes and exports",
        icon: encodeMaterialSymbol("publish"),
        onSelect: async () => {
          router.push("/publish");
        },
      },      {
        id: "action-settings",
        group: "Navigation",
        title: "Settings",
        description: "Open theme, local queue, and preferences",
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

    const noteItems = notes
      .filter(
        (n) =>
          !normalizedPaletteQuery ||
          n.title.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((n) => ({
        id: `note-${n.id}`,
        group: "Notes",
        title: n.title,
        description: "Open the note in the editor",
        icon: n.icon ?? encodeMaterialSymbol("description"),
        onSelect: async () => {
          navigateToNote(n.id);
        },
      }));

    const folderItems = flattenedFolders
      .filter(
        (f) =>
          !normalizedPaletteQuery ||
          f.name.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((f) => ({
        id: `folder-${f.id}`,
        group: "Folders",
        title: f.name,
        description: "Open folder view",
        icon: f.icon ?? encodeMaterialSymbol("folder"),
        onSelect: async () => {
          router.push(`/folders/${f.id}`);
        },
      }));


    const spotterSessionItems = spotterSessions
      .filter(
        (session) =>
          !normalizedPaletteQuery ||
          session.title.toLowerCase().includes(normalizedPaletteQuery),
      )
      .slice(0, normalizedPaletteQuery ? 8 : 5)
      .map<CommandPaletteItem>((session) => ({
        id: `spotter-session-${session.id}`,
        group: "Spotter",
        title: session.title,
        description: "Open chat session",
        icon: encodeMaterialSymbol("forum"),
        onSelect: async () => {
          navigateToSpotterSession(session.id);
        },
      }));

    if (!normalizedPaletteQuery)
      return [
        ...actionItems,
        ...spotterSessionItems,
        ...noteItems,
        ...folderItems,
      ];

    const filteredActions = actionItems.filter((item) =>
      `${item.title} ${item.description}`
        .toLowerCase()
        .includes(normalizedPaletteQuery),
    );
    return [
      ...filteredActions,
      ...spotterSessionItems,
      ...noteItems,
      ...folderItems,
    ];
  }, [
    closePalette,
    flattenedFolders,
    handleStartCreateFolder,
    navigateToNote,
    navigateToSpotterSession,
    normalizedPaletteQuery,
    spotterSessions,
    notes,
    router,
  ]);

  const folderGroupActions = useMemo<SidebarGroupAction[]>(
    () => [
      {
        icon: <FileNewIcon />,
        label: "Yeni not",
        onClick: () => void handleCreateNote(),
      },
      {
        icon: <FolderNewIcon />,
        label: "New folder",
        onClick: handleStartCreateFolder,
      },
    ],
    [handleCreateNote, handleStartCreateFolder],
  );

  const isSpotterCollapsed = hasQuery ? false : collapsedSections.spotter;
  const isFoldersCollapsed = hasQuery ? false : collapsedSections.folders;
  const isRecentNotesCollapsed = hasQuery
    ? false
    : collapsedSections.recentNotes;
  const inboxCount = notes.filter((n) => !n.folderId).length;
  const foldersCountLabel = flattenedFolders.length > 0 ? String(flattenedFolders.length) : undefined;
  const recentNotesCountLabel = notes.length > 0 ? String(notes.length) : undefined;

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
                onClick={() => router.push("/dashboard")}
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
                aria-label="Create new note"
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
                      { path: "/dashboard", icon: "\uE88A", label: "Dashboard" },
                      {
                        path: "/savanna",
                        icon: "landscape",
                        label: "Savanna",
                      },
                      {
                        path: "/inbox",
                        icon: "\uE156",
                        label: "Inbox",
                        badge: inboxCount > 0 ? inboxCount : undefined,
                      },
                      {
                        path: "/agents/inbox-triage",
                        icon: "rule",
                        label: "Agents",
                      },
                      {
                        path: "/library",
                        icon: "library_books",
                        label: "Library",
                      },
                      {
                        path: "/tower-matrix",
                        icon: "grid_4x4",
                        label: "Tower Matrix",
                      },
                      {
                        path: "/stride",
                        icon: "calendar_month",
                        label: "Stride",
                      },
                    ] as Array<{
                      path: string;
                      icon: string;
                      label: string;
                      badge?: number;
                    }>
                  ).map(({ path, icon, label, badge }) => (
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
                      {badge != null && (
                        <span className="sidebar-nav-badge">{badge}</span>
                      )}
                    </button>
                  ))}
                  <div className="sidebar-spotter-block">
                    <div className="sidebar-nav-item-row sidebar-spotter-row">
                      <button
                        type="button"
                        className={`sidebar-item${
                          pathname === "/spotter" && !activeSpotterSessionId
                            ? " active"
                            : ""
                        }`}
                        onClick={() => router.push("/spotter")}
                      >
                        <span className="sidebar-item-icon" aria-hidden="true">
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "16px", lineHeight: 1 }}
                          >
                            smart_toy
                          </span>
                        </span>
                        <span className="sidebar-item-label">Spotter</span>
                        {spotterSessions.length > 0 ? (
                          <span className="sidebar-nav-badge">{spotterSessions.length}</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="sidebar-nav-menu"
                        onClick={() => toggleSection("spotter")}
                        aria-expanded={!isSpotterCollapsed}
                        aria-label={
                          isSpotterCollapsed
                            ? "Expand Spotter chats"
                            : "Collapse Spotter chats"
                        }
                        title={isSpotterCollapsed ? "Expand chats" : "Collapse chats"}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                          {isSpotterCollapsed ? "chevron_right" : "expand_more"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="sidebar-nav-menu"
                        onClick={(event) =>
                          openContextMenuFromTrigger(event, buildSpotterMenu())
                        }
                        aria-label="Spotter menu"
                        title="Spotter options"
                      >
                        <MoreHorizontalIcon />
                      </button>
                      <button
                        type="button"
                        className="sidebar-nav-menu sidebar-spotter-new-chat"
                        onClick={() => {
                          setSpotterSearchQuery("");
                          router.push("/spotter");
                        }}
                        aria-label="New Spotter chat"
                        title="New chat"
                      >
                        <PlusIcon />
                      </button>
                    </div>

                    {!isSpotterCollapsed ? (
                      <div className="sidebar-nested-items sidebar-spotter-sessions-shell">
                        {spotterSessions.length > 5 || normalizedSpotterSearchQuery ? (
                          <label className="sidebar-spotter-search" htmlFor="spotter-session-search">
                            <span className="material-symbols-outlined" aria-hidden="true">search</span>
                            <input
                              id="spotter-session-search"
                              type="search"
                              value={spotterSearchQuery}
                              onChange={(event) => setSpotterSearchQuery(event.target.value)}
                              placeholder="Search chats"
                              spellCheck={false}
                            />
                            {normalizedSpotterSearchQuery ? (
                              <button
                                type="button"
                                className="sidebar-spotter-search-clear"
                                onClick={() => setSpotterSearchQuery("")}
                                aria-label="Clear Spotter chat search"
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">close</span>
                              </button>
                            ) : null}
                          </label>
                        ) : null}

                        <div className="sidebar-spotter-sessions">
                          {spotterSessions.length === 0 ? (
                            <div className="sidebar-session-empty">
                              No chats yet.
                            </div>
                          ) : filteredSpotterSessions.length === 0 ? (
                            <div className="sidebar-session-empty">
                              No chats match your search.
                            </div>
                          ) : (
                            filteredSpotterSessions.map((session) => (
                              <div
                                key={session.id}
                                className={`sidebar-entity-row sidebar-spotter-session-row${
                                  activeSpotterSessionId === session.id
                                    ? " active"
                                    : ""
                                }`}
                                onContextMenu={(event) =>
                                  openContextMenuAtPointer(
                                    event,
                                    buildSpotterSessionMenu(session),
                                  )
                                }
                              >
                                <button
                                  type="button"
                                  className={`sidebar-item sidebar-row-main sidebar-nested-item${
                                    activeSpotterSessionId === session.id
                                      ? " active"
                                      : ""
                                  }`}
                                  onClick={() => navigateToSpotterSession(session.id)}
                                  title={session.title}
                                >
                                  <span className="sidebar-item-label">
                                    {session.title}
                                  </span>
                                  <span className="sidebar-nested-item-date">
                                    {formatSidebarSessionDate(session.lastMessageAt)}
                                  </span>
                                </button>
                                <div className="sidebar-row-actions sidebar-spotter-session-actions">
                                  <button
                                    type="button"
                                    className="context-trigger sidebar-row-action"
                                    onClick={(event) =>
                                      openContextMenuFromTrigger(
                                        event,
                                        buildSpotterSessionMenu(session),
                                      )
                                    }
                                    aria-label={`${session.title} open menu`}
                                    title="Options"
                                  >
                                    <MoreHorizontalIcon />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="sidebar-divider" />

                {/* Folders */}
                <SidebarGroup
                  label="Folders"
                  icon={
                    <span
                      className="material-symbols-outlined sm"
                      aria-hidden="true"
                    >
                      folder
                    </span>
                  }
                  meta={foldersCountLabel}
                  collapsed={isFoldersCollapsed}
                  showChevron
                  onToggle={() => toggleSection("folders")}
                  actions={folderGroupActions}
                >
                  <div ref={folderTreeRef} className="sidebar-folder-tree">
                    {isCreatingFolder && (
                      <div className="sidebar-inline-creator">
                        {/* Icon area — same width as .sidebar-folder-icon-btn */}
                        <span
                          className="sidebar-folder-icon-btn sidebar-folder-icon-btn--static"
                          aria-hidden="true"
                        >
                          <span className="material-symbols-outlined sm">
                            folder
                          </span>
                        </span>
                        <input
                          autoFocus
                          type="text"
                          className="sidebar-inline-creator-input"
                          defaultValue="New Folder"
                          placeholder="Folder name"
                          onFocus={(e) => {
                            folderCreationHandledRef.current = false;
                            e.currentTarget.select();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              folderCreationHandledRef.current = true;
                              const name = e.currentTarget.value;
                              setIsCreatingFolder(false);
                              void doCreateFolder(name);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              folderCreationHandledRef.current = true;
                              setIsCreatingFolder(false);
                            }
                          }}
                          onBlur={(e) => {
                            if (folderCreationHandledRef.current) {
                              folderCreationHandledRef.current = false;
                              return;
                            }
                            const name = e.currentTarget.value;
                            setIsCreatingFolder(false);
                            void doCreateFolder(name);
                          }}
                        />
                      </div>
                    )}
                    {filteredFolders.length === 0 ? (
                      <div className="sidebar-empty">
                        {hasQuery ? "No matching folders." : "No folders yet."}
                      </div>
                    ) : (
                      filteredFolders.map((folder) => (
                        <SidebarFolderItem
                          key={folder.id}
                          folder={folder}
                          pathname={pathname}
                          onOpen={(id) => router.push(`/folders/${id}`)}
                          onQuickCreate={handleCreateNoteInFolder}
                          draggedFolderId={draggedFolderId}
                          folderDropTarget={folderDropTarget}
                          draggedNoteId={draggedNoteId}
                          noteDropTarget={noteDropTarget}
                          allNotes={notes}
                          currentNoteId={currentNoteId}
                          onNoteOpen={navigateToNote}
                          onNoteContextMenu={(e, n) =>
                            openContextMenuAtPointer(e, buildNoteMenu(n))
                          }
                          onNoteTriggerMenu={(e, n) =>
                            openContextMenuFromTrigger(e, buildNoteMenu(n))
                          }
                          onCreateSubFolder={handleCreateSubFolder}
                        />
                      ))
                    )}
                  </div>
                </SidebarGroup>
                {/* Recent notes */}
                <SidebarGroup
                  label={hasQuery ? "Matching notes" : "Recent notes"}
                  icon={
                    <span
                      className="material-symbols-outlined sm"
                      aria-hidden="true"
                    >
                      {hasQuery ? "search" : "history"}
                    </span>
                  }
                  meta={recentNotesCountLabel}
                  collapsed={isRecentNotesCollapsed}
                  showChevron
                  onToggle={() => toggleSection("recentNotes")}
                >
                  <nav className="sidebar-nav">
                    {filteredNotes.length === 0 ? (
                      <div className="sidebar-empty">
                        {hasQuery
                          ? "No matching notes."
                          : "No notes yet. Create your first note."}
                      </div>
                    ) : (
                      filteredNotes.map((note) => (
                        <SidebarNoteRow
                          key={note.id}
                          note={note}
                          active={note.id === currentNoteId}
                          onOpen={navigateToNote}
                          onContextMenuOpen={(e, n) =>
                            openContextMenuAtPointer(e, buildNoteMenu(n))
                          }
                          onTriggerMenuOpen={(e, n) =>
                            openContextMenuFromTrigger(e, buildNoteMenu(n))
                          }
                          draggedNoteId={draggedNoteId}
                          noteDropTarget={noteDropTarget}
                        />
                      ))
                    )}
                  </nav>
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

      {spotterDialog ? createPortal(
        <div
          className="sidebar-modal-backdrop"
          onClick={closeSpotterDialog}
          role="presentation"
        >
          <div
            className="sidebar-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={
              spotterDialog.type === "rename"
                ? "Rename Spotter chat"
                : spotterDialog.type === "delete"
                  ? "Delete Spotter chat"
                  : "Delete all Spotter chats"
            }
          >
            <div className="sidebar-modal-header">
              <h2 className="sidebar-modal-title">
                {spotterDialog.type === "rename"
                  ? "Rename chat"
                  : spotterDialog.type === "delete"
                    ? "Delete chat"
                    : "Delete all chats"}
              </h2>
              <button
                type="button"
                className="sidebar-modal-close"
                onClick={closeSpotterDialog}
                disabled={isSpotterDialogSubmitting}
                aria-label="Close dialog"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {spotterDialog.type === "rename" ? (
              <form
                className="sidebar-modal-body"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setIsSpotterDialogSubmitting(true);
                  try {
                    await renameSpotterSessionAction(
                      spotterDialog.session.id,
                      spotterTitleDraft,
                    );
                    setSpotterDialog(null);
                    setSpotterTitleDraft("");
                    router.refresh();
                  } finally {
                    setIsSpotterDialogSubmitting(false);
                  }
                }}
              >
                <label className="sidebar-modal-label" htmlFor="spotter-title">
                  Chat title
                </label>
                <input
                  id="spotter-title"
                  autoFocus
                  className="sidebar-modal-input"
                  value={spotterTitleDraft}
                  onChange={(event) => setSpotterTitleDraft(event.target.value)}
                  placeholder="New chat"
                  disabled={isSpotterDialogSubmitting}
                  aria-invalid={!spotterTitleDraft.trim()}
                />
                {!spotterTitleDraft.trim() ? (
                  <p className="sidebar-modal-copy sidebar-modal-copy--muted">
                    Title cannot be empty.
                  </p>
                ) : null}
                <div className="sidebar-modal-actions">
                  <Button
                    type="button"
                    variant="text"
                    onClick={closeSpotterDialog}
                    disabled={isSpotterDialogSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSpotterDialogSubmitting || !spotterTitleDraft.trim()}
                  >
                    Save
                  </Button>
                </div>
              </form>
            ) : (
              <div className="sidebar-modal-body">
                <p className="sidebar-modal-copy">
                  {spotterDialog.type === "delete"
                    ? `\"${spotterDialog.session.title}\" kalıcı olarak silinecek.`
                    : `Tüm ${spotterDialog.count} Spotter sohbeti kalıcı olarak silinecek.`}
                </p>
                <p className="sidebar-modal-copy sidebar-modal-copy--muted">
                  Bu işlem geri alınamaz.
                </p>
                <div className="sidebar-modal-actions">
                  <Button
                    type="button"
                    variant="text"
                    onClick={closeSpotterDialog}
                    disabled={isSpotterDialogSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      setIsSpotterDialogSubmitting(true);
                      try {
                        if (spotterDialog.type === "delete") {
                          await deleteSpotterSessionAction(spotterDialog.session.id);
                          if (
                            activeSpotterSessionId === spotterDialog.session.id &&
                            pathname === "/spotter"
                          ) {
                            router.push("/spotter");
                          }
                        } else {
                          await deleteAllSpotterSessionsAction();
                          if (pathname === "/spotter") {
                            router.push("/spotter");
                          }
                        }
                        setSpotterDialog(null);
                        setSpotterTitleDraft("");
                        router.refresh();
                      } finally {
                        setIsSpotterDialogSubmitting(false);
                      }
                    }}
                    disabled={isSpotterDialogSubmitting}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
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
