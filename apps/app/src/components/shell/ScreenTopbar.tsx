import { pageAncestors, type Id, type PageBreadcrumb } from "@giraffle/domain";
import { router, usePathname } from "expo-router";
import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSidebar } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { controls, layout, radii, spacing, typography, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

/**
 * The trail to whatever is on screen, plus that screen's primary action. A page
 * gives `pageId` and the bar derives its own ancestors; screens that are not a
 * page pass a plain `title` and read as a single crumb. Narrow layouts have no
 * sidebar, so account and settings hang here instead.
 */
export function ScreenTopbar({
  title,
  pageId,
  crumbs,
  action,
  aside,
}: {
  title?: string;
  pageId?: Id;
  crumbs?: readonly PageBreadcrumb[];
  action?: ReactNode;
  aside?: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { snapshot } = useApp();
  const sidebar = useSidebar();
  const path = usePathname();
  const narrow = width < WIDE_LAYOUT_MIN_WIDTH;

  const trail = useMemo<readonly PageBreadcrumb[]>(() => {
    if (crumbs) return crumbs;
    if (!pageId) return [];
    const page = snapshot.pages.find((candidate) => candidate.id === pageId);
    if (!page) return [];
    return [
      ...pageAncestors(snapshot.pages, pageId),
      { id: page.id, title: page.title, icon: page.icon },
    ];
  }, [crumbs, pageId, snapshot.pages]);

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top, backgroundColor: colors.background },
      ]}
    >
      {sidebar?.collapsed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Expand sidebar"
          onPress={sidebar.toggle}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pressed ? colors.hover : "transparent" },
          ]}
        >
          <Icon name="menu-outline" size={16} color={colors.faint} />
        </Pressable>
      ) : null}

      <View style={styles.trail}>
        {trail.length === 0 ? (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[typography.body, { color: colors.text }]}
          >
            {title}
          </Text>
        ) : (
          trail.map((crumb, index) => (
            <View key={crumb.id} style={styles.crumb}>
              {index === 0 ? null : (
                <Text style={[typography.body, { color: colors.faint }]}>/</Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={crumb.title || "Untitled"}
                onPress={() => router.push(`/pages/${crumb.id}`)}
                style={({ pressed }) => [
                  styles.crumbButton,
                  { backgroundColor: pressed ? colors.hover : "transparent" },
                ]}
              >
                {crumb.icon ? <Text style={styles.crumbIcon}>{crumb.icon}</Text> : null}
                <Text
                  numberOfLines={1}
                  style={[
                    typography.body,
                    { color: index === trail.length - 1 ? colors.text : colors.muted },
                  ]}
                >
                  {crumb.title || "Untitled"}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {aside}
      {action}
      {narrow && !path.startsWith("/account") ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings and account"
          onPress={() => router.push("/account")}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Icon name="settings-outline" size={21} color={colors.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: layout.topbarHeight,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  trail: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  crumb: { minWidth: 0, flexShrink: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  crumbButton: {
    minWidth: 0,
    flexShrink: 1,
    height: layout.rowHeight,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  crumbIcon: { fontSize: typography.body.fontSize },
  button: {
    width: controls.compact,
    height: controls.compact,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
