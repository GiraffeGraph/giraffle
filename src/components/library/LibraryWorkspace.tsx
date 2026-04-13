"use client";

import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { getNoteCategoryColorTokens } from "@/domain/category/category.types";
import { Button } from "@/components/ui/Button";
import {
  archiveLibraryNotesAction,
  createLibraryNoteAction,
  relocateLibraryNoteAction,
  setLibraryNotesPublishedAction,
} from "./library.actions";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import {
  LIBRARY_CONTENT_FILTERS,
  LIBRARY_FLAG_FILTERS,
  LIBRARY_TABS,
  LIBRARY_UNFILED_GROUP_ID,
  type LibraryContentType,
  type LibraryEntry,
  type LibraryFlagFilterId,
  type LibraryTabId,
  type LibraryWorkspaceSeed,
} from "./library.data";
import styles from "./LibraryWorkspace.module.css";

interface VisibleLibraryRow {
  id: string;
  depth: number;
  entry: LibraryEntry;
}

interface LibraryNoteDragData {
  type: "library-note";
  noteId: string;
  folderId: string | null;
}

interface LibraryNoteDropData {
  type: "library-note-drop-target";
  entryId: string;
  folderId: string | null;
}

export function LibraryWorkspace({
  entries,
  expandedIds: initialExpandedIds,
  totalCanvases,
  totalAssets,
  categories,
  tags,
}: LibraryWorkspaceSeed) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LibraryTabId>("recents");
  const [selectedId, setSelectedId] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set(initialExpandedIds));
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [activeContentTypes, setActiveContentTypes] = useState<LibraryContentType[]>([]);
  const [activeFlags, setActiveFlags] = useState<LibraryFlagFilterId[]>([]);
  const [activeCategoryIds, setActiveCategoryIds] = useState<string[]>([]);
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [compactMode, setCompactMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTargetEntryId, setDropTargetEntryId] = useState<string | null>(null);
  const [isCreatingPage, startCreateTransition] = useTransition();
  const [isBulkPending, startBulkTransition] = useTransition();
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragHandleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  const filteredEntries = useMemo(
    () =>
      filterEntries(entries, {
        activeTab,
        searchQuery,
        activeContentTypes,
        activeFlags,
        activeCategoryIds,
        activeTagIds,
      }),
    [activeCategoryIds, activeContentTypes, activeFlags, activeTab, activeTagIds, entries, searchQuery]
  );
  const visibleRows = useMemo(
    () => flattenEntries(filteredEntries, expandedIds),
    [expandedIds, filteredEntries]
  );
  const allRows = useMemo(
    () => flattenEntries(entries, new Set(initialExpandedIds)),
    [entries, initialExpandedIds]
  );
  const noteEntryById = useMemo(() => {
    const next = new Map<string, LibraryEntry>();
    for (const row of allRows) {
      if (row.entry.type === "note" && row.entry.entityId) next.set(row.entry.entityId, row.entry);
    }
    return next;
  }, [allRows]);
  const effectiveSelectedNoteIds = useMemo(
    () => new Set(Array.from(selectedNoteIds).filter((noteId) => noteEntryById.has(noteId))),
    [noteEntryById, selectedNoteIds]
  );

  const effectiveSelectedId = visibleRows.some((row) => row.id === selectedId)
    ? selectedId
    : visibleRows[0]?.id ?? "";
  const activeRow = visibleRows.find((row) => row.id === effectiveSelectedId)?.entry ?? null;
  const visibleNoteIds = visibleRows
    .filter((row): row is VisibleLibraryRow & { entry: LibraryEntry & { type: "note"; entityId: string } } => row.entry.type === "note" && typeof row.entry.entityId === "string")
    .map((row) => row.entry.entityId);
  const selectedNoteIdsArray = Array.from(effectiveSelectedNoteIds);
  const selectedNoteEntries = selectedNoteIdsArray
    .map((noteId) => noteEntryById.get(noteId))
    .filter((entry): entry is LibraryEntry => Boolean(entry));
  const allVisibleNotesSelected = visibleNoteIds.length > 0 && visibleNoteIds.every((noteId) => effectiveSelectedNoteIds.has(noteId));
  const someVisibleNotesSelected = visibleNoteIds.some((noteId) => effectiveSelectedNoteIds.has(noteId)) && !allVisibleNotesSelected;
  const selectedHasPrivate = selectedNoteEntries.some((entry) => !entry.isPublished);
  const selectedHasPublished = selectedNoteEntries.some((entry) => entry.isPublished);

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someVisibleNotesSelected;
  }, [someVisibleNotesSelected]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const row of visibleRows) {
      const element = rowRefs.current[row.id];
      if (!element) continue;
      if (row.entry.isDraggable && row.entry.entityId) {
        const dragHandle = dragHandleRefs.current[row.id];
        if (dragHandle) {
          cleanups.push(
            draggable({
              element,
              dragHandle,
              getInitialData: () => ({
                type: "library-note",
                noteId: row.entry.entityId!,
                folderId: row.entry.folderId,
              }),
            })
          );
        }
      }
      if (row.entry.isDroppableTarget) {
        cleanups.push(
          dropTargetForElements({
            element,
            canDrop: ({ source }) => isLibraryNoteDragData(source.data),
            getData: () => ({
              type: "library-note-drop-target",
              entryId: row.id,
              folderId: getDropFolderId(row.entry),
            }),
          })
        );
      }
    }
    cleanups.push(
      monitorForElements({
        canMonitor: ({ source }) => isLibraryNoteDragData(source.data),
        onDragStart: ({ source }) => {
          if (isLibraryNoteDragData(source.data)) setDraggedNoteId(source.data.noteId);
        },
        onDropTargetChange: ({ location }) => {
          const currentTarget = location.current.dropTargets[0]?.data;
          setDropTargetEntryId(isLibraryNoteDropData(currentTarget) ? currentTarget.entryId : null);
        },
        onDrop: async ({ source, location }) => {
          setDraggedNoteId(null);
          setDropTargetEntryId(null);
          if (!isLibraryNoteDragData(source.data)) return;
          const currentTarget = location.current.dropTargets[0]?.data;
          if (!isLibraryNoteDropData(currentTarget)) return;
          if (currentTarget.folderId === source.data.folderId) return;
          await relocateLibraryNoteAction(source.data.noteId, { folderId: currentTarget.folderId });
          router.refresh();
        },
      })
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [router, visibleRows]);

  const toggleContentType = (type: LibraryContentType) =>
    setActiveContentTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type]
    );
  const toggleFlag = (flag: LibraryFlagFilterId) =>
    setActiveFlags((current) =>
      current.includes(flag) ? current.filter((value) => value !== flag) : [...current, flag]
    );
  const toggleCategory = (categoryId: string) =>
    setActiveCategoryIds((current) =>
      current.includes(categoryId) ? current.filter((value) => value !== categoryId) : [...current, categoryId]
    );
  const toggleTag = (tagId: string) =>
    setActiveTagIds((current) =>
      current.includes(tagId) ? current.filter((value) => value !== tagId) : [...current, tagId]
    );

  const handleCreatePage = () => {
    const folderId = activeRow?.type === "folder" ? activeRow.folderId : activeRow?.type === "note" ? activeRow.folderId : null;
    const categoryId = activeRow?.type === "note" ? activeRow.categoryId : null;
    startCreateTransition(async () => {
      const noteId = await createLibraryNoteAction({ folderId, categoryId });
      router.push(`/notes/${noteId}`);
    });
  };

  const runBulkAction = (action: () => Promise<void>) => {
    startBulkTransition(async () => {
      await action();
      setSelectedNoteIds(new Set());
      router.refresh();
    });
  };

  return (
    <div className={styles.root}>
      <section className={styles.surface}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.tabs}>
              {LIBRARY_TABS.map((tab) => (
                <button key={tab.id} type="button" className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
              ))}
            </div>
            <div className={styles.meta}>
              <span>{visibleRows.length} kayıt</span>
              <span className={styles.metaDot} />
              <span>Seçili: {activeRow?.title ?? "Yok"}</span>
              <span className={styles.metaDot} />
              <span>{totalCanvases} canvas</span>
              <span className={styles.metaDot} />
              <span>{totalAssets} dosya</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.toolbar}>
              <button type="button" className={`${styles.iconButton} ${filterPanelVisible ? styles.iconButtonActive : ""}`} onClick={() => setFilterPanelVisible((current) => !current)} title="Filtreler"><span className="material-symbols-outlined">filter_alt</span></button>
              <button type="button" className={`${styles.iconButton} ${searchVisible ? styles.iconButtonActive : ""}`} onClick={() => setSearchVisible((current) => !current)} title="Arama"><span className="material-symbols-outlined">search</span></button>
              <button type="button" className={`${styles.iconButton} ${compactMode ? styles.iconButtonActive : ""}`} onClick={() => setCompactMode((current) => !current)} title="Sıkılık"><span className="material-symbols-outlined">density_small</span></button>
            </div>
            <Button variant="filled" leadingIcon="add" onClick={handleCreatePage} disabled={isCreatingPage}>{isCreatingPage ? "Oluşturuluyor..." : "Yeni sayfa"}</Button>
          </div>
        </header>

        {selectedNoteEntries.length > 0 ? (
          <div className={styles.bulkBar}>
            <div className={styles.bulkMeta}>
              <span className={styles.bulkCount}>{selectedNoteEntries.length} notes selected</span>
              <button type="button" className={styles.bulkClear} onClick={() => setSelectedNoteIds(new Set())}>Clear</button>
            </div>
            <div className={styles.bulkActions}>
              {selectedHasPrivate ? <Button variant="tonal" leadingIcon="publish" onClick={() => runBulkAction(() => setLibraryNotesPublishedAction(selectedNoteIdsArray, true))} disabled={isBulkPending}>Publish selected</Button> : null}
              {selectedHasPublished ? <Button variant="outlined" leadingIcon="lock" onClick={() => runBulkAction(() => setLibraryNotesPublishedAction(selectedNoteIdsArray, false))} disabled={isBulkPending}>Make private</Button> : null}
              <Button variant="outlined" leadingIcon="archive" onClick={() => runBulkAction(() => archiveLibraryNotesAction(selectedNoteIdsArray))} disabled={isBulkPending}>Archive selected</Button>
            </div>
          </div>
        ) : null}

        {(searchVisible || filterPanelVisible) ? (
          <div className={styles.controls}>
            {searchVisible ? <div className={styles.searchRow}><input className={styles.searchField} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Klasör, not, etiket..." /></div> : null}
            {filterPanelVisible ? (
              <div className={styles.facetPanel}>
                <div className={styles.facetSection}>
                  <div className={styles.facetSectionHeader}>
                    <span className={styles.facetTitle}>Hızlı filtreler</span>
                    <button type="button" className={styles.clearFiltersButton} onClick={() => { setActiveContentTypes([]); setActiveFlags([]); setActiveCategoryIds([]); setActiveTagIds([]); }}>Temizle</button>
                  </div>
                  <div className={styles.filterRow}>{LIBRARY_FLAG_FILTERS.map((filter) => <button key={filter.id} type="button" className={`${styles.filterChip} ${activeFlags.includes(filter.id) ? styles.filterChipActive : ""}`} onClick={() => toggleFlag(filter.id)}>{filter.label}</button>)}</div>
                </div>
                <div className={styles.facetSection}>
                  <span className={styles.facetTitle}>İçerik türleri</span>
                  <div className={styles.filterRow}>{LIBRARY_CONTENT_FILTERS.map((filter) => <button key={filter.id} type="button" className={`${styles.filterChip} ${activeContentTypes.includes(filter.id) ? styles.filterChipActive : ""}`} onClick={() => toggleContentType(filter.id)}>{filter.label}</button>)}</div>
                </div>
                {categories.length > 0 ? <div className={styles.facetSection}><span className={styles.facetTitle}>Kategoriler</span><div className={styles.filterRow}>{categories.map((category) => <button key={category.id} type="button" className={`${styles.filterChip} ${activeCategoryIds.includes(category.id) ? styles.filterChipActive : ""}`} onClick={() => toggleCategory(category.id)} style={activeCategoryIds.includes(category.id) ? getNoteCategoryColorTokens(category.color) : undefined}>{category.icon ? <span className="material-symbols-outlined sm">{category.icon}</span> : null}{category.name}<span className={styles.facetCount}>{category.noteCount}</span></button>)}</div></div> : null}
                {tags.length > 0 ? <div className={styles.facetSection}><span className={styles.facetTitle}>Etiketler</span><div className={styles.filterRow}>{tags.slice(0, 16).map((tag) => <button key={tag.id} type="button" className={`${styles.filterChip} ${activeTagIds.includes(tag.id) ? styles.filterChipActive : ""}`} onClick={() => toggleTag(tag.id)}>#{tag.name}<span className={styles.facetCount}>{tag.noteCount}</span></button>)}</div></div> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={styles.tableWrap}>
          <div className={styles.tableSurface}>
            <div className={styles.tableScroller}>
              <div className={styles.table} style={compactMode ? { ["--library-row-height" as string]: "58px" } : undefined}>
                <div className={styles.headerRow}>
                  <div className={styles.headerCellPrimary}>
                    <label className={styles.checkboxWrap}><input ref={headerCheckboxRef} type="checkbox" checked={allVisibleNotesSelected} onChange={() => setSelectedNoteIds((current) => { const next = new Set(current); if (allVisibleNotesSelected) visibleNoteIds.forEach((id) => next.delete(id)); else visibleNoteIds.forEach((id) => next.add(id)); return next; })} /><span className={styles.checkboxVisual} /></label>
                    <span className={styles.headerCell}>Page name</span>
                  </div>
                  <div className={styles.headerCell}>Kind</div>
                  <div className={styles.headerCell}>Location</div>
                  <div className={styles.headerCell}>Last edited</div>
                </div>

                {visibleRows.length > 0 ? visibleRows.map((row) => {
                  const noteId = row.entry.type === "note" && row.entry.entityId ? row.entry.entityId : null;
                  const categoryTokens = row.entry.categoryColor ? getNoteCategoryColorTokens(row.entry.categoryColor) : null;
                  return (
                    <div key={row.id} ref={(element) => { rowRefs.current[row.id] = element; }} role="button" tabIndex={0} className={styles.rowInteractive} onClick={() => setSelectedId(row.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(row.id); } }}>
                      <div className={`${styles.row} ${effectiveSelectedId === row.id ? styles.rowSelected : ""} ${draggedNoteId === row.entry.entityId ? styles.rowDragging : ""} ${dropTargetEntryId === row.id ? styles.rowDropTarget : ""}`}>
                        <div className={styles.pageCell}>
                          <label className={styles.checkboxWrap} onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={noteId ? effectiveSelectedNoteIds.has(noteId) : false} disabled={!noteId} onChange={() => { if (noteId) { setSelectedNoteIds((current) => { const next = new Set(current); if (next.has(noteId)) { next.delete(noteId); } else { next.add(noteId); } return next; }); } }} /><span className={styles.checkboxVisual} /></label>
                          {row.entry.isDraggable ? <button ref={(element) => { dragHandleRefs.current[row.id] = element; }} type="button" className={styles.dragHandle} title="Drag note into another folder" onClick={(event) => event.stopPropagation()}><span className="material-symbols-outlined sm">drag_indicator</span></button> : <span className={styles.dragSpacer} />}
                          <div className={styles.pageIndent} style={{ width: `${row.depth * 18}px` }} />
                          {row.entry.children.length > 0 ? <button type="button" className={`${styles.expandButton} ${expandedIds.has(row.id) ? styles.expandButtonOpen : ""}`} onClick={(event) => { event.stopPropagation(); setExpandedIds((current) => { const next = new Set(current); if (next.has(row.id)) { next.delete(row.id); } else { next.add(row.id); } return next; }); }}><span className="material-symbols-outlined sm">chevron_right</span></button> : <div className={styles.pageIndent} />}
                          <span className={styles.iconBadge} aria-hidden="true">
                            {renderStoredIcon(row.entry.icon, {
                              fallback: (
                                <span className="material-symbols-outlined sm" aria-hidden="true">
                                  description
                                </span>
                              ),
                              materialClassName: "material-symbols-outlined sm",
                              emojiStyle: { fontSize: "16px", lineHeight: 1 },
                            })}
                          </span>
                          <div className={styles.pageCopy}>
                            <div className={styles.pageTitleRow}>
                              {row.entry.href ? <Link href={row.entry.href} className={styles.pageLink} onClick={(event) => event.stopPropagation()}>{row.entry.title}</Link> : <span className={styles.pageTitle}>{row.entry.title}</span>}
                              {row.entry.isFavorite ? <span className={`${styles.pageMeta} ${styles.favorite}`}><span className="material-symbols-outlined sm">star</span></span> : null}
                            </div>
                            <div className={styles.pageMeta}>
                              <span className={styles.typeChip}>{formatType(row.entry.type)}</span>
                              {row.entry.type === "note" ? <span className={`${styles.visibilityChip} ${row.entry.visibility === "private" ? styles.visibilityPrivate : styles.visibilityShared}`}>{formatVisibility(row.entry.visibility)}</span> : null}
                              {row.entry.categoryName ? <span className={styles.categoryChip} style={categoryTokens ?? undefined}>{row.entry.categoryIcon ? renderStoredIcon(row.entry.categoryIcon, {
                                materialClassName: "material-symbols-outlined sm",
                                emojiStyle: { fontSize: "14px", lineHeight: 1 },
                              }) : null}{row.entry.categoryName}</span> : null}
                              {row.entry.tagNames.slice(0, 2).map((tag) => <span className={styles.tagChip} key={`${row.id}-${tag}`}>#{tag}</span>)}
                              {row.entry.tagNames.length > 2 ? <span className={styles.tagChip}>+{row.entry.tagNames.length - 2} tags</span> : null}
                            </div>
                          </div>
                        </div>
                        <div className={styles.columnText}>{row.entry.kindLabel}</div>
                        <div className={styles.columnText}><span className={styles.sourceChip}>{row.entry.locationLabel}</span></div>
                        <div className={styles.columnText}>{formatRelativeTime(row.entry.updatedAt)}</div>
                      </div>
                    </div>
                  );
                }) : <div className={styles.empty}><div className={styles.emptyTitle}>Bu görünüm boş</div><div className={styles.emptyBody}>Sekmeyi değiştir veya filtreleri azalt.</div></div>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function filterEntries(entries: LibraryEntry[], filters: { activeTab: LibraryTabId; searchQuery: string; activeContentTypes: LibraryContentType[]; activeFlags: LibraryFlagFilterId[]; activeCategoryIds: string[]; activeTagIds: string[]; }) {
  const search = filters.searchQuery.trim().toLocaleLowerCase("tr");
  return sortEntries(entries.map((entry) => filterEntryTree(entry, { ...filters, searchQuery: search })).filter((entry): entry is LibraryEntry => entry !== null), filters.activeTab);
}

function filterEntryTree(entry: LibraryEntry, filters: { activeTab: LibraryTabId; searchQuery: string; activeContentTypes: LibraryContentType[]; activeFlags: LibraryFlagFilterId[]; activeCategoryIds: string[]; activeTagIds: string[]; }): LibraryEntry | null {
  const filteredChildren = sortEntries(entry.children.map((child) => filterEntryTree(child, filters)).filter((child): child is LibraryEntry => child !== null), filters.activeTab);
  const matchesSearch = filters.searchQuery.length === 0 || `${entry.title} ${entry.locationLabel} ${entry.kindLabel} ${entry.categoryName ?? ""} ${entry.tagNames.join(" ")}`.toLocaleLowerCase("tr").includes(filters.searchQuery);
  if (!(matchesTabFilter(entry, filters.activeTab) && matchesSearch && matchesFacetFilters(entry, filters)) && filteredChildren.length === 0) return null;
  return { ...entry, children: filteredChildren, hasChildren: filteredChildren.length > 0 || entry.hasChildren };
}

function flattenEntries(entries: LibraryEntry[], expandedIds: Set<string>, depth = 0): VisibleLibraryRow[] {
  return entries.flatMap((entry) => (entry.children.length === 0 || !expandedIds.has(entry.id)) ? [{ id: entry.id, depth, entry }] : [{ id: entry.id, depth, entry }, ...flattenEntries(entry.children, expandedIds, depth + 1)]);
}

function matchesTabFilter(entry: LibraryEntry, activeTab: LibraryTabId) {
  if (activeTab === "favorites") return entry.isFavorite;
  if (activeTab === "shared") return entry.isPublished;
  if (activeTab === "private") return entry.type === "note" && !entry.isPublished;
  if (activeTab === "ai-meeting-notes") return entry.isAiMeeting;
  return true;
}

function matchesFacetFilters(entry: LibraryEntry, filters: { activeContentTypes: LibraryContentType[]; activeFlags: LibraryFlagFilterId[]; activeCategoryIds: string[]; activeTagIds: string[]; }) {
  if (filters.activeContentTypes.length > 0 && (entry.type === "smart_group" || !filters.activeContentTypes.includes(entry.type))) return false;
  if (filters.activeCategoryIds.length > 0 && (entry.type !== "note" || !entry.categoryId || !filters.activeCategoryIds.includes(entry.categoryId))) return false;
  if (filters.activeTagIds.length > 0 && (entry.type !== "note" || filters.activeTagIds.some((tagId) => !entry.tagIds.includes(tagId)))) return false;
  for (const flag of filters.activeFlags) {
    if (flag === "root" && entry.parentId !== null) return false;
    if (flag === "pinned" && !entry.isFavorite) return false;
    if (flag === "published" && !entry.isPublished) return false;
  }
  return true;
}

function sortEntries(entries: LibraryEntry[], activeTab: LibraryTabId) {
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
      if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }
    if (activeTab === "recents" || activeTab === "favorites") return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    return left.title.localeCompare(right.title, "tr");
  });
}

function formatRelativeTime(input: string) {
  const now = Date.now();
  const target = new Date(input).getTime();
  const diff = target - now;
  const absSeconds = Math.round(Math.abs(diff) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absSeconds < 3600) return rtf.format(Math.round(diff / (1000 * 60)), "minute");
  if (absSeconds < 86400) return rtf.format(Math.round(diff / (1000 * 60 * 60)), "hour");
  if (absSeconds < 86400 * 7) return rtf.format(Math.round(diff / (1000 * 60 * 60 * 24)), "day");
  return new Intl.DateTimeFormat("tr", { month: "short", day: "numeric" }).format(new Date(input));
}

function formatType(type: LibraryEntry["type"]) {
  if (type === "folder") return "Klasör";
  if (type === "template") return "Şablon";
  if (type === "canvas") return "Canvas";
  if (type === "asset") return "Dosya";
  if (type === "smart_group") return "Grup";
  return "Not";
}

function formatVisibility(visibility: LibraryEntry["visibility"]) {
  if (visibility === "published") return "Yayında";
  if (visibility === "private") return "Özel";
  return "İç";
}

function getDropFolderId(entry: LibraryEntry) {
  if (entry.type === "folder") return entry.folderId;
  if (entry.id === LIBRARY_UNFILED_GROUP_ID) return null;
  return null;
}

function isLibraryNoteDragData(value: unknown): value is LibraryNoteDragData {
  return Boolean(value && typeof value === "object" && "type" in value && "noteId" in value && "folderId" in value && (value as LibraryNoteDragData).type === "library-note" && typeof (value as LibraryNoteDragData).noteId === "string");
}

function isLibraryNoteDropData(value: unknown): value is LibraryNoteDropData {
  return Boolean(value && typeof value === "object" && "type" in value && "entryId" in value && "folderId" in value && (value as LibraryNoteDropData).type === "library-note-drop-target" && typeof (value as LibraryNoteDropData).entryId === "string" && (typeof (value as LibraryNoteDropData).folderId === "string" || (value as LibraryNoteDropData).folderId === null));
}
