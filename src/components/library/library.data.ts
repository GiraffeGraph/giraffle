import type { SidebarFolder } from "@/components/sidebar/sidebar.types";
import type { NoteCategorySummary } from "@/domain/category/category.types";

export const LIBRARY_UNFILED_GROUP_ID = "__library-unfiled__";
export const LIBRARY_CANVASES_GROUP_ID = "__library-canvases__";
export const LIBRARY_ASSETS_GROUP_ID = "__library-assets__";

export type LibraryTabId =
  | "recents"
  | "favorites"
  | "shared"
  | "private"
  | "ai-meeting-notes";

export type LibraryFlagFilterId = "root" | "pinned" | "published";

export type LibraryContentType =
  | "folder"
  | "note"
  | "canvas"
  | "asset";

export type LibraryEntryType = LibraryContentType | "smart_group";

export interface LibraryCategoryFacet extends NoteCategorySummary {
  noteCount: number;
}

export interface LibraryNoteSeed {
  id: string;
  title: string;
  slug: string | null;
  icon: string | null;
  folderId: string | null;
  position?: number;
  isPinned: boolean;
  isPublished: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  category: NoteCategorySummary | null;
}

export interface LibraryCanvasSeed {
  id: string;
  title: string;
  nodeCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface LibraryAssetSeed {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  note: {
    id: string;
    title: string;
    folderId: string | null;
  } | null;
}

export interface LibraryEntry {
  id: string;
  entityId: string | null;
  title: string;
  icon: string;
  type: LibraryEntryType;
  kindLabel: string;
  locationLabel: string;
  visibility: "private" | "published" | "neutral";
  updatedAt: string;
  parentId: string | null;
  hasChildren: boolean;
  children: LibraryEntry[];
  isFavorite: boolean;
  isPublished: boolean;
  isAiMeeting: boolean;
  href: string | null;
  folderId: string | null;
  noteCount: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: NoteCategorySummary["color"] | null;
  categoryIcon: string | null;
  isDroppableTarget: boolean;
  isDraggable: boolean;
}

export interface LibraryWorkspaceSeed {
  entries: LibraryEntry[];
  expandedIds: string[];
  totalNotes: number;
  totalFolders: number;
  totalCanvases: number;
  totalAssets: number;
  categories: LibraryCategoryFacet[];
}

export const LIBRARY_TABS: Array<{ id: LibraryTabId; label: string }> = [
  { id: "recents", label: "Recents" },
  { id: "favorites", label: "Pinned" },
  { id: "shared", label: "Published" },
  { id: "private", label: "Private" },
  { id: "ai-meeting-notes", label: "Meeting Notes" },
];

export const LIBRARY_FLAG_FILTERS: Array<{
  id: LibraryFlagFilterId;
  label: string;
}> = [
  { id: "root", label: "Root only" },
  { id: "pinned", label: "Pinned" },
  { id: "published", label: "Published" },
];

export const LIBRARY_CONTENT_FILTERS: Array<{
  id: LibraryContentType;
  label: string;
}> = [
  { id: "folder", label: "Folders" },
  { id: "note", label: "Notes" },
  { id: "canvas", label: "Canvas" },
  { id: "asset", label: "Media" },
];

const MEETING_KEYWORDS = [
  "meeting",
  "toplanti",
  "toplanti",
  "retro",
  "review",
  "sprint",
  "standup",
  "sync",
  "interview",
  "1:1",
  "degerlendirme",
  "gorusme",
  "meeting",
];

export function buildLibraryWorkspaceSeed(input: {
  folders: SidebarFolder[];
  categories: NoteCategorySummary[];
  notes: LibraryNoteSeed[];
  canvases: LibraryCanvasSeed[];
  assets: LibraryAssetSeed[];
}): LibraryWorkspaceSeed {
  const notesByFolderId = new Map<string | null, LibraryNoteSeed[]>();

  for (const note of input.notes) {
    const key = note.folderId ?? null;
    const current = notesByFolderId.get(key) ?? [];
    current.push(note);
    notesByFolderId.set(key, current);
  }

  const folderPaths = new Map<string, string[]>();
  const folderEntries = sortFolders(input.folders).map((folder) =>
    buildFolderEntry({
      folder,
      notesByFolderId,
      parentPathSegments: [],
      folderPaths,
    })
  );

  const rootEntries = sortLibraryEntries(folderEntries);
  const unfiledNotes = sortNotes(notesByFolderId.get(null) ?? []);
  const extraGroups: LibraryEntry[] = [];

  if (unfiledNotes.length > 0) {
    extraGroups.push(buildUnfiledEntry(unfiledNotes));
  }

  if (input.canvases.length > 0) {
    extraGroups.push(buildCanvasesEntry(input.canvases));
  }

  if (input.assets.length > 0) {
    extraGroups.push(buildAssetsEntry(input.assets, folderPaths));
  }

  const categoryCounts = new Map<string, number>();

  for (const note of input.notes) {
    if (!note.category?.id) {
      continue;
    }

    categoryCounts.set(
      note.category.id,
      (categoryCounts.get(note.category.id) ?? 0) + 1
    );
  }

  const categories = input.categories
    .map((category) => ({
      ...category,
      noteCount: categoryCounts.get(category.id) ?? 0,
    }))
    .filter((category) => category.noteCount > 0)
    .sort((left, right) => {
      if (right.noteCount !== left.noteCount) {
        return right.noteCount - left.noteCount;
      }

      return left.name.localeCompare(right.name, "tr");
    });

  return {
    entries: [...rootEntries, ...extraGroups],
    expandedIds: collectExpandableIds([...rootEntries, ...extraGroups]),
    totalNotes: input.notes.length,
    totalFolders: countFolders(input.folders),
    totalCanvases: input.canvases.length,
    totalAssets: input.assets.length,
    categories,
  };
}

function buildFolderEntry(input: {
  folder: SidebarFolder;
  notesByFolderId: Map<string | null, LibraryNoteSeed[]>;
  parentPathSegments: string[];
  folderPaths: Map<string, string[]>;
}): LibraryEntry {
  const pathSegments = [...input.parentPathSegments, input.folder.name];
  input.folderPaths.set(input.folder.id, pathSegments);

  const childFolderEntries = sortFolders(input.folder.children ?? []).map((childFolder) =>
    buildFolderEntry({
      folder: childFolder,
      notesByFolderId: input.notesByFolderId,
      parentPathSegments: pathSegments,
      folderPaths: input.folderPaths,
    })
  );
  const noteEntries = sortNotes(input.notesByFolderId.get(input.folder.id) ?? []).map((note) =>
    buildNoteEntry(note, pathSegments)
  );
  const children = sortLibraryEntries([...childFolderEntries, ...noteEntries]);
  const latestChildUpdatedAt = children.reduce<string | null>((latest, child) => {
    if (!latest) return child.updatedAt;
    return new Date(child.updatedAt).getTime() > new Date(latest).getTime()
      ? child.updatedAt
      : latest;
  }, null);
  const noteCount =
    noteEntries.length +
    childFolderEntries.reduce((total, child) => total + child.noteCount, 0);

  return {
    id: input.folder.id,
    entityId: input.folder.id,
    title: input.folder.name,
    icon: input.folder.icon ?? "folder",
    type: "folder",
    kindLabel: noteCount === 1 ? "1 note" : `${noteCount} notes`,
    locationLabel:
      input.parentPathSegments.length > 0
        ? input.parentPathSegments.join(" / ")
        : "Workspace root",
    visibility: "neutral",
    updatedAt: latestChildUpdatedAt ?? new Date().toISOString(),
    parentId: input.folder.parentId ?? null,
    hasChildren: children.length > 0,
    children,
    isFavorite: false,
    isPublished: false,
    isAiMeeting:
      hasMeetingKeyword(input.folder.name) || children.some((child) => child.isAiMeeting),
    href: `/folders/${input.folder.id}`,
    folderId: input.folder.id,
    noteCount,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    isDroppableTarget: true,
    isDraggable: false,
  };
}

function buildNoteEntry(
  note: LibraryNoteSeed,
  pathSegments: string[]
): LibraryEntry {
  const isPublished = Boolean(note.isPublished);
  return {
    id: note.id,
    entityId: note.id,
    title: note.title,
    icon: note.icon ?? "description",
    type: "note",
    kindLabel: note.category?.name ?? (note.isPinned ? "Pinned note" : "Note"),
    locationLabel: pathSegments.length > 0 ? pathSegments.join(" / ") : "Workspace root",
    visibility: isPublished ? "published" : "private",
    updatedAt: toIsoString(note.updatedAt),
    parentId: note.folderId ?? null,
    hasChildren: false,
    children: [],
    isFavorite: Boolean(note.isPinned),
    isPublished,
    isAiMeeting:
      hasMeetingKeyword(note.title) || pathSegments.some(hasMeetingKeyword),
    href: `/notes/${note.id}`,
    folderId: note.folderId ?? null,
    noteCount: 1,
    categoryId: note.category?.id ?? null,
    categoryName: note.category?.name ?? null,
    categoryColor: note.category?.color ?? null,
    categoryIcon: note.category?.icon ?? null,
    isDroppableTarget: false,
    isDraggable: true,
  };
}

function buildUnfiledEntry(notes: LibraryNoteSeed[]): LibraryEntry {
  const children = notes.map((note) => buildNoteEntry(note, []));
  const latestUpdatedAt = children[0]?.updatedAt ?? new Date().toISOString();

  return {
    id: LIBRARY_UNFILED_GROUP_ID,
    entityId: null,
    title: "Unsorted",
    icon: "folder_off",
    type: "smart_group",
    kindLabel: notes.length === 1 ? "1 loose note" : `${notes.length} loose notes`,
    locationLabel: "Workspace root",
    visibility: "neutral",
    updatedAt: latestUpdatedAt,
    parentId: null,
    hasChildren: children.length > 0,
    children,
    isFavorite: false,
    isPublished: false,
    isAiMeeting: children.some((child) => child.isAiMeeting),
    href: null,
    folderId: null,
    noteCount: notes.length,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    isDroppableTarget: true,
    isDraggable: false,
  };
}

function buildCanvasesEntry(canvases: LibraryCanvasSeed[]): LibraryEntry {
  const children = canvases.map((canvas) => ({
    id: `canvas-${canvas.id}`,
    entityId: canvas.id,
    title: canvas.title,
    icon: "hub",
    type: "canvas" as const,
    kindLabel: canvas.nodeCount === 1 ? "1 node" : `${canvas.nodeCount} nodes`,
    locationLabel: "Spatial maps",
    visibility: "neutral" as const,
    updatedAt: toIsoString(canvas.updatedAt),
    parentId: LIBRARY_CANVASES_GROUP_ID,
    hasChildren: false,
    children: [],
    isFavorite: false,
    isPublished: false,
    isAiMeeting: hasMeetingKeyword(canvas.title),
    href: `/canvas/${canvas.id}`,
    folderId: null,
    noteCount: 0,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    isDroppableTarget: false,
    isDraggable: false,
  }));

  return {
    id: LIBRARY_CANVASES_GROUP_ID,
    entityId: null,
    title: "Canvas",
    icon: "hub",
    type: "smart_group",
    kindLabel: canvases.length === 1 ? "1 map" : `${canvases.length} maps`,
    locationLabel: "Workspace tools",
    visibility: "neutral",
    updatedAt: children[0]?.updatedAt ?? new Date().toISOString(),
    parentId: null,
    hasChildren: children.length > 0,
    children,
    isFavorite: false,
    isPublished: false,
    isAiMeeting: children.some((child) => child.isAiMeeting),
    href: null,
    folderId: null,
    noteCount: 0,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    isDroppableTarget: false,
    isDraggable: false,
  };
}

function buildAssetsEntry(
  assets: LibraryAssetSeed[],
  folderPaths: Map<string, string[]>
): LibraryEntry {
  const children = assets.map((asset) => {
    const locationSegments = asset.note?.folderId
      ? folderPaths.get(asset.note.folderId) ?? []
      : [];
    const locationLabel = asset.note
      ? locationSegments.length > 0
        ? `${locationSegments.join(" / ")} / ${asset.note.title}`
        : asset.note.title
      : "Library uploads";

    return {
      id: `asset-${asset.id}`,
      entityId: asset.id,
      title: asset.fileName,
      icon: getAssetIcon(asset.mimeType),
      type: "asset" as const,
      kindLabel: `${formatMimeLabel(asset.mimeType)} · ${formatBytes(asset.sizeBytes)}`,
      locationLabel,
      visibility: "neutral" as const,
      updatedAt: toIsoString(asset.updatedAt),
      parentId: LIBRARY_ASSETS_GROUP_ID,
      hasChildren: false,
      children: [],
      isFavorite: false,
      isPublished: false,
      isAiMeeting: false,
      href: asset.note ? `/notes/${asset.note.id}` : null,
      folderId: asset.note?.folderId ?? null,
      noteCount: 0,
      categoryId: null,
      categoryName: null,
      categoryColor: null,
      categoryIcon: null,
      isDroppableTarget: false,
      isDraggable: false,
    };
  });

  return {
    id: LIBRARY_ASSETS_GROUP_ID,
    entityId: null,
    title: "Media",
    icon: "photo_library",
    type: "smart_group",
    kindLabel: assets.length === 1 ? "1 asset" : `${assets.length} assets`,
    locationLabel: "Workspace files",
    visibility: "neutral",
    updatedAt: children[0]?.updatedAt ?? new Date().toISOString(),
    parentId: null,
    hasChildren: children.length > 0,
    children,
    isFavorite: false,
    isPublished: false,
    isAiMeeting: false,
    href: null,
    folderId: null,
    noteCount: 0,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    isDroppableTarget: false,
    isDraggable: false,
  };
}

function collectExpandableIds(entries: LibraryEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.children.length > 0
      ? [entry.id, ...collectExpandableIds(entry.children)]
      : []
  );
}

function countFolders(folders: SidebarFolder[]): number {
  return folders.reduce(
    (total, folder) => total + 1 + countFolders(folder.children ?? []),
    0
  );
}

function sortFolders(folders: SidebarFolder[]) {
  return [...folders].sort((left, right) => {
    const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }

    return left.name.localeCompare(right.name, "tr");
  });
}

function sortNotes(notes: LibraryNoteSeed[]) {
  return [...notes].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });
}

function sortLibraryEntries(entries: LibraryEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) {
      if (left.type === "smart_group") return 1;
      if (right.type === "smart_group") return -1;
      if (left.type === "folder") return -1;
      if (right.type === "folder") return 1;
      if (left.type === "note") return -1;
      if (right.type === "note") return 1;
    }

    if (left.type === "note" && right.type === "note") {
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }

      return (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    }

    if (left.type === "canvas" || left.type === "asset") {
      return (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    }

    return left.title.localeCompare(right.title, "tr");
  });
}

function hasMeetingKeyword(value: string) {
  const normalized = value.toLocaleLowerCase("tr");
  return MEETING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function getAssetIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video_file";
  if (mimeType === "application/pdf") return "picture_as_pdf";
  return "attach_file";
}

function formatMimeLabel(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType === "application/pdf") return "PDF";
  return mimeType.split("/")[1]?.toUpperCase() ?? "File";
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
