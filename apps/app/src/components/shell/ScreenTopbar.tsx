import { router, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { controls, typography } from "@/design/tokens";

/**
 * One bar per screen: title, that screen's primary action, and search. Keeping
 * them on a single row leaves the vertical space for content.
 */
export function ScreenTopbar({
  title,
  action,
  aside,
}: {
  title: string;
  action?: ReactNode;
  aside?: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const onSearch = path.startsWith("/search");

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + 6,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={[typography.title, { color: colors.text, flex: 1 }]}
      >
        {title}
      </Text>
      {aside}
      {action}
      {onSearch ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => router.push("/search")}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Icon name="search-outline" size={21} color={colors.secondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: controls.default,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  button: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
