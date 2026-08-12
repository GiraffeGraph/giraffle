import {
  blocksToMarkdown,
  pageAncestors,
  pageLabel,
  selectableParentPages,
  type Page as PageModel,
  type TiptapDocument,
} from "@giraffle/domain";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { File } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { EditableText } from "@/components/ui/EditableText";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import Editor, { type EditorAttachment } from "@/dom/Editor";
import { offlineDomProps } from "@/dom/offline";
import { useApp } from "@/state/AppProvider";

type SaveState = "saved" | "saving" | "error";

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
  const { snapshot, run } = useApp();
  const page = snapshot.pages.find((item) => item.id === id);
  const board = snapshot.boards.find((item) => item.pageId === id);
  const [menu, setMenu] = useState(false);
  const [moveSheet, setMoveSheet] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // A page that already has tasks opens showing them; an empty one stays quiet.
  const [tasksOpen, setTasksOpen] = useState(() =>
    snapshot.tasks.some((task) => task.pageId === id),
  );
  const [draft, setDraft] = useState<TiptapDocument | null>(page?.document ?? null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<TiptapDocument | null>(draft);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const persistingRevisionRef = useRef<number | null>(null);

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

  if (board) return <Redirect href={`/boards/${board.id}`} />;

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
  const pageTasks = snapshot.tasks.filter((task) => task.pageId === page.id);
  const selectedTask = snapshot.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedBoard = selectedTask?.boardId
    ? snapshot.boards.find((item) => item.id === selectedTask.boardId)
    : null;

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
          icon="ellipsis-horizontal"
          accessibilityLabel="Page actions"
          onPress={() => setMenu(true)}
        />
      </View>
      <View style={styles.document}>
        <EditableText
          value={page.title}
          onSave={(title) => void run((repository) => repository.updatePage(page.id, { title }))}
          style={[typography.hero, { color: colors.text, marginBottom: 12 }]}
        />
        <View style={[styles.taskSection, { borderColor: colors.border }]}>
          <View style={styles.taskHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: tasksOpen }}
              onPress={() => setTasksOpen((value) => !value)}
              style={styles.taskToggle}
            >
              <Icon
                name={tasksOpen ? "chevron-down" : "chevron-forward"}
                size={14}
                color={colors.muted}
              />
              <Text style={[typography.label, { color: colors.muted }]}>
                Tasks{pageTasks.length ? ` · ${pageTasks.length}` : ""}
              </Text>
            </Pressable>
            <View style={styles.taskSpacer} />
            <Button
              label="Add task"
              icon="add"
              onPress={() => {
                setTasksOpen(true);
                void run((repository) =>
                  repository.createTask({ pageId: page.id, content: "New task" }),
                );
              }}
            />
          </View>
          {tasksOpen ? (
          <ScrollView style={styles.taskList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {pageTasks.map((task) => (
            <DividerRow key={task.id}>
              <Button
                icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
                accessibilityLabel={task.completed ? "Mark incomplete" : "Complete task"}
                onPress={() =>
                  void run((repository) =>
                    repository.updateTask(task.id, { completed: !task.completed }),
                  )
                }
              />
              <EditableText
                value={task.content}
                placeholder="New task"
                onSave={(content) =>
                  void run((repository) => repository.updateTask(task.id, { content }))
                }
                style={[
                  typography.body,
                  {
                    color: task.completed ? colors.muted : colors.text,
                    flex: 1,
                    textDecorationLine: task.completed ? "line-through" : "none",
                  },
                ]}
              />
              <Button
                icon="information-circle-outline"
                accessibilityLabel="Open task details"
                onPress={() => setSelectedTaskId(task.id)}
              />
              {task.boardId ? (
                <Button
                  icon="albums-outline"
                  accessibilityLabel="Open board"
                  onPress={() => router.push(`/boards/${task.boardId}`)}
                />
              ) : null}
              <Button
                icon="trash-outline"
                tone="danger"
                accessibilityLabel="Delete task"
                onPress={() =>
                  Alert.alert("Delete task?", `“${task.content}” will be removed.`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        void run((repository) => repository.deleteTask(task.id)),
                    },
                  ])
                }
              />
            </DividerRow>
            ))}
          </ScrollView>
          ) : null}
        </View>
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
          onTaskToggle={(taskId, checked) => {
            // A checkbox in the document is only a task row when its stable id
            // matches a canonical task; otherwise it remains document content.
            if (!snapshot.tasks.some((task) => task.id === taskId)) return;
            void run((repository) =>
              repository.updateTask(taskId, { completed: checked }),
            ).catch(() => undefined);
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
      </View>
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
      <TaskDetailSheet
        task={selectedTask}
        boardTitle={selectedBoard?.title}
        onClose={() => setSelectedTaskId(null)}
        onSave={(patch) => run((repository) => repository.updateTask(selectedTask!.id, patch))}
        onOpenSource={() => setSelectedTaskId(null)}
        onRemoveFromBoard={
          selectedTask?.boardId
            ? () => {
                setSelectedTaskId(null);
                void run((repository) => repository.removeTaskFromBoard(selectedTask.id));
              }
            : undefined
        }
        onDelete={() => {
          if (!selectedTask) return;
          Alert.alert("Delete task?", `“${selectedTask.content}” will be removed everywhere.`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                setSelectedTaskId(null);
                void run((repository) => repository.deleteTask(selectedTask.id));
              },
            },
          ]);
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
              "This page and its tasks will no longer be available. This cannot be undone.",
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
  document: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  taskSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
  },
  taskList: { maxHeight: 180 },
  taskHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  taskToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  taskSpacer: { flex: 1 },
  backlinks: {
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 7,
  },
  scrim: { flex: 1 },
  sheet: { paddingHorizontal: 16, paddingBottom: 20 },
});
