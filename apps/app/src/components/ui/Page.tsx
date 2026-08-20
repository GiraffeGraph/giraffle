import type { PropsWithChildren } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewProps,
} from "react-native";
import { useTheme } from "@/design/ThemeProvider";
import { layout, spacing, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";

export function Page({
  children,
  scroll = true,
  ...props
}: PropsWithChildren<{ scroll?: boolean } & ScrollViewProps>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // The sidebar is part of the window but not of the page, so the roomy gutter
  // is only affordable out of what is actually left over for the column. Below
  // that the margin gives way first — the column keeps its measure.
  const available = width - (width >= WIDE_LAYOUT_MIN_WIDTH ? layout.sidebarWidth : 0);
  const gutter =
    available >= layout.contentWidth + layout.contentGutter * 2
      ? layout.contentGutter
      : layout.contentGutterNarrow;
  const pageStyle = [
    styles.page,
    {
      backgroundColor: colors.background,
      maxWidth: layout.contentWidth + gutter * 2,
      paddingHorizontal: gutter,
    },
  ];

  if (!scroll) {
    return <View style={[pageStyle, styles.fixed, props.style]}>{children}</View>;
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      {...props}
      style={[{ backgroundColor: colors.background }, props.style]}
      contentContainerStyle={[pageStyle, props.contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    width: "100%",
    alignSelf: "center",
    paddingTop: spacing.xxl,
    paddingBottom: 96,
    gap: spacing.xl,
  },
  fixed: { flex: 1 },
});
