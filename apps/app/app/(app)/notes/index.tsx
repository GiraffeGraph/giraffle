import { pageAncestors, type Id, type Page as PageModel } from "@giraffle/domain";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageTree } from "@/components/notes/PageTree";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const RECENT_LIMIT = 8;

function when(value: number): string {
  const difference = Math.max(0, Date.now() - value);
  const days = Math.floor(difference / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

export default function Notes() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const [menuPage, setMenuPage] = useState<PageModel | null>(null);

  const active = snapshot.pages.filter((page) => !page.isArchived);
  const boardPageIds = new Set(snapshot.boards.map((board) => board.pageId));
  const recents = [...active]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, RECENT_LIMIT);

  const open = (pageId: Id) => {
    const board = snapshot.boards.find((item) => item.pageId === pageId);
    router.push(board ? `/trek/${board.id}` : `/notes/${pageId}`);
  };

  const create = (parentId?: Id) => {
    void run((repository) => repository.createPage(parentId ? { parentId } : {}))
      .then((id) => open(id))
      .catch(() => undefined);
  };

  return (
    <>
      <ScreenTopbar
        title="Notes"
        action={<Button icon="add" label="Page" tone="accent" onPress={() => create()} />}
      />
      <Page>
      {active.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="Start with a page"
          body="Write a note, plan a task, or capture an idea. Pages can live inside other pages."
          action={<Button label="Create page" tone="accent" onPress={() => create()} />}
        />
      ) : (
        <View style={styles.tree}>
          <Text style={[typography.label, { color: colors.muted }]}>Recents</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentRow}
          >
            {recents.map((page) => (
              <Pressable
                key={page.id}
                accessibilityRole="button"
                onPress={() => open(page.id)}
                style={({ pressed }) => [
                  styles.recentCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Icon
                  name={boardPageIds.has(page.id) ? "albums-outline" : "document-text-outline"}
                  size={18}
                  color={colors.secondary}
                />
                <Text numberOfLines={2} style={[typography.body, { color: colors.text }]}>
                  {page.title || "Untitled"}
                </Text>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {when(page.updatedAt)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.sectionHead}>
            <Text style={[typography.label, { color: colors.muted }]}>Pages</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a top-level page"
              onPress={() => create()}
              hitSlop={8}
              style={({ pressed }) => [styles.sectionAction, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Icon name="add" size={18} color={colors.muted} />
            </Pressable>
          </View>

          <PageTree
            pages={active}
            boardPageIds={boardPageIds}
            onOpen={open}
            onAddChild={(parentId) => create(parentId)}
            onOpenMenu={setMenuPage}
            onMove={(move) =>
              void run((repository) =>
                repository.movePage(move.pageId, move.parentId, move.afterPageId),
              ).catch(() => undefined)
            }
          />
        </View>
      )}

        <PageRowMenu page={menuPage} close={() => setMenuPage(null)} />
      </Page>
    </>
  );
}

function PageRowMenu({ page, close }: { page: PageModel | null; close: () => void }) {
  const { colors } = useTheme();
  const { run, snapshot } = useApp();
  const board = snapshot.boards.find((item) => item.pageId === page?.id);
  const containsBoard = page
    ? snapshot.boards.some(
        (item) =>
          item.pageId === page.id ||
          pageAncestors(snapshot.pages, item.pageId).some((ancestor) => ancestor.id === page.id),
      )
    : false;

  if (!page) {
    return null;
  }

  const action = (work: () => Promise<unknown>) => {
    close();
    void work().catch(() => undefined);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={close} />
      <SafeAreaView
        edges={["bottom"]}
        style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
      >
        <Text
          numberOfLines={1}
          style={[typography.label, { color: colors.muted, padding: spacing.md }]}
        >
          {page.title || "Untitled"}
        </Text>
        <DividerRow
          onPress={() =>
            action(() =>
              run((repository) => repository.updatePage(page.id, { isPinned: !page.isPinned })),
            )
          }
        >
          <Icon name="pin-outline" />
          <Text style={[typography.body, { color: colors.text }]}>
            {page.isPinned ? "Unpin" : "Pin"} page
          </Text>
        </DividerRow>
        {page.parentId ? (
          <DividerRow
            onPress={() => action(() => run((repository) => repository.movePage(page.id, null)))}
          >
            <Icon name="return-up-back-outline" />
            <Text style={[typography.body, { color: colors.text }]}>Move to top level</Text>
          </DividerRow>
        ) : null}
        {containsBoard ? null : (
          <DividerRow
            onPress={() => action(() => run((repository) => repository.archivePage(page.id)))}
          >
            <Icon name="archive-outline" />
            <Text style={[typography.body, { color: colors.text }]}>Move to archive</Text>
          </DividerRow>
        )}
        <DividerRow
          onPress={() => {
            close();
            Alert.alert(
              board ? "Delete board permanently?" : "Delete page permanently?",
              board
                ? "This board and all its tasks will be removed. This cannot be undone."
                : "This page and every page inside it will be removed. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () =>
                    void run((repository) =>
                      board ? repository.deleteBoard(board.id) : repository.deletePage(page.id),
                    ).catch(() => undefined),
                },
              ],
            );
          }}
        >
          <Icon name="trash-outline" color={colors.danger} />
          <Text style={[typography.body, { color: colors.danger }]}>Delete permanently</Text>
        </DividerRow>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tree: { gap: 6 },
  recentRow: { gap: 10, paddingVertical: 8, paddingRight: 8 },
  recentCard: {
    width: 148,
    minHeight: 104,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    justifyContent: "space-between",
    gap: 6,
  },
  sectionHead: {
    marginTop: 10,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionAction: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  scrim: { flex: 1 },
  sheet: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
});
