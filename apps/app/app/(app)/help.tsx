import { StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";

const topics: readonly (readonly [string, string])[] = [
  ["Pages", "Everything is a page. Pages can contain direct child pages and move to one real parent."],
  [
    "States and categories",
    "Custom states describe meaning; each page owns optional categories for its direct children.",
  ],
  ["Plan", "Table and board are two planning views over the same pages."],
  [
    "Calendar",
    "Day, week, and continuous month views show every scheduled page. Scroll or swipe through dates, drag to reschedule, resize duration, and choose event colors. On Mac, connect your primary Google Calendar from Settings for optional two-way sync.",
  ],
  ["Canvas", "Arrange canonical page references without making copies."],
];

export default function Help() {
  const { colors } = useTheme();

  return (
    <>
      <ScreenTopbar title="Help" />
      <Page>
        {topics.map(([title, body]) => (
          <View key={title}>
            <Text style={[typography.label, styles.sectionLabel, { color: colors.faint }]}>
              {title}
            </Text>
            <Text style={[typography.body, { color: colors.secondary }]}>{body}</Text>
          </View>
        ))}
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
});
