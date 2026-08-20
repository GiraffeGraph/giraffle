import { type Id, type Page as PageModel } from "@giraffle/domain";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { PageTree } from "@/components/pages/PageTree";
import { PageRowMenu } from "@/components/shell/AppShell";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, EmptyState } from "@/components/ui/primitives";
import { useApp } from "@/state/AppProvider";

/**
 * The tree a wide window keeps in its sidebar. A phone has no sidebar, so the
 * same tree — the same rows, the same drag, the same menu — becomes a screen.
 */
export default function Pages() {
  const { snapshot, run } = useApp();
  const [menuPage, setMenuPage] = useState<PageModel | null>(null);

  const active = snapshot.pages.filter((page) => !page.isArchived);
  const open = (pageId: Id) => router.push(`/pages/${pageId}`);

  const create = (parentId?: Id) => {
    void run((repository) => repository.createPage(parentId ? { parentId } : {}))
      .then((id) => open(id))
      .catch(() => undefined);
  };

  return (
    <>
      <ScreenTopbar
        title="Pages"
        action={<Button icon="add" accessibilityLabel="New page" onPress={() => create()} />}
      />
      <Page>
        {active.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="Start with a page"
            body="Every page can hold more pages."
            action={<Button label="New page" tone="accent" onPress={() => create()} />}
          />
        ) : (
          <View style={styles.tree}>
            <PageTree
              pages={active}
              onOpen={open}
              onAddChild={create}
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

const styles = StyleSheet.create({
  tree: { paddingTop: 6 },
});
