import {
  blocksToMarkdown,
  pageAncestors,
  pageLabel,
  selectableParentPages,
  type Page as PageModel,
  type TiptapDocument,
} from "@giraffle/domain";
import { router, useLocalSearchParams } from "expo-router";
import { File } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ChildPageViews } from "@/components/pages/ChildPageViews";
import { PageMetaBar } from "@/components/pages/PageMetaBar";
import { PagePlanningSheet } from "@/components/pages/PagePlanningSheet";
import { EditableText } from "@/components/ui/EditableText";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";
import Editor, { type EditorAttachment } from "@/dom/Editor";
import { offlineDomProps } from "@/dom/offline";
import { useApp } from "@/state/AppProvider";

type SaveState = "saved" | "saving" | "error";

/** Enough of a spread to name most pages without shipping a picker library. */
const ICON_CHOICES = ["📄", "📝", "✅", "📌", "💡", "🎯", "📚", "🗓️", "🌱", "🔥", "⭐", "🧭"];

/** Attachments live inside the encrypted document, so they stay small. */
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

async function pickAttachment(accept: string[]): Promise<EditorAttachment | null> {
  const picked = await File.pickFileAsync({ mimeTypes: accept });
  if (picked.canceled) return null;
  const file = picked.result;
  if (file.size !== null && file.size > MAX_ATTACHMENT_BYTES) {
    Alert.alert("Image too large", "Pick an image under 2 MB so the page stays quick to sync.");
    return null;
  }
  const base64 = await file.base64();
  return {
    src: `data:${file.type || "image/png"};base64,${base64}`,
    alt: file.name,
  };
}

export default function PageEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { snapshot, run } = useApp();
  const page = snapshot.pages.find((item) => item.id === id);
  const [iconHovered, setIconHovered] = useState(false);
  const [menu, setMenu] = useState(false);
  const [moveSheet, setMoveSheet] = useState(false);
  const [planningSheet, setPlanningSheet] = useState(false);
  const [draft, setDraft] = useState<TiptapDocument | null>(page?.document ?? null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<TiptapDocument | null>(draft);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const persistingRevisionRef = useRef<number | null>(null);

  // Headless and sync writes update the canonical snapshot while this route can
  // stay mounted. Adopt them unless the local editor has an unsaved draft.
  useEffect(() => {
    if (!page || dirtyRef.current) return;
    setDraft(page.document);
    draftRef.current = page.document;
  }, [page]);

  const persist = useCallback(
    async (document: TiptapDocument, revision: number) => {
      if (persistingRevisionRef.current === revision) return;
      persistingRevisionRef.current = revision;
      setSaveState("saving");
      try {
        await run((repository) => repository.saveDocument(id, document));
        if (revisionRef.current === revision) {
          dirtyRef.current = false;
          setSaveState("saved");
        }
      } catch {
        setSaveState("error");
      } finally {
        if (persistingRevisionRef.current === revision) {
          persistingRevisionRef.current = null;
        }
      }
    },
    [id, run],
  );

  const queueSave = useCallback(
    (document: TiptapDocument) => {
      setDraft(document);
      draftRef.current = document;
      dirtyRef.current = true;
      revisionRef.current += 1;
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      const revision = revisionRef.current;
      timer.current = setTimeout(() => {
        timer.current = null;
        void persist(document, revision);
      }, 450);
    },
    [persist],
  );

  /** Writes the pending draft now instead of waiting out the debounce. */
  const flush = useCallback(() => {
    if (!dirtyRef.current || !draftRef.current) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void persist(draftRef.current, revisionRef.current);
  }, [persist]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") flush();
    });
    return () => subscription.remove();
  }, [flush]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const pending = draftRef.current;
      if (
        dirtyRef.current &&
        pending &&
        persistingRevisionRef.current !== revisionRef.current
      ) {
        void run((repository) => repository.saveDocument(id, pending)).catch(
          () => undefined,
        );
      }
    },
    [id, run],
  );

  if (!page || !draft) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: 80 }]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Page unavailable"
          body="It may have been deleted on this device."
          action={<Button label="Back to pages" onPress={() => router.replace("/pages")} />}
        />
      </View>
    );
  }

  const leave = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (dirtyRef.current && draftRef.current) {
      await persist(draftRef.current, revisionRef.current);
    }
    router.back();
  };
  const ancestors = pageAncestors(snapshot.pages, page.id);
  const backlinks = snapshot.backlinks.filter((link) => link.targetPageId === page.id);


  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.breadcrumb, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
        <Button
          icon="chevron-back"
          accessibilityLabel="Back"
          onPress={() => void leave()}
        />
        <Text
          numberOfLines={1}
          style={[typography.caption, { color: colors.muted, flex: 1 }]}
        >
          <Text onPress={() => router.replace("/pages")}>Pages</Text>
          {ancestors.map((item) => (
            <Text key={item.id} onPress={() => router.replace(`/pages/${item.id}`)}>
              {` / ${item.title}`}
            </Text>
          ))}
        </Text>
        {saveState === "error" ? (
          <Button
            label="Retry save"
            icon="refresh-outline"
            tone="danger"
            onPress={() => {
              if (draftRef.current) {
                void persist(draftRef.current, revisionRef.current);
              }
            }}
          />
        ) : saveState === "saving" ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.caption, { color: colors.muted }]}
          >
            Saving…
          </Text>
        ) : null}
        <Button
          icon="options-outline"
          accessibilityLabel="Page planning"
          onPress={() => setPlanningSheet(true)}
        />
        <Button
          icon="ellipsis-horizontal"
          accessibilityLabel="Page actions"
          onPress={() => setMenu(true)}
        />
      </View>
      <Page scroll={false} style={styles.document}>
        <View
          onPointerEnter={() => setIconHovered(true)}
          onPointerLeave={() => setIconHovered(false)}
          style={styles.titleBlock}
        >
          <PageIcon
            icon={page.icon}
            // A pointer can reveal the affordance on demand; a finger cannot, so
            // a narrow screen keeps it in view.
            revealed={iconHovered || Platform.OS !== "web" || width < WIDE_LAYOUT_MIN_WIDTH}
            onChange={(icon) => void run((repository) => repository.updatePage(page.id, { icon }))}
          />
          <EditableText
            value={page.title}
            accessibilityLabel="Page title"
            onSave={(title) => void run((repository) => repository.updatePage(page.id, { title }))}
            style={[typography.pageTitle, { color: colors.text }]}
          />
        </View>
        <PageMetaBar page={page} onOpenPlanning={() => setPlanningSheet(true)} />
        <Editor
          document={draft}
          theme={{
            text: colors.text,
            muted: colors.faint,
            link: colors.link,
            background: colors.background,
          }}
          onChange={queueSave}
          onError={() => setSaveState("error")}
          onFocusChange={(focused) => {
            if (!focused) flush();
          }}
          onRequestAttachment={pickAttachment}
          onOpenLink={(target) => {
            const next = snapshot.pages.find(
              (item) => item.title.toLocaleLowerCase() === target.toLocaleLowerCase(),
            );
            if (next) {
              router.push(`/pages/${next.id}`);
              return;
            }
            // The editor can never navigate itself, so a web link leaves for
            // the system browser or goes nowhere.
            if (/^https?:\/\//i.test(target)) void Linking.openURL(target).catch(() => undefined);
          }}
          dom={offlineDomProps({ backgroundColor: colors.background, scrollEnabled: true })}
        />
        <ChildPageViews parent={page} />
        {backlinks.length ? (
          <View style={[styles.backlinks, { borderTopColor: colors.border }]}>
            <Text style={[typography.label, { color: colors.muted }]}>
              Backlinks · {backlinks.length}
            </Text>
            {backlinks.map((link) => (
              <Pressable
                key={`${link.sourcePageId}-${link.targetRaw}`}
                onPress={() => router.push(`/pages/${link.sourcePageId}`)}
              >
                <Text style={[typography.body, { color: colors.link }]}>
                  {link.sourceTitle}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Page>
      {planningSheet ? (
        <PagePlanningSheet page={page} visible onClose={() => setPlanningSheet(false)} />
      ) : null}
      <PageMenu
        visible={menu}
        close={() => setMenu(false)}
        pageId={page.id}
        pinned={page.isPinned}
        archived={page.isArchived}
        markdown={blocksToMarkdown(draft)}
        onMove={() => {
          setMenu(false);
          setMoveSheet(true);
        }}
      />
      <MoveSheet
        visible={moveSheet}
        close={() => setMoveSheet(false)}
        page={page}
        pages={snapshot.pages.filter((item) => !item.isArchived)}
      />
    </View>
  );
}

/**
 * The emoji a page wears. Inline choices plus a free-text box cover both the
 * common case and the one nobody anticipated, without a picker dependency.
 */
function PageIcon({
  icon,
  revealed,
  onChange,
}: {
  icon: string | null;
  revealed: boolean;
  onChange: (icon: string | null) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const pick = (next: string | null) => {
    setOpen(false);
    setCustom("");
    onChange(next);
  };

  // The slot keeps its height even while empty, so revealing "Add icon" on
  // hover never nudges the title out from under the pointer.
  if (!icon && !revealed && !open) return <View style={styles.iconSlot} />;

  return (
    <View style={styles.iconSlot}>
      {icon ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Page icon ${icon} — change or remove it`}
          onPress={() => setOpen((value) => !value)}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: pressed ? colors.hover : "transparent" },
          ]}
        >
          <Text style={styles.icon}>{icon}</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a page icon"
          onPress={() => setOpen((value) => !value)}
          style={({ pressed }) => [
            styles.addIcon,
            { backgroundColor: pressed ? colors.hover : "transparent" },
          ]}
        >
          <Icon name="happy-outline" size={15} color={colors.faint} />
          <Text style={[typography.caption, { color: colors.muted }]}>Add icon</Text>
        </Pressable>
      )}
      {open ? (
        <View
          style={[
            styles.picker,
            { backgroundColor: colors.surfaceStrong, borderColor: colors.border },
          ]}
        >
          {ICON_CHOICES.map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`Use ${choice} as the page icon`}
              onPress={() => pick(choice)}
              style={({ pressed }) => [
                styles.choice,
                { backgroundColor: pressed ? colors.hover : "transparent" },
              ]}
            >
              <Text style={styles.choiceIcon}>{choice}</Text>
            </Pressable>
          ))}
          <TextInput
            accessibilityLabel="Use another emoji as the page icon"
            value={custom}
            onChangeText={setCustom}
            onSubmitEditing={() => {
              const next = custom.trim();
              if (next) pick(next);
            }}
            returnKeyType="done"
            placeholder="Any emoji"
            placeholderTextColor={colors.faint}
            style={[typography.body, styles.customIcon, { color: colors.text, borderColor: colors.border }]}
          />
          {icon ? <Button label="Remove" accessibilityLabel="Remove the page icon" onPress={() => pick(null)} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function PageMenu({
  visible,
  close,
  pageId,
  pinned,
  archived,
  markdown,
  onMove,
}: {
  visible: boolean;
  close: () => void;
  pageId: string;
  pinned: boolean;
  archived: boolean;
  markdown: string;
  onMove: () => void;
}) {
  const { colors } = useTheme();
  const { run } = useApp();
  const action = (work: () => Promise<unknown>) => {
    close();
    void work().catch(() => undefined);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={close} />
      <SafeAreaView
        edges={["bottom"]}
        style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
      >
        <DividerRow
          onPress={() =>
            action(() => run((repository) => repository.updatePage(pageId, { isPinned: !pinned })))
          }
        >
          <Icon name="pin-outline" />
          <Text style={[typography.body, { color: colors.text }]}>
            {pinned ? "Unpin" : "Pin"} page
          </Text>
        </DividerRow>
        <DividerRow
          onPress={() =>
            action(async () => {
              const childId = await run((repository) =>
                repository.createPage({ parentId: pageId }),
              );
              router.push(`/pages/${childId}`);
            })
          }
        >
          <Icon name="add-outline" />
          <Text style={[typography.body, { color: colors.text }]}>Add page inside</Text>
        </DividerRow>
        <DividerRow onPress={onMove}>
          <Icon name="git-branch-outline" />
          <Text style={[typography.body, { color: colors.text }]}>Move page…</Text>
        </DividerRow>
        <DividerRow
          onPress={() =>
            action(() => Share.share({ message: markdown, title: "Giraffle Markdown export" }))
          }
        >
          <Icon name="share-outline" />
          <Text style={[typography.body, { color: colors.text }]}>Export Markdown / MDX</Text>
        </DividerRow>
        <DividerRow
          onPress={() =>
            action(async () => {
              await run((repository) =>
                repository.updatePage(pageId, { isArchived: !archived }),
              );
              router.replace(archived ? `/pages/${pageId}` : "/pages");
            })
          }
        >
          <Icon name="archive-outline" />
          <Text style={[typography.body, { color: colors.text }]}>
            {archived ? "Restore" : "Move to archive"}
          </Text>
        </DividerRow>
        <DividerRow
          onPress={() => {
            close();
            Alert.alert(
              "Delete page permanently?",
              "This page and every page inside it will no longer be available. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () =>
                    void run((repository) => repository.deletePage(pageId))
                      .then(() => router.replace("/pages"))
                      .catch(() => undefined),
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

function MoveSheet({
  visible,
  close,
  page,
  pages,
}: {
  visible: boolean;
  close: () => void;
  page: PageModel;
  pages: PageModel[];
}) {
  const { colors } = useTheme();
  const { run } = useApp();
  const options = selectableParentPages(pages, page.id);
  const move = (parentId: string | null) => {
    close();
    void run((repository) => repository.movePage(page.id, parentId)).catch(() => undefined);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={close} />
      <SafeAreaView
        edges={["bottom"]}
        style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
      >
        <Text style={[typography.label, { color: colors.muted, padding: spacing.md }]}>
          Move page to
        </Text>
        <ScrollView style={styles.moveList}>
          <DividerRow onPress={() => move(null)}>
            <Icon name="home-outline" />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>Workspace</Text>
            {page.parentId === null ? <Icon name="checkmark" color={colors.accent} /> : null}
          </DividerRow>
          {options.map((option) => (
            <DividerRow key={option.id} onPress={() => move(option.id)}>
              <Icon name="document-text-outline" />
              <Text numberOfLines={1} style={[typography.body, { color: colors.text, flex: 1 }]}>
                {pageLabel(pages, option)}
              </Text>
              {page.parentId === option.id ? <Icon name="checkmark" color={colors.accent} /> : null}
            </DividerRow>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  moveList: { maxHeight: 320 },
  breadcrumb: {
    height: 42,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  document: { gap: 0, paddingBottom: 0 },
  titleBlock: { gap: spacing.xxs },
  iconSlot: { minHeight: 26, alignItems: "flex-start" },
  iconButton: { paddingHorizontal: spacing.xs, borderRadius: radii.sm },
  icon: { fontSize: 46, lineHeight: 56 },
  addIcon: {
    minHeight: 26,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  picker: {
    marginTop: spacing.xs,
    padding: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xxs,
  },
  choice: { minWidth: 30, minHeight: 30, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  choiceIcon: { fontSize: 18 },
  customIcon: {
    minWidth: 110,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
  },
  backlinks: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 7,
  },
  scrim: { flex: 1 },
  sheet: { paddingHorizontal: 16, paddingBottom: 20 },
});
