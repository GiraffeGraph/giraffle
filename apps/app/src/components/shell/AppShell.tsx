import { router, Slot, usePathname } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

interface NavigationItem {
  href: string;
  label: string;
  icon: IconName;
}

const mainNavigation: readonly NavigationItem[] = [
  { href: "/pages", label: "Pages", icon: "document-text-outline" },
  { href: "/plan", label: "Plan", icon: "compass-outline" },
  { href: "/canvas", label: "Canvas", icon: "map-outline" },
  { href: "/account", label: "Account", icon: "person-circle-outline" },
];

function isActive(path: string, item: NavigationItem) {
  return path.startsWith(item.href);
}

/**
 * One navigation control for both layouts. A pointer gets a hover tint that a
 * touch screen has no way to show, and the keyboard focus ring is left to the
 * platform rather than suppressed.
 */
function NavigationButton({
  item,
  active,
  orientation,
}: {
  item: NavigationItem;
  active: boolean;
  orientation: "row" | "column";
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const iconTint = active ? colors.accent : colors.muted;
  const labelTint = active ? colors.text : colors.secondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      // Navigating rather than pushing: switching tabs reuses the route already
      // in the stack instead of stacking a fresh copy on every tap.
      onPress={() => router.navigate(item.href as never)}
      style={({ pressed }) => [
        orientation === "row" ? styles.bottomButton : styles.sidebarButton,
        {
          opacity: pressed ? 0.6 : 1,
          backgroundColor: active
            ? orientation === "column" ? colors.hover : colors.accentSubtle
            : hovered
              ? colors.hover
              : "transparent",
          borderLeftColor: orientation === "column" && active ? colors.accent : "transparent",
        },
      ]}
    >
      <Icon name={item.icon} size={20} color={iconTint} />
      <Text
        numberOfLines={1}
        style={[
          orientation === "row" ? typography.caption : styles.sidebarLabel,
          { color: labelTint, fontWeight: active ? "600" : "500" },
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export function AppShell() {
  const { colors } = useTheme();
  const { actionError, clearActionError } = useApp();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {wide ? (
        <View
          accessibilityRole="menubar"
          style={[
            styles.sidebar,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: Math.max(insets.bottom, spacing.md),
              borderRightColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.brand}>
            <Image source={require("../../../assets/brand-mark.png")} style={styles.brandIcon} />
            <View style={styles.brandCopy}>
              <Text style={[typography.title, { color: colors.text }]}>Giraffle</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>Private workspace</Text>
            </View>
          </View>
          {mainNavigation.map((item) => (
            <NavigationButton
              key={item.href}
              item={item}
              active={isActive(path, item)}
              orientation="column"
            />
          ))}
        </View>
      ) : null}

      <View style={styles.content}>
        {actionError ? (
          <View
            accessibilityLiveRegion="assertive"
            style={[
              styles.errorBanner,
              {
                paddingTop: wide ? 6 : insets.top + 6,
                backgroundColor: colors.surfaceStrong,
                borderBottomColor: colors.danger,
              },
            ]}
          >
            <Icon name="alert-circle-outline" color={colors.danger} />
            <Text numberOfLines={2} style={[typography.body, { color: colors.text, flex: 1 }]}>
              Could not save this change: {actionError}
            </Text>
            <Button icon="close" accessibilityLabel="Dismiss error" onPress={clearActionError} />
          </View>
        ) : null}

        <View style={styles.slot}>
          <Slot />
        </View>

        {wide ? null : (
          <View
            style={[
              styles.bottomBar,
              {
                paddingBottom: Math.max(insets.bottom, 6),
                borderTopColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            {mainNavigation.map((item) => (
              <NavigationButton
                key={item.href}
                item={item}
                active={isActive(path, item)}
                orientation="row"
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  content: { flex: 1, minWidth: 0 },
  slot: { flex: 1 },
  sidebar: {
    width: 216,
    paddingHorizontal: spacing.sm,
    gap: spacing.xxs,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brandIcon: { width: 32, height: 32, borderRadius: radii.sm },
  brandCopy: { flex: 1, gap: 1 },
  sidebarButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 2,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sidebarLabel: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  errorBanner: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  /**
   * A flex sibling of the content, not an overlay: the bar's height and the
   * device's home indicator come out of the layout once, so no screen has to
   * guess how much room to leave at its bottom edge.
   */
  bottomBar: {
    minHeight: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  bottomButton: {
    flex: 1,
    minWidth: 0,
    paddingTop: 7,
    alignItems: "center",
    gap: 2,
  },
});
