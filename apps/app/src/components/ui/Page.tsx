import type { PropsWithChildren } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewProps,
} from "react-native";
import { useTheme } from "@/design/ThemeProvider";
import { spacing } from "@/design/tokens";

export function Page({
  children,
  scroll = true,
  ...props
}: PropsWithChildren<{ scroll?: boolean } & ScrollViewProps>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const pageStyle = [
    styles.page,
    {
      backgroundColor: colors.background,
      paddingHorizontal: width >= 1100 ? spacing.xxxl : width >= 768 ? spacing.xxl : spacing.lg,
    },
  ];

  if (!scroll) {
    return <View style={[pageStyle, styles.fixed]}>{children}</View>;
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
    maxWidth: 1180,
    alignSelf: "center",
    paddingTop: spacing.xxl,
    paddingBottom: 96,
    gap: spacing.xl,
  },
  fixed: { flex: 1 },
});
