import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

export default function Archive() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const pages = snapshot.pages.filter((page) => page.isArchived);

  const confirmDelete = (pageId: string, title: string) => {
    Alert.alert(
      "Delete page permanently?",
      `“${title}” and its tasks will no longer be available. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void run((repository) => repository.deletePage(pageId)),
        },
      ],
    );
  };

  return (
    <>
      <ScreenTopbar title="Archive" />
      <Page>
      {pages.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title="Archive is empty"
          body="Pages moved here can be restored later."
        />
      ) : (
        <View style={[styles.list, { borderTopColor: colors.border }]}>
          {pages.map((page) => (
            <DividerRow key={page.id}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${page.title}`}
                onPress={() => router.push(`/notes/${page.id}`)}
                style={({ pressed }) => [styles.pageLink, { opacity: pressed ? 0.55 : 1 }]}
              >
                <Icon name="document-outline" />
                <Text
                  numberOfLines={1}
                  style={[typography.body, { color: colors.text, flex: 1 }]}
                >
                  {page.title}
                </Text>
                <Icon name="chevron-forward" size={16} color={colors.faint} />
              </Pressable>
              <Button
                label="Restore"
                onPress={() => void run((repository) => repository.restorePage(page.id))}
              />
              <Button
                icon="trash-outline"
                tone="danger"
                accessibilityLabel="Delete permanently"
                onPress={() => confirmDelete(page.id, page.title)}
              />
            </DividerRow>
          ))}
        </View>
      )}
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: StyleSheet.hairlineWidth },
  pageLink: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
