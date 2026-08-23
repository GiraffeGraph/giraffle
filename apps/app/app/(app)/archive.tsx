import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useApp } from "@/state/AppProvider";

/**
 * The page's own emoji is the thing a person recognises the row by; the faint
 * document icon only stands in when the page never got one.
 */
function ArchivedRow({
  title,
  icon,
  onOpen,
  onRestore,
  onDelete,
}: {
  title: string;
  icon: string | null;
  onOpen: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <DividerRow style={{ backgroundColor: hovered ? colors.hover : "transparent" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={onOpen}
        style={({ pressed }) => [styles.pageLink, { opacity: pressed ? 0.55 : 1 }]}
      >
        {icon ? (
          <Text style={styles.pageIcon}>{icon}</Text>
        ) : (
          <Icon name="document-outline" size={16} color={colors.faint} />
        )}
        <Text numberOfLines={1} style={[typography.body, { color: colors.text, flex: 1 }]}>
          {title}
        </Text>
      </Pressable>
      <Button label="Restore" accessibilityLabel={`Restore ${title}`} onPress={onRestore} />
      <Button
        icon="trash-outline"
        tone="danger"
        accessibilityLabel={`Delete ${title} permanently`}
        onPress={onDelete}
      />
    </DividerRow>
  );
}

export default function Archive() {
  const { snapshot, run } = useApp();
  const confirm = useConfirm();
  const pages = snapshot.pages.filter((page) => page.isArchived);

  const confirmDelete = (pageId: string, title: string) => {
    void confirm({
      title: "Delete page permanently?",
      body: `“${title}” and every page inside it will no longer be available. This cannot be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    }).then((ok) => {
      if (ok) void run((repository) => repository.deletePage(pageId)).catch(() => undefined);
    });
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
        <View>
          {pages.map((page) => {
            const title = page.title || "Untitled";
            return (
              <ArchivedRow
                key={page.id}
                title={title}
                icon={page.icon}
                onOpen={() => router.push(`/pages/${page.id}`)}
                onRestore={() => void run((repository) => repository.restorePage(page.id))}
                onDelete={() => confirmDelete(page.id, title)}
              />
            );
          })}
        </View>
      )}
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  pageLink: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pageIcon: { fontSize: typography.body.fontSize },
});
