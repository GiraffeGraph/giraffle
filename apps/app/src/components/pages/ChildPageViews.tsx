import type {
  ChildView,
  Page as PageModel,
  PagePriority,
} from "@giraffle/domain";
import { router } from "expo-router";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  DragSortItem,
  DragSortProvider,
  useDragSort,
  type DropTarget,
} from "@/components/dnd/DragSortContext";
import { EditableText } from "@/components/ui/EditableText";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Button, Icon } from "@/components/ui/primitives";
import { useUndo } from "@/components/ui/UndoProvider";
import { useTheme } from "@/design/ThemeProvider";
import {
  controls,
  documentScale,
  radii,
  spacing,
  typography,
} from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const views: { id: ChildView; label: string }[] = [
  { id: "list", label: "List" },
  { id: "category", label: "Category" },
  { id: "priority", label: "Priority" },
];
const priorities: [PagePriority, string][] = [
  ["do", "Focus"],
  ["schedule", "Plan"],
  ["delegate", "Delegate"],
  ["eliminate", "Drop"],
];

const CATEGORY_LANE = "category-lane:";
const CATEGORY_PAGE = "category-page:";
const PRIORITY_LANE = "priority-lane:";
const PRIORITY_PAGE = "priority-page:";
const NONE = "none";
const activationDelay = Platform.OS === "web" ? 0 : 220;
const ignoreDrop = () => undefined;

/** Direct children are part of the document, so their views stay inline. */
export function ChildPageViews({ parent }: { parent: PageModel }) {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const commit = useUndo();
  const children = snapshot.pages
    .filter((page) => page.parentId === parent.id && !page.isArchived)
    .sort((a, b) => a.position.localeCompare(b.position));
  const categories = snapshot.categories
    .filter((category) => category.parentId === parent.id)
    .sort((a, b) => a.position.localeCompare(b.position));

  if (!children.length) return null;

  const add = (categoryId: string | null = null) =>
    void run(async (repository) => {
      const id = await repository.createPage({ parentId: parent.id });
      if (categoryId) await repository.updatePage(id, { categoryId });
      return id;
    }).then((id) => router.push(`/pages/${id}`));
  const createCategory = () =>
    void run((repository) => repository.createCategory({ parentId: parent.id }));
  const grouped = children.length > 1;
  const view = grouped ? parent.childView : "list";

  return (
    <View style={[styles.root, { borderTopColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[typography.title, { color: colors.text }]}>Subpages</Text>
        <Text style={[typography.caption, { color: colors.muted }]}>{children.length}</Text>
        <View style={styles.headerSpacer} />
        {grouped ? (
          <ViewTabs
            value={parent.childView}
            onChange={(childView) =>
              void run((repository) => repository.updatePage(parent.id, { childView }))
            }
          />
        ) : null}
        {view === "category" ? (
          <Button label="Category" icon="add" onPress={createCategory} />
        ) : (
          <Button icon="add" accessibilityLabel="Add subpage" onPress={() => add()} />
        )}
      </View>

      {view === "list" ? (
        <ScrollView style={styles.verticalViewport} contentContainerStyle={styles.listContent}>
          <List pages={children} />
        </ScrollView>
      ) : view === "category" ? (
        <Category
          pages={children}
          categories={categories}
          onAdd={add}
          onMove={(pageId, categoryId) => {
            const previous = children.find((page) => page.id === pageId)?.categoryId ?? null;
            const target = categories.find((category) => category.id === categoryId)?.title;
            void commit({
              label: `Moved to ${target ?? "No category"}`,
              action: () =>
                run((repository) => repository.updatePage(pageId, { categoryId })),
              undo: () =>
                run((repository) => repository.updatePage(pageId, { categoryId: previous })),
            });
          }}
          onRename={(categoryId, title) =>
            void run((repository) => repository.updateCategory(categoryId, { title }))
          }
          onDelete={(categoryId) =>
            void run((repository) => repository.deleteCategory(categoryId))
          }
        />
      ) : (
        <Priority
          pages={children}
          onMove={(pageId, priority) => {
            const previous = children.find((page) => page.id === pageId)?.priority ?? null;
            const target = priorities.find(([value]) => value === priority)?.[1];
            void commit({
              label: `Moved to ${target ?? "No priority"}`,
              action: () => run((repository) => repository.updatePage(pageId, { priority })),
              undo: () =>
                run((repository) => repository.updatePage(pageId, { priority: previous })),
            });
          }}
        />
      )}
    </View>
  );
}

function ViewTabs({ value, onChange }: { value: ChildView; onChange(value: ChildView): void }) {
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {views.map((view) => (
        <ViewTab
          key={view.id}
          label={view.label}
          selected={view.id === value}
          onPress={() => onChange(view.id)}
        />
      ))}
    </View>
  );
}

function ViewTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={[
        styles.tab,
        {
          borderBottomColor: selected ? colors.text : "transparent",
          backgroundColor: hovered ? colors.hover : "transparent",
        },
      ]}
    >
      <Text style={[typography.label, { color: selected ? colors.text : colors.muted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({
  page,
  draggable = false,
  dragging = false,
}: {
  page: PageModel;
  draggable?: boolean;
  dragging?: boolean;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const title = page.title || "Untitled";
  const showHandle = draggable && (Platform.OS !== "web" || hovered || dragging);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${title}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => router.push(`/pages/${page.id}`)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed || hovered ? colors.hover : "transparent",
          opacity: dragging ? 0.46 : 1,
        },
      ]}
    >
      {page.icon ? (
        <Text style={styles.rowIcon}>{page.icon}</Text>
      ) : (
        <View style={styles.rowIconSlot}>
          <Icon name="document-text-outline" size={16} color={colors.faint} />
        </View>
      )}
      <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
        {title}
      </Text>
      <View style={styles.dragSlot}>
        {showHandle ? <Icon name="reorder-three-outline" size={16} color={colors.faint} /> : null}
      </View>
    </Pressable>
  );
}

function List({ pages }: { pages: PageModel[] }) {
  return <View>{pages.map((page) => <Row key={page.id} page={page} />)}</View>;
}

function Category({
  pages,
  categories,
  onAdd,
  onMove,
  onRename,
  onDelete,
}: {
  pages: PageModel[];
  categories: { id: string; title: string; color: string | null }[];
  onAdd(id: string | null): void;
  onMove(pageId: string, categoryId: string | null): void;
  onRename(id: string, title: string): void;
  onDelete(id: string): void;
}) {
  const lanes = [...categories, { id: NONE, title: "Uncategorized", color: null }];

  const handleDrop = (sourceKey: string, target: DropTarget) => {
    if (!sourceKey.startsWith(CATEGORY_PAGE)) return;
    const pageId = sourceKey.slice(CATEGORY_PAGE.length);
    let categoryId: string | null | undefined;

    if (target.id.startsWith(CATEGORY_LANE)) {
      const value = target.id.slice(CATEGORY_LANE.length);
      categoryId = value === NONE ? null : value;
    } else if (target.id.startsWith(CATEGORY_PAGE)) {
      const targetPage = pages.find(
        (page) => page.id === target.id.slice(CATEGORY_PAGE.length),
      );
      categoryId = targetPage?.categoryId ?? null;
    }

    if (categoryId === undefined) return;
    const source = pages.find((page) => page.id === pageId);
    if ((source?.categoryId ?? null) !== categoryId) onMove(pageId, categoryId);
  };

  return (
    <DragSortProvider>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.categoryViewport}
        contentContainerStyle={styles.lanes}
      >
        {lanes.map((category) => {
          const items = pages.filter((page) => (page.categoryId ?? NONE) === category.id);
          return (
            <CategoryLane
              key={category.id}
              category={category}
              items={items}
              onAdd={onAdd}
              onMove={handleDrop}
              onRename={onRename}
              onDelete={onDelete}
            />
          );
        })}
      </ScrollView>
    </DragSortProvider>
  );
}

function CategoryLane({
  category,
  items,
  onAdd,
  onMove,
  onRename,
  onDelete,
}: {
  category: { id: string; title: string; color: string | null };
  items: PageModel[];
  onAdd(id: string | null): void;
  onMove(sourceId: string, target: DropTarget): void;
  onRename(id: string, title: string): void;
  onDelete(id: string): void;
}) {
  const { colors } = useTheme();
  const confirm = useConfirm();
  const drag = useDragSort();
  const [hovered, setHovered] = useState(false);
  const [menu, setMenu] = useState(false);
  const laneId = `${CATEGORY_LANE}${category.id}`;
  const targetHere =
    drag.draggingId !== null &&
    (drag.target?.id === laneId ||
      items.some((page) => drag.target?.id === `${CATEGORY_PAGE}${page.id}`));
  const showMenu = category.id !== NONE && (Platform.OS !== "web" || hovered || menu);

  const remove = async () => {
    setMenu(false);
    const ok = await confirm({
      title: `Delete “${category.title}”?`,
      body: "Its pages will remain here as uncategorized.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) onDelete(category.id);
  };

  return (
    <DragSortItem
      id={laneId}
      containerOnly
      disabled
      onDrop={ignoreDrop}
      style={[
        styles.lane,
        {
          zIndex: menu ? 3 : 0,
          borderTopColor: targetHere ? colors.accent : category.color ?? colors.borderStrong,
          backgroundColor: targetHere ? colors.accentSubtle : "transparent",
        },
      ]}
    >
      <View
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={styles.laneHead}
      >
        {category.id === NONE ? (
          <Text numberOfLines={1} style={[typography.label, styles.laneTitle, { color: colors.text }]}>
            {category.title}
          </Text>
        ) : (
          <EditableText
            value={category.title}
            onSave={(title) => onRename(category.id, title)}
            accessibilityLabel={`Rename ${category.title}`}
            style={[typography.label, styles.laneTitle, { color: colors.text }]}
          />
        )}
        <Text style={[typography.caption, { color: colors.muted }]}>{items.length}</Text>
        <Button
          icon="add"
          accessibilityLabel={`Add to ${category.title}`}
          onPress={() => onAdd(category.id === NONE ? null : category.id)}
        />
        <View style={styles.laneMenuSlot}>
          {showMenu ? (
            <Button
              icon="ellipsis-horizontal"
              accessibilityLabel={`More options for ${category.title}`}
              onPress={() => setMenu((value) => !value)}
            />
          ) : null}
        </View>
        {menu ? (
          <View
            style={[
              styles.laneMenu,
              { backgroundColor: colors.surfaceStrong, borderColor: colors.borderStrong },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${category.title}`}
              onPress={() => void remove()}
              style={({ pressed }) => [
                styles.menuRow,
                { backgroundColor: pressed ? colors.hover : "transparent" },
              ]}
            >
              <Icon name="trash-outline" size={16} color={colors.danger} />
              <Text style={[typography.body, { color: colors.danger }]}>Delete category</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {items.map((page) => {
        const id = `${CATEGORY_PAGE}${page.id}`;
        return (
          <DragSortItem
            key={page.id}
            id={id}
            activationDelay={activationDelay}
            onDrop={onMove}
          >
            <Row page={page} draggable dragging={drag.draggingId === id} />
          </DragSortItem>
        );
      })}
    </DragSortItem>
  );
}

function Priority({
  pages,
  onMove,
}: {
  pages: PageModel[];
  onMove(pageId: string, priority: PagePriority | null): void;
}) {
  const handleDrop = (sourceKey: string, target: DropTarget) => {
    if (!sourceKey.startsWith(PRIORITY_PAGE)) return;
    const pageId = sourceKey.slice(PRIORITY_PAGE.length);
    let priority: PagePriority | null | undefined;

    if (target.id.startsWith(PRIORITY_LANE)) {
      const value = target.id.slice(PRIORITY_LANE.length);
      priority = value === NONE ? null : (value as PagePriority);
    } else if (target.id.startsWith(PRIORITY_PAGE)) {
      const targetPage = pages.find(
        (page) => page.id === target.id.slice(PRIORITY_PAGE.length),
      );
      priority = targetPage?.priority ?? null;
    }

    if (priority === undefined) return;
    const source = pages.find((page) => page.id === pageId);
    if ((source?.priority ?? null) !== priority) onMove(pageId, priority);
  };

  const unprioritized = pages.filter((page) => page.priority === null);

  return (
    <DragSortProvider>
      <ScrollView
        nestedScrollEnabled
        style={styles.verticalViewport}
        contentContainerStyle={styles.priorityContent}
      >
        <PriorityGroup
          id={null}
          title="No priority"
          items={unprioritized}
          onMove={handleDrop}
          wide
        />
        <View style={styles.priorityGrid}>
          {priorities.map(([id, title]) => (
            <PriorityGroup
              key={id}
              id={id}
              title={title}
              items={pages.filter((page) => page.priority === id)}
              onMove={handleDrop}
            />
          ))}
        </View>
      </ScrollView>
    </DragSortProvider>
  );
}

function PriorityGroup({
  id,
  title,
  items,
  onMove,
  wide = false,
}: {
  id: PagePriority | null;
  title: string;
  items: PageModel[];
  onMove(sourceId: string, target: DropTarget): void;
  wide?: boolean;
}) {
  const { colors } = useTheme();
  const drag = useDragSort();
  const laneId = `${PRIORITY_LANE}${id ?? NONE}`;
  const targetHere =
    drag.draggingId !== null &&
    (drag.target?.id === laneId ||
      items.some((page) => drag.target?.id === `${PRIORITY_PAGE}${page.id}`));

  // Empty lanes carry no information. They return only while dragging, when
  // they become useful destinations instead of permanent placeholders.
  if (!items.length && drag.draggingId === null) return null;

  return (
    <DragSortItem
      id={laneId}
      containerOnly
      disabled
      onDrop={ignoreDrop}
      style={[
        styles.priorityGroup,
        wide ? styles.priorityWide : styles.priorityCell,
        {
          borderTopColor: targetHere ? colors.accent : colors.borderStrong,
          backgroundColor: targetHere ? colors.accentSubtle : "transparent",
        },
      ]}
    >
      <View style={styles.priorityHead}>
        <Text style={[typography.label, { color: colors.text, flex: 1 }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.muted }]}>{items.length}</Text>
      </View>
      {items.map((page) => {
        const pageId = `${PRIORITY_PAGE}${page.id}`;
        return (
          <DragSortItem
            key={page.id}
            id={pageId}
            activationDelay={activationDelay}
            onDrop={onMove}
          >
            <Row page={page} draggable dragging={drag.draggingId === pageId} />
          </DragSortItem>
        );
      })}
    </DragSortItem>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.lg,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  header: {
    minHeight: controls.comfortable,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerSpacer: { flex: 1 },
  tabs: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  tab: {
    height: controls.compact,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderRadius: radii.sm,
    justifyContent: "center",
  },
  verticalViewport: { maxHeight: 320 },
  categoryViewport: { maxHeight: 320 },
  listContent: { paddingBottom: spacing.xs },
  row: {
    minHeight: controls.default,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowIcon: { width: 19, textAlign: "center", fontSize: 15 },
  rowIconSlot: { width: 19, alignItems: "center" },
  rowTitle: { ...documentScale.body, flex: 1, minWidth: 0 },
  dragSlot: { width: 20, alignItems: "center" },
  lanes: {
    gap: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    alignItems: "flex-start",
  },
  lane: {
    width: 208,
    minHeight: 76,
    paddingBottom: spacing.xs,
    borderTopWidth: 2,
    borderRadius: radii.sm,
  },
  laneHead: {
    position: "relative",
    minHeight: controls.default,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  laneTitle: { flex: 1, minWidth: 0, paddingLeft: spacing.xs },
  laneMenuSlot: { width: controls.compact, height: controls.compact },
  laneMenu: {
    position: "absolute",
    top: controls.default - 2,
    right: 0,
    width: 166,
    padding: spacing.xxs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    zIndex: 4,
  },
  menuRow: {
    minHeight: controls.default,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  priorityContent: { gap: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  priorityGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  priorityGroup: {
    minHeight: 76,
    paddingBottom: spacing.xs,
    borderTopWidth: 1,
    borderRadius: radii.sm,
  },
  priorityCell: { flexBasis: "47%", flexGrow: 1, minWidth: 250 },
  priorityWide: { width: "100%", minHeight: controls.comfortable },
  priorityHead: {
    minHeight: controls.default,
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
