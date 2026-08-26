import { StyleSheet, useWindowDimensions } from "react-native";
import { CalendarScreen } from "@/calendar/CalendarScreen";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { spacing, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";

export default function CalendarRoute() {
  const { width } = useWindowDimensions();
  const desktop = width >= WIDE_LAYOUT_MIN_WIDTH;

  return (
    <>
      <ScreenTopbar title="Calendar" />
      <Page wide scroll={false} style={[styles.page, desktop ? styles.desktopPage : null]}>
        <CalendarScreen />
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  desktopPage: {
    maxWidth: "100%",
    paddingHorizontal: spacing.xl,
  },
});
