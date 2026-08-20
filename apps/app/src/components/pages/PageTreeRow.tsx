import type { Id, Page } from "@giraffle/domain";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DropZone } from "@/components/dnd/DragSortContext";
import { Icon } from "@/components/ui/primitives";
import { layout, radii, spacing, typography } from "@/design/tokens";
import { useTheme } from "@/design/ThemeProvider";

const INDENT_STEP = spacing.lg;

export function PageTreeRow({
  page,
  depth,
  hasChildren,
  expanded,
  dragging,
  dropZone,
  activePageId,
  onToggle,
  onOpen,
  onAddChild,
  onOpenMenu,
}: {
  page: Page;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  dragging: boolean;
  dropZone: DropZone | null;
  activePageId?: Id | undefined;
  onToggle(): void;
  onOpen(pageId: Id): void;
  onAddChild(parentId: Id): void;
  onOpenMenu(page: Page): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const active = page.id === activePageId;

  return (
    <View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <View
        style={[
          styles.edge,
          dropZone === "before" ? { backgroundColor: colors.accent } : null,
        ]}
      />
      <View
        style={[
          styles.row,
          { paddingLeft: spacing.xs + depth * INDENT_STEP },
          active
            ? { backgroundColor: colors.selected }
            : hovered
              ? { backgroundColor: colors.hover }
              : null,
          dropZone === "inside"
            ? { backgroundColor: colors.hover, borderColor: colors.accent }
            : null,
          dragging ? styles.dragging : null,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            hasChildren
              ? expanded
                ? `Collapse ${page.title}`
                : `Expand ${page.title}`
              : `${page.title} has no sub-pages`
          }
          accessibilityState={{ expanded, disabled: !hasChildren }}
          disabled={!hasChildren}
          onPress={onToggle}
          hitSlop={6}
          style={styles.chevron}
        >
          {hasChildren ? (
            <Icon
              name={expanded ? "chevron-down" : "chevron-forward"}
              size={15}
              color={colors.faint}
            />
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={page.title || "Untitled"}
          accessibilityState={{ selected: active }}
          onPress={() => onOpen(page.id)}
          style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
        >
          {page.icon ? (
            <Text style={styles.glyph}>{page.icon}</Text>
          ) : (
            <Icon name="document-text-outline" size={16} color={colors.faint} />
          )}
          <Text
            numberOfLines={1}
            style={[typography.body, { color: active ? colors.text : colors.secondary, flex: 1 }]}
          >
            {page.title || "Untitled"}
          </Text>
          {page.isPinned ? <Icon name="pin" size={12} color={colors.faint} /> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${page.title} options`}
          onPress={() => onOpenMenu(page)}
          hitSlop={6}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="ellipsis-horizontal" size={16} color={colors.faint} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add a page inside ${page.title}`}
          onPress={() => onAddChild(page.id)}
          hitSlop={6}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="add" size={17} color={colors.faint} />
        </Pressable>
      </View>
      <View
        style={[
          styles.edge,
          dropZone === "after" ? { backgroundColor: colors.accent } : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: layout.rowHeight,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  dragging: { opacity: 0.45 },
  edge: { height: 2, borderRadius: 1 },
  chevron: { width: spacing.xl, alignItems: "center", justifyContent: "center" },
  glyph: { width: 16, textAlign: "center", fontSize: typography.caption.fontSize },
  main: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  action: {
    width: layout.rowHeight,
    height: layout.rowHeight,
    alignItems: "center",
    justifyContent: "center",
  },
});
