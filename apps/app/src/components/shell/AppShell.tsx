import { router, Slot, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

interface NavigationItem {
  href: string;
  label: string;
  icon: IconName;
  activePaths?: readonly string[];
}

const mainNavigation: readonly NavigationItem[] = [
  { href: "/notes", label: "Notes", icon: "document-text-outline" },
  {
    href: "/stride",
    label: "Tasks",
    icon: "checkmark-circle-outline",
    activePaths: ["/stride", "/tower"],
  },
  { href: "/trek", label: "Trek", icon: "albums-outline" },
  { href: "/savanna", label: "Savanna", icon: "map-outline" },
  { href: "/account", label: "Account", icon: "person-circle-outline" },
];

function isActive(path: string, item: NavigationItem) {
  return (item.activePaths ?? [item.href]).some((prefix) =>
    path.startsWith(prefix),
  );
}

export function AppShell() {
  const { colors } = useTheme();
  const { actionError, clearActionError } = useApp();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {actionError ? (
          <View
            accessibilityLiveRegion="assertive"
            style={[
              styles.errorBanner,
              {
                paddingTop: insets.top + 6,
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
          {mainNavigation.map((item) => {
            const active = isActive(path, item);
            return (
              <Pressable
                key={item.href}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
                onPress={() => router.push(item.href as never)}
                style={({ pressed }) => [
                  styles.bottomButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  color={active ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: active ? colors.accent : colors.muted },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  content: { flex: 1 },
  slot: { flex: 1 },
  errorBanner: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
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
