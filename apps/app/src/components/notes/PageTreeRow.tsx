import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DropZone } from "@/components/dnd/DragSortContext";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, typography } from "@/design/tokens";
import type { Id, Page } from "@/domain/models";

const INDENT_STEP = 16;

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
  const active = page.id === activePageId;

  return (
    <View>
      <View
        style={[
          styles.edge,
          dropZone === "before" ? { backgroundColor: colors.accent } : null,
        ]}
      />
      <View
        style={[
          styles.row,
          { paddingLeft: 4 + depth * INDENT_STEP },
          active ? { backgroundColor: colors.accentSubtle } : null,
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
              color={colors.secondary}
            />
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => onOpen(page.id)}
          style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="document-text-outline" size={16} color={colors.secondary} />
          <Text
            numberOfLines={1}
            style={[typography.body, { color: colors.text, flex: 1 }]}
          >
            {page.title || "Untitled"}
          </Text>
          {page.isPinned ? <Icon name="pin" size={12} color={colors.muted} /> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${page.title} options`}
          onPress={() => onOpenMenu(page)}
          hitSlop={6}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="ellipsis-horizontal" size={16} color={colors.muted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add a page inside ${page.title}`}
          onPress={() => onAddChild(page.id)}
          hitSlop={6}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="add" size={17} color={colors.muted} />
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
    minHeight: 42,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  dragging: { opacity: 0.45 },
  edge: { height: 2, borderRadius: 1 },
  chevron: { width: 24, alignItems: "center", justifyContent: "center" },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  action: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
});
