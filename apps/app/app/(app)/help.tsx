import { StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";

const sections = [
  {
    icon: "document-text-outline" as const,
    title: "Notes",
    body: "Keep pages and their related tasks together.",
  },
  {
    icon: "albums-outline" as const,
    title: "Boards",
    body: "Move the same tasks through workflow columns.",
  },
  {
    icon: "calendar-outline" as const,
    title: "Tasks",
    body: "Plan tasks by date or arrange them by priority.",
  },
  {
    icon: "map-outline" as const,
    title: "Canvas",
    body: "Arrange page references on a free-form canvas.",
  },
  {
    icon: "cloud-offline-outline" as const,
    title: "Your data",
    body: "Your workspace stays on this device. Sync connects devices; encrypted backups provide a separate restore point.",
  },
];

export default function Help() {
  const { colors } = useTheme();

  return (
    <>
      <ScreenTopbar title="Help" />
      <Page>
        <View>
          {sections.map((section) => (
            <View key={section.title} style={[styles.section, { borderBottomColor: colors.border }]}>
              <Icon name={section.icon} color={colors.accent} />
              <View style={styles.copy}>
                <Text style={[typography.title, { color: colors.text }]}>{section.title}</Text>
                <Text style={[typography.body, { color: colors.secondary }]}>{section.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  copy: { flex: 1, gap: 3 },
});
