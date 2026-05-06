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
import { PageTopbar } from "@/components/ui/PageTopbar";
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

type LibraryViewMode = "icons" | "list" | "columns" | "gallery";

interface VisibleLibraryRow {
  id: string;
  depth: number;
  entry: LibraryEntry;
}

interface ColumnsGroupRow {
  id: string;
  depth: number;
  entry: LibraryEntry;
}

const VIEW_MODE_OPTIONS: Array<{ id: LibraryViewMode; icon: string; label: string }> = [
  { id: "icons", icon: "grid_view", label: "Icons" },
  { id: "list", icon: "table_rows", label: "List" },
  { id: "columns", icon: "view_column", label: "Columns" },
  { id: "gallery", icon: "photo_library", label: "Gallery" },
];

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
  const [compactMode, setCompactMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTargetEntryId, setDropTargetEntryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LibraryViewMode>("list");
  const [columnsActiveGroupId, setColumnsActiveGroupId] = useState<string | null>(null);
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
      }),
    [activeCategoryIds, activeContentTypes, activeFlags, activeTab, entries, searchQuery]
  );
  const entryById = useMemo(() => buildEntryIndex(filteredEntries), [filteredEntries]);
  const expandedRowsOutsideList = useMemo(
    () => new Set(collectExpandableIds(filteredEntries)),
    [filteredEntries]
  );
  const visibleRows = useMemo(
    () =>
      flattenEntries(
        filteredEntries,
        viewMode === "list" ? expandedIds : expandedRowsOutsideList
      ),
    [expandedIds, expandedRowsOutsideList, filteredEntries, viewMode]
  );
  const allRows = useMemo(
    () => flattenEntries(entries, new Set(initialExpandedIds)),
    [entries, initialExpandedIds]
  );
  const noteEntryById = useMemo(() => {
    const next = new Map<string, LibraryEntry>();
    for (const row of allRows) {
      if (row.entry.type === "note" && row.entry.entityId) {
        next.set(row.entry.entityId, row.entry);
      }
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
  const activeRow = entryById.get(effectiveSelectedId) ?? null;
  const visibleNoteIds = visibleRows
    .filter(
      (
        row
      ): row is VisibleLibraryRow & {
        entry: LibraryEntry & { type: "note"; entityId: string };
      } => row.entry.type === "note" && typeof row.entry.entityId === "string"
    )
    .map((row) => row.entry.entityId);
  const selectedNoteIdsArray = Array.from(effectiveSelectedNoteIds);
  const selectedNoteEntries = selectedNoteIdsArray
    .map((noteId) => noteEntryById.get(noteId))
    .filter((entry): entry is LibraryEntry => Boolean(entry));
  const allVisibleNotesSelected =
    visibleNoteIds.length > 0 &&
    visibleNoteIds.every((noteId) => effectiveSelectedNoteIds.has(noteId));
  const someVisibleNotesSelected =
    visibleNoteIds.some((noteId) => effectiveSelectedNoteIds.has(noteId)) &&
    !allVisibleNotesSelected;
  const selectedHasPrivate = selectedNoteEntries.some((entry) => !entry.isPublished);
  const selectedHasPublished = selectedNoteEntries.some((entry) => entry.isPublished);

  const columnsGroupRows = useMemo(
    () => flattenContainerRows(filteredEntries),
    [filteredEntries]
  );
  const activeColumnsGroup = useMemo(() => {
    const selectedGroup = columnsActiveGroupId ? entryById.get(columnsActiveGroupId) : null;
    if (selectedGroup && isContainerEntry(selectedGroup)) {
      return selectedGroup;
    }

    return columnsGroupRows[0]?.entry ?? null;
  }, [columnsActiveGroupId, columnsGroupRows, entryById]);
  const resolvedColumnsActiveGroupId = activeColumnsGroup?.id ?? null;
  const columnsItems = activeColumnsGroup?.children ?? [];
  const columnsPreviewEntry =
    entryById.get(effectiveSelectedId) ?? activeColumnsGroup;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleNotesSelected;
    }
  }, [someVisibleNotesSelected]);

  useEffect(() => {
    if (viewMode !== "list") return;
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
  }, [router, viewMode, visibleRows]);

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

  const topbarMeta = (
    <div className={styles.topbarTabs}>
      {LIBRARY_TABS.map((tab) => (
        <button key={tab.id} type="button" className={`${styles.topbarTab} ${activeTab === tab.id ? styles.topbarTabActive : ""}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
      ))}
    </div>
  );

  const topbarActions = (
    <>
      <div className={styles.viewModeGroup} aria-label="Library view mode">
        {VIEW_MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={viewMode === option.id}
            aria-label={`${option.label} view`}
            className={`${styles.viewModeBtn} ${viewMode === option.id ? styles.viewModeBtnActive : ""}`}
            onClick={() => setViewMode(option.id)}
            title={option.label}
          >
            <span className={`material-symbols-outlined ${styles.viewModeBtnIcon}`} aria-hidden="true">
              {option.icon}
            </span>
            <span className={styles.viewModeBtnLabel}>{option.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className={`${styles.iconButton} ${filterPanelVisible ? styles.iconButtonActive : ""}`} onClick={() => setFilterPanelVisible((current) => !current)} title="Filters"><span className="material-symbols-outlined">filter_alt</span></button>
      <button type="button" className={`${styles.iconButton} ${searchVisible ? styles.iconButtonActive : ""}`} onClick={() => setSearchVisible((current) => !current)} title="Search"><span className="material-symbols-outlined">search</span></button>
      {viewMode === "list" && (
        <button type="button" className={`${styles.iconButton} ${compactMode ? styles.iconButtonActive : ""}`} onClick={() => setCompactMode((current) => !current)} title="Density"><span className="material-symbols-outlined">density_small</span></button>
      )}
      <Button variant="filled" leadingIcon="add" onClick={handleCreatePage} disabled={isCreatingPage}>{isCreatingPage ? "Creating..." : "New"}</Button>
    </>
  );

  const controlsNode = (searchVisible || filterPanelVisible) ? (
    <div className={styles.controls}>
      {searchVisible ? <div className={styles.searchRow}><input className={styles.searchField} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Folder, note, tag..." autoFocus /></div> : null}
      {filterPanelVisible ? (
        <div className={styles.facetPanel}>
          <div className={styles.facetSection}>
            <div className={styles.facetSectionHeader}>
              <span className={styles.facetTitle}>Quick filters</span>
              <button type="button" className={styles.clearFiltersButton} onClick={() => { setActiveContentTypes([]); setActiveFlags([]); setActiveCategoryIds([]); }}>Clear</button>
            </div>
            <div className={styles.filterRow}>{LIBRARY_FLAG_FILTERS.map((filter) => <button key={filter.id} type="button" className={`${styles.filterChip} ${activeFlags.includes(filter.id) ? styles.filterChipActive : ""}`} onClick={() => toggleFlag(filter.id)}>{filter.label}</button>)}</div>
          </div>
          <div className={styles.facetSection}>
            <span className={styles.facetTitle}>Content types</span>
            <div className={styles.filterRow}>{LIBRARY_CONTENT_FILTERS.map((filter) => <button key={filter.id} type="button" className={`${styles.filterChip} ${activeContentTypes.includes(filter.id) ? styles.filterChipActive : ""}`} onClick={() => toggleContentType(filter.id)}>{filter.label}</button>)}</div>
          </div>
          {categories.length > 0 ? <div className={styles.facetSection}><span className={styles.facetTitle}>Categories</span><div className={styles.filterRow}>{categories.map((category) => <button key={category.id} type="button" className={`${styles.filterChip} ${activeCategoryIds.includes(category.id) ? styles.filterChipActive : ""}`} onClick={() => toggleCategory(category.id)} style={activeCategoryIds.includes(category.id) ? getNoteCategoryColorTokens(category.color) : undefined}>{category.icon ? <span className="material-symbols-outlined sm">{category.icon}</span> : null}{category.name}<span className={styles.facetCount}>{category.noteCount}</span></button>)}</div></div> : null}
        </div>
      ) : null}
    </div>
  ) : null;

  const bulkBarNode = selectedNoteEntries.length > 0 ? (
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
  ) : null;

  return (
    <div className={styles.root}>
      <PageTopbar
        icon="library_books"
        label="Library"
        meta={topbarMeta}
        actions={topbarActions}
      />
      <section className={styles.surface}>
        <div className={styles.metaCompact}>
          <span>{visibleRows.length} records</span>
          <span className={styles.metaDot} />
          <span>{activeRow?.title ?? "No selection"}</span>
          <span className={styles.metaDot} />
          <span>{totalCanvases} canvas</span>
          <span className={styles.metaDot} />
          <span>{totalAssets} files</span>
        </div>

        {bulkBarNode}
        {controlsNode}

        {viewMode === "icons" && (
          <IconsView
            visibleRows={visibleRows}
            effectiveSelectedId={effectiveSelectedId}
            draggedNoteId={draggedNoteId}
            onSelect={setSelectedId}
          />
        )}

        {viewMode === "list" && (
          <ListView
            visibleRows={visibleRows}
            effectiveSelectedId={effectiveSelectedId}
            effectiveSelectedNoteIds={effectiveSelectedNoteIds}
            allVisibleNotesSelected={allVisibleNotesSelected}
            draggedNoteId={draggedNoteId}
            dropTargetEntryId={dropTargetEntryId}
            expandedIds={expandedIds}
            compactMode={compactMode}
            headerCheckboxRef={headerCheckboxRef}
            rowRefs={rowRefs}
            dragHandleRefs={dragHandleRefs}
            onSelect={setSelectedId}
            onToggleExpand={(id) => setExpandedIds((current) => { const next = new Set(current); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; })}
            onToggleNoteSelect={(noteId) => setSelectedNoteIds((current) => { const next = new Set(current); if (next.has(noteId)) { next.delete(noteId); } else { next.add(noteId); } return next; })}
            onToggleAll={() => setSelectedNoteIds((current) => { const next = new Set(current); if (allVisibleNotesSelected) visibleNoteIds.forEach((id) => next.delete(id)); else visibleNoteIds.forEach((id) => next.add(id)); return next; })}
          />
        )}

        {viewMode === "columns" && (
          <ColumnsView
            groupRows={columnsGroupRows}
            columnsItems={columnsItems}
            activeColumnsGroup={activeColumnsGroup}
            columnsPreviewEntry={columnsPreviewEntry}
            effectiveSelectedId={effectiveSelectedId}
            columnsActiveGroupId={resolvedColumnsActiveGroupId}
            onSelectGroup={(id) => {
              setColumnsActiveGroupId(id);
              setSelectedId(id);
            }}
            onSelectItem={(entry) => {
              setSelectedId(entry.id);
              if (isContainerEntry(entry)) {
                setColumnsActiveGroupId(entry.id);
              }
            }}
          />
        )}

        {viewMode === "gallery" && (
          <GalleryView
            visibleRows={visibleRows}
            effectiveSelectedId={effectiveSelectedId}
            onSelect={setSelectedId}
          />
        )}
      </section>
    </div>
  );
}

// ─── Icons View ───────────────────────────────────────────────────────────────

interface IconsViewProps {
  visibleRows: VisibleLibraryRow[];
  effectiveSelectedId: string;
  draggedNoteId: string | null;
  onSelect: (id: string) => void;
}

function IconsView({ visibleRows, effectiveSelectedId, draggedNoteId, onSelect }: IconsViewProps) {
  if (visibleRows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className={styles.iconsGrid}>
      {visibleRows.map((row) => {
        const isSelected = effectiveSelectedId === row.id;
        const isDragging = draggedNoteId === row.entry.entityId;
        const categoryTokens = row.entry.categoryColor ? getNoteCategoryColorTokens(row.entry.categoryColor) : null;

        return (
          <button
            key={row.id}
            type="button"
            className={`${styles.iconTile} ${isSelected ? styles.iconTileSelected : ""} ${isDragging ? styles.iconTileDragging : ""}`}
            onClick={() => onSelect(row.id)}
            onDoubleClick={() => { if (row.entry.href) window.location.href = row.entry.href; }}
            title={row.entry.title}
          >
            <div className={styles.iconTileIconWrap}>
              <span className={`${styles.iconTileIcon} ${row.entry.type === "folder" || row.entry.type === "smart_group" ? styles.iconTileIconFolder : ""}`} aria-hidden="true">
                {renderStoredIcon(row.entry.icon, {
                  fallback: <span className="material-symbols-outlined">description</span>,
                  materialClassName: "material-symbols-outlined",
                  emojiStyle: { fontSize: "24px", lineHeight: 1 },
                })}
              </span>
              {row.entry.isFavorite && <span className={styles.iconTileFavBadge}><span className="material-symbols-outlined">star</span></span>}
              {row.entry.type === "note" && (
                <span className={`${styles.iconTileVisiBadge} ${row.entry.isPublished ? styles.iconTileVisiPublished : styles.iconTileVisiPrivate}`}>
                  <span className="material-symbols-outlined">{row.entry.isPublished ? "public" : "lock"}</span>
                </span>
              )}
            </div>
            <span className={styles.iconTileTitle}>{row.entry.title}</span>
            <span className={styles.iconTileMeta}>
              {row.entry.categoryName
                ? <span className={styles.iconTileCategoryDot} style={categoryTokens ?? undefined} />
                : null}
              {row.entry.kindLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

interface ListViewProps {
  visibleRows: VisibleLibraryRow[];
  effectiveSelectedId: string;
  effectiveSelectedNoteIds: Set<string>;
  allVisibleNotesSelected: boolean;
  draggedNoteId: string | null;
  dropTargetEntryId: string | null;
  expandedIds: Set<string>;
  compactMode: boolean;
  headerCheckboxRef: React.RefObject<HTMLInputElement | null>;
  rowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  dragHandleRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleNoteSelect: (noteId: string) => void;
  onToggleAll: () => void;
}

function ListView({
  visibleRows,
  effectiveSelectedId,
  effectiveSelectedNoteIds,
  allVisibleNotesSelected,
  draggedNoteId,
  dropTargetEntryId,
  expandedIds,
  compactMode,
  headerCheckboxRef,
  rowRefs,
  dragHandleRefs,
  onSelect,
  onToggleExpand,
  onToggleNoteSelect,
  onToggleAll,
}: ListViewProps) {
  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableSurface}>
        <div className={styles.tableScroller}>
          <div className={styles.table} style={compactMode ? { ["--library-row-height" as string]: "40px" } : undefined}>
            <div className={styles.headerRow}>
              <div className={styles.headerCellPrimary}>
                <label className={styles.checkboxWrap}>
                  <input ref={headerCheckboxRef} type="checkbox" checked={allVisibleNotesSelected} onChange={onToggleAll} />
                  <span className={styles.checkboxVisual} />
                </label>
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
                <div key={row.id} ref={(element) => { rowRefs.current[row.id] = element; }} role="button" tabIndex={0} className={styles.rowInteractive} onClick={() => onSelect(row.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row.id); } }}>
                  <div className={`${styles.row} ${effectiveSelectedId === row.id ? styles.rowSelected : ""} ${draggedNoteId === row.entry.entityId ? styles.rowDragging : ""} ${dropTargetEntryId === row.id ? styles.rowDropTarget : ""}`}>
                    <div className={styles.pageCell}>
                      <label className={styles.checkboxWrap} onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={noteId ? effectiveSelectedNoteIds.has(noteId) : false} disabled={!noteId} onChange={() => { if (noteId) onToggleNoteSelect(noteId); }} />
                        <span className={styles.checkboxVisual} />
                      </label>
                      {row.entry.isDraggable ? <button ref={(element) => { dragHandleRefs.current[row.id] = element; }} type="button" className={styles.dragHandle} title="Drag note into another folder" onClick={(event) => event.stopPropagation()}><span className="material-symbols-outlined sm">drag_indicator</span></button> : <span className={styles.dragSpacer} />}
                      <div className={styles.pageIndent} style={{ width: `${row.depth * 18}px` }} />
                      {row.entry.children.length > 0 ? <button type="button" className={`${styles.expandButton} ${expandedIds.has(row.id) ? styles.expandButtonOpen : ""}`} onClick={(event) => { event.stopPropagation(); onToggleExpand(row.id); }}><span className="material-symbols-outlined sm">chevron_right</span></button> : <div className={styles.pageIndent} />}
                      <span className={styles.iconBadge} aria-hidden="true">
                        {renderStoredIcon(row.entry.icon, {
                          fallback: <span className="material-symbols-outlined sm">description</span>,
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
                          {row.entry.categoryName ? <span className={styles.categoryChip} style={categoryTokens ?? undefined}>{row.entry.categoryIcon ? renderStoredIcon(row.entry.categoryIcon, { materialClassName: "material-symbols-outlined sm", emojiStyle: { fontSize: "14px", lineHeight: 1 } }) : null}{row.entry.categoryName}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className={styles.columnText}>{row.entry.kindLabel}</div>
                    <div className={styles.columnText}><span className={styles.sourceChip}>{row.entry.locationLabel}</span></div>
                    <div className={styles.columnText}>{formatRelativeTime(row.entry.updatedAt)}</div>
                  </div>
                </div>
              );
            }) : <EmptyState />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Columns View ─────────────────────────────────────────────────────────────

interface ColumnsViewProps {
  groupRows: ColumnsGroupRow[];
  columnsItems: LibraryEntry[];
  activeColumnsGroup: LibraryEntry | null;
  columnsPreviewEntry: LibraryEntry | null;
  effectiveSelectedId: string;
  columnsActiveGroupId: string | null;
  onSelectGroup: (id: string) => void;
  onSelectItem: (entry: LibraryEntry) => void;
}

function ColumnsView({
  groupRows,
  columnsItems,
  activeColumnsGroup,
  columnsPreviewEntry,
  effectiveSelectedId,
  columnsActiveGroupId,
  onSelectGroup,
  onSelectItem,
}: ColumnsViewProps) {
  return (
    <div className={styles.columnsLayout}>
      <div className={styles.columnsPanel}>
        <div className={styles.columnsPanelHeader}>Folder tree</div>
        <div className={styles.columnsPanelList}>
          {groupRows.length === 0 ? (
            <div className={styles.columnsPanelEmpty}>No folders to show</div>
          ) : (
            groupRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`${styles.columnsPanelItem} ${
                  columnsActiveGroupId === row.id ? styles.columnsPanelItemActive : ""
                }`}
                onClick={() => onSelectGroup(row.id)}
              >
                <span
                  className={styles.columnsPanelIndent}
                  style={{ width: `${row.depth * 12}px` }}
                  aria-hidden="true"
                />
                <span className={styles.columnsPanelIcon}>
                  {renderStoredIcon(row.entry.icon, {
                    fallback: <span className="material-symbols-outlined sm">folder</span>,
                    materialClassName: "material-symbols-outlined sm",
                    emojiStyle: { fontSize: "15px", lineHeight: 1 },
                  })}
                </span>
                <span className={styles.columnsPanelLabel}>{row.entry.title}</span>
                {row.entry.noteCount > 0 ? (
                  <span className={styles.columnsPanelMeta}>{row.entry.noteCount}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      <div className={styles.columnsPanel}>
        <div className={styles.columnsPanelHeader}>{activeColumnsGroup?.title ?? "Items"}</div>
        <div className={styles.columnsPanelList}>
          {columnsItems.length === 0 ? (
            <div className={styles.columnsPanelEmpty}>No items in this folder</div>
          ) : (
            columnsItems.map((entry) => {
              const isContainer = isContainerEntry(entry);

              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.columnsPanelItem} ${
                    effectiveSelectedId === entry.id ? styles.columnsPanelItemActive : ""
                  }`}
                  onClick={() => onSelectItem(entry)}
                >
                  <span className={styles.columnsPanelIcon}>
                    {renderStoredIcon(entry.icon, {
                      fallback: <span className="material-symbols-outlined sm">description</span>,
                      materialClassName: "material-symbols-outlined sm",
                      emojiStyle: { fontSize: "15px", lineHeight: 1 },
                    })}
                  </span>
                  <span className={styles.columnsPanelLabel}>{entry.title}</span>
                  {isContainer ? (
                    <span className={styles.columnsPanelChevron}>
                      <span className="material-symbols-outlined">chevron_right</span>
                    </span>
                  ) : (
                    <span className={styles.columnsPanelMeta}>
                      {formatRelativeTime(entry.updatedAt)}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={`${styles.columnsPanel} ${styles.columnsPanelPreview}`}>
        <div className={styles.columnsPanelHeader}>Preview</div>
        {columnsPreviewEntry ? (
          <ColumnsPreview entry={columnsPreviewEntry} />
        ) : (
          <div className={styles.columnsPanelEmpty}>Select an item</div>
        )}
      </div>
    </div>
  );
}

function ColumnsPreview({ entry }: { entry: LibraryEntry }) {
  const categoryTokens = entry.categoryColor ? getNoteCategoryColorTokens(entry.categoryColor) : null;

  return (
    <div className={styles.columnsPreviewContent}>
      <div className={styles.columnsPreviewIconWrap}>
        <span className={styles.columnsPreviewIcon}>
          {renderStoredIcon(entry.icon, {
            fallback: <span className="material-symbols-outlined">description</span>,
            materialClassName: "material-symbols-outlined",
            emojiStyle: { fontSize: "36px", lineHeight: 1 },
          })}
        </span>
      </div>
      <div className={styles.columnsPreviewTitle}>{entry.title}</div>
      {entry.type === "note" && (
        <div className={styles.columnsPreviewBadges}>
          <span className={`${styles.visibilityChip} ${entry.visibility === "private" ? styles.visibilityPrivate : styles.visibilityShared}`}>
            <span className="material-symbols-outlined sm">{entry.isPublished ? "public" : "lock"}</span>
            {formatVisibility(entry.visibility)}
          </span>
          {entry.isFavorite && <span className={`${styles.typeChip} ${styles.favorite}`}><span className="material-symbols-outlined sm">star</span>Pinned</span>}
        </div>
      )}
      <div className={styles.columnsPreviewMeta}>
        <PreviewMetaRow icon="category" label="Type" value={formatType(entry.type)} />
        <PreviewMetaRow icon="folder" label="Location" value={entry.locationLabel} />
        <PreviewMetaRow icon="schedule" label="Updated" value={formatRelativeTime(entry.updatedAt)} />
        {entry.categoryName && (
          <div className={styles.columnsPreviewMetaRow}>
            <span className={styles.columnsPreviewMetaIcon}><span className="material-symbols-outlined sm">label</span></span>
            <span className={styles.columnsPreviewMetaLabel}>Category</span>
            <span className={styles.categoryChip} style={categoryTokens ?? undefined}>{entry.categoryName}</span>
          </div>
        )}
      </div>
      {entry.href && (
        <Link href={entry.href} className={styles.columnsPreviewOpenBtn}>
          <span className="material-symbols-outlined sm">open_in_new</span>
          Open
        </Link>
      )}
    </div>
  );
}

function PreviewMetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className={styles.columnsPreviewMetaRow}>
      <span className={styles.columnsPreviewMetaIcon}><span className="material-symbols-outlined sm">{icon}</span></span>
      <span className={styles.columnsPreviewMetaLabel}>{label}</span>
      <span className={styles.columnsPreviewMetaValue}>{value}</span>
    </div>
  );
}

// ─── Gallery View ─────────────────────────────────────────────────────────────

interface GalleryViewProps {
  visibleRows: VisibleLibraryRow[];
  effectiveSelectedId: string;
  onSelect: (id: string) => void;
}

function GalleryView({ visibleRows, effectiveSelectedId, onSelect }: GalleryViewProps) {
  if (visibleRows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className={styles.galleryGrid}>
      {visibleRows.map((row) => {
        const isSelected = effectiveSelectedId === row.id;
        const categoryTokens = row.entry.categoryColor ? getNoteCategoryColorTokens(row.entry.categoryColor) : null;
        const isFolder = row.entry.type === "folder" || row.entry.type === "smart_group";

        return (
          <div
            key={row.id}
            className={`${styles.galleryCard} ${isSelected ? styles.galleryCardSelected : ""} ${isFolder ? styles.galleryCardFolder : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(row.id)}
            onDoubleClick={() => { if (row.entry.href) window.location.href = row.entry.href; }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row.id); } }}
          >
            <div className={styles.galleryCardHeader}>
              <div className={styles.galleryCardIconWrap}>
                <span className={styles.galleryCardIcon}>
                  {renderStoredIcon(row.entry.icon, {
                    fallback: <span className="material-symbols-outlined">description</span>,
                    materialClassName: "material-symbols-outlined",
                    emojiStyle: { fontSize: "28px", lineHeight: 1 },
                  })}
                </span>
              </div>
              <div className={styles.galleryCardBadges}>
                {row.entry.isFavorite && <span className={styles.galleryBadge}><span className="material-symbols-outlined sm">star</span></span>}
                {row.entry.type === "note" && (
                  <span className={`${styles.galleryBadge} ${row.entry.isPublished ? styles.galleryBadgePublished : styles.galleryBadgePrivate}`}>
                    <span className="material-symbols-outlined sm">{row.entry.isPublished ? "public" : "lock"}</span>
                  </span>
                )}
              </div>
            </div>

            <div className={styles.galleryCardBody}>
              {row.entry.href ? (
                <Link href={row.entry.href} className={styles.galleryCardTitle} onClick={(e) => e.stopPropagation()}>
                  {row.entry.title}
                </Link>
              ) : (
                <span className={styles.galleryCardTitle}>{row.entry.title}</span>
              )}
              <span className={styles.galleryCardKind}>{row.entry.kindLabel}</span>
            </div>

            <div className={styles.galleryCardFooter}>
              {row.entry.categoryName && (
                <span className={styles.categoryChip} style={categoryTokens ?? undefined}>
                  {row.entry.categoryName}
                </span>
              )}
              <span className={styles.galleryCardDate}>{formatRelativeTime(row.entry.updatedAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>This view is empty</div>
      <div className={styles.emptyBody}>Switch tabs or reduce the filters.</div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEntryIndex(entries: LibraryEntry[]) {
  const index = new Map<string, LibraryEntry>();

  const visit = (nodes: LibraryEntry[]) => {
    for (const node of nodes) {
      index.set(node.id, node);
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(entries);
  return index;
}

function collectExpandableIds(entries: LibraryEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.children.length > 0
      ? [entry.id, ...collectExpandableIds(entry.children)]
      : []
  );
}

function flattenContainerRows(
  entries: LibraryEntry[],
  depth = 0
): ColumnsGroupRow[] {
  return entries.flatMap((entry) => {
    const childRows = flattenContainerRows(entry.children, depth + 1);

    if (!isContainerEntry(entry)) {
      return childRows;
    }

    return [{ id: entry.id, depth, entry }, ...childRows];
  });
}

function filterEntries(entries: LibraryEntry[], filters: { activeTab: LibraryTabId; searchQuery: string; activeContentTypes: LibraryContentType[]; activeFlags: LibraryFlagFilterId[]; activeCategoryIds: string[]; }) {
  const search = filters.searchQuery.trim().toLocaleLowerCase("tr");
  const normalizedFilters = { ...filters, searchQuery: search };

  return sortEntries(
    entries
      .map((entry) => filterEntryTree(entry, normalizedFilters))
      .filter((entry): entry is LibraryEntry => entry !== null),
    filters.activeTab
  );
}

function filterEntryTree(entry: LibraryEntry, filters: { activeTab: LibraryTabId; searchQuery: string; activeContentTypes: LibraryContentType[]; activeFlags: LibraryFlagFilterId[]; activeCategoryIds: string[]; }): LibraryEntry | null {
  const filteredChildren = sortEntries(
    entry.children
      .map((child) => filterEntryTree(child, filters))
      .filter((child): child is LibraryEntry => child !== null),
    filters.activeTab
  );
  const matchesSearch =
    filters.searchQuery.length === 0 ||
    `${entry.title} ${entry.locationLabel} ${entry.kindLabel} ${
      entry.categoryName ?? ""
    }`
      .toLocaleLowerCase("tr")
      .includes(filters.searchQuery);

  const matchesSelf =
    matchesTabFilter(entry, filters.activeTab) &&
    matchesSearch &&
    matchesFacetFilters(entry, filters);
  const keepFolderShell = shouldKeepFolderShell(entry, filters);

  if (!matchesSelf && filteredChildren.length === 0 && !keepFolderShell) {
    return null;
  }

  return {
    ...entry,
    children: filteredChildren,
    hasChildren: filteredChildren.length > 0 || entry.hasChildren,
  };
}

function flattenEntries(entries: LibraryEntry[], expandedIds: Set<string>, depth = 0): VisibleLibraryRow[] {
  return entries.flatMap((entry) => (entry.children.length === 0 || !expandedIds.has(entry.id)) ? [{ id: entry.id, depth, entry }] : [{ id: entry.id, depth, entry }, ...flattenEntries(entry.children, expandedIds, depth + 1)]);
}

function shouldKeepFolderShell(entry: LibraryEntry, filters: { activeContentTypes: LibraryContentType[]; activeFlags: LibraryFlagFilterId[]; searchQuery: string; }) {
  if (entry.type !== "folder") {
    return false;
  }

  if (filters.searchQuery.length > 0) {
    return false;
  }

  if (filters.activeFlags.includes("root") && entry.parentId !== null) {
    return false;
  }

  if (
    filters.activeContentTypes.length > 0 &&
    !filters.activeContentTypes.includes("folder")
  ) {
    return false;
  }

  return true;
}

function matchesTabFilter(entry: LibraryEntry, activeTab: LibraryTabId) {
  if (entry.type === "folder") {
    return true;
  }

  if (activeTab === "favorites") return entry.isFavorite;
  if (activeTab === "shared") return entry.isPublished;
  if (activeTab === "private") return entry.type === "note" && !entry.isPublished;
  if (activeTab === "ai-meeting-notes") return entry.isAiMeeting;
  return true;
}

function matchesFacetFilters(entry: LibraryEntry, filters: { activeContentTypes: LibraryContentType[]; activeFlags: LibraryFlagFilterId[]; activeCategoryIds: string[]; }) {
  if (filters.activeContentTypes.length > 0 && (entry.type === "smart_group" || !filters.activeContentTypes.includes(entry.type))) return false;
  if (filters.activeCategoryIds.length > 0 && (entry.type !== "note" || !entry.categoryId || !filters.activeCategoryIds.includes(entry.categoryId))) return false;
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

    if (left.type === "folder" && right.type === "folder") {
      return 0;
    }

    if (left.type === "smart_group" && right.type === "smart_group") {
      return 0;
    }

    if (left.type === "note" && right.type === "note") {
      if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    if (activeTab === "recents" || activeTab === "favorites") {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

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
  if (type === "folder") return "Folder";
  if (type === "canvas") return "Canvas";
  if (type === "asset") return "File";
  if (type === "smart_group") return "Group";
  return "Note";
}

function formatVisibility(visibility: LibraryEntry["visibility"]) {
  if (visibility === "published") return "Published";
  if (visibility === "private") return "Private";
  return "Internal";
}

function isContainerEntry(entry: LibraryEntry) {
  return entry.type === "folder" || entry.type === "smart_group";
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
