import type { CanvasElement } from "@giraffle/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { EditableText } from "@/components/ui/EditableText";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import Canvas from "@/dom/Canvas";
import type { CanvasReferenceRequest } from "@/dom/scene";
import { offlineDomProps } from "@/dom/offline";
import { createId } from "@/platform/ids";
import { useApp } from "@/state/AppProvider";

type CanvasSaveState = "saved" | "saving" | "error";

export default function CanvasEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { snapshot, run } = useApp();
  const canvas = snapshot.canvases.find((item) => item.id === id);
  const [picker, setPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [saveState, setSaveState] = useState<CanvasSaveState>("saved");
  const saveRevision = useRef(0);
  const pendingScene = useRef<{
    elements: CanvasElement[];
    appState: Record<string, unknown>;
  } | null>(null);
  const [add, setAdd] = useState<CanvasReferenceRequest | null>(null);

  if (!canvas) {
    return (
      <View style={{ flex: 1, paddingTop: 80, backgroundColor: colors.background }}>
        <EmptyState
          icon="alert-circle-outline"
          title="Canvas unavailable"
          body="This canvas may have been deleted."
        />
      </View>
    );
  }

  const normalizedQuery = pickerQuery.trim().toLocaleLowerCase();
  const activePages = snapshot.pages.filter(
    (page) =>
      !page.isArchived &&
      (!normalizedQuery || page.title.toLocaleLowerCase().includes(normalizedQuery)),
  );
  const activeTasks = snapshot.tasks.filter(
    (task) =>
      !task.completed &&
      (!normalizedQuery ||
        task.content.toLocaleLowerCase().includes(normalizedQuery) ||
        task.sourceLabel.toLocaleLowerCase().includes(normalizedQuery)),
  );
  const saveScene = (elements: CanvasElement[], appState: Record<string, unknown>) => {
    pendingScene.current = { elements, appState };
    setSaveState("saving");
    saveRevision.current += 1;
    const revision = saveRevision.current;
    void run((repository) => repository.saveCanvas(id, elements, appState))
      .then(() => {
        if (saveRevision.current === revision) {
          pendingScene.current = null;
          setSaveState("saved");
        }
      })
      .catch(() => {
        if (saveRevision.current === revision) setSaveState("error");
      });
  };
  const status =
    saveState === "saved"
      ? { label: "Saved locally", color: colors.success }
      : saveState === "saving"
        ? { label: "Saving…", color: colors.muted }
        : { label: "Not saved", color: colors.danger };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.bar, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
        <Button icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <EditableText
          value={canvas.title}
          onSave={(title) => void run((repository) => repository.renameCanvas(id, title))}
          style={[typography.title, { flex: 1 }]}
        />
        {saveState === "error" ? (
          <Button
            label="Retry"
            icon="refresh-outline"
            tone="danger"
            onPress={() => {
              const pending = pendingScene.current;
              if (pending) saveScene(pending.elements, pending.appState);
            }}
          />
        ) : (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.caption, { color: status.color }]}
          >
            {status.label}
          </Text>
        )}
        <Button
          label="Add"
          icon="add"
          onPress={() => {
            setPickerQuery("");
            setPicker(true);
          }}
        />
      </View>
      <View style={styles.canvas}>
        <Canvas
          elements={canvas.elements}
          pendingReference={add}
          theme={{
            bg: colors.background,
            dot: colors.border,
            surface: colors.surfaceStrong,
            ink: colors.text,
            muted: colors.muted,
            border: colors.borderStrong,
            accent: colors.accent,
            danger: colors.danger,
          }}
          onOpenPage={(pageId) => {
            const board = snapshot.boards.find((item) => item.pageId === pageId);
            router.push(board ? `/trek/${board.id}` : `/notes/${pageId}`);
          }}
          onOpenTask={(taskId) => {
            const task = snapshot.tasks.find((item) => item.id === taskId);
            if (!task) return;
            router.push(`/notes/${task.pageId}`);
          }}
          onError={() => setSaveState("error")}
          onChange={(elements, appState) => {
            setAdd(null);
            saveScene(elements, appState);
          }}
          dom={offlineDomProps({ backgroundColor: colors.background, scrollEnabled: false })}
        />
      </View>
      <Modal
        visible={picker}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(false)}
      >
        <Pressable
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={() => setPicker(false)}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
        >
          <Text style={[typography.title, { color: colors.text }]}>Add to canvas</Text>
          <View
            style={[
              styles.search,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Icon name="search-outline" size={18} color={colors.muted} />
            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Find a page, board, or task"
              placeholderTextColor={colors.faint}
              style={[styles.searchInput, typography.body, { color: colors.text }]}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {activePages.length ? (
              <View>
                <Text style={[styles.sectionLabel, typography.label, { color: colors.muted }]}>Pages and boards</Text>
                {activePages.map((page) => {
                  const board = snapshot.boards.find((item) => item.pageId === page.id);
                  return (
                    <DividerRow
                      key={page.id}
                      onPress={() => {
                        setAdd({
                          kind: "page",
                          pageId: page.id,
                          title: page.title,
                          elementId: createId(),
                          versionNonce: Math.floor(Math.random() * 2_147_483_647),
                        });
                        setPicker(false);
                      }}
                    >
                      <Icon name={board ? "albums-outline" : "document-outline"} />
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                        {page.title}
                      </Text>
                      <Text style={[typography.caption, { color: colors.muted }]}>
                        {board ? "Board" : "Page"}
                      </Text>
                    </DividerRow>
                  );
                })}
              </View>
            ) : null}

            {activeTasks.length ? (
              <View>
                <Text style={[styles.sectionLabel, typography.label, { color: colors.muted }]}>Tasks</Text>
                {activeTasks.map((task) => (
                  <DividerRow
                    key={task.id}
                    onPress={() => {
                      setAdd({
                        kind: "task",
                        taskId: task.id,
                        title: task.content,
                        elementId: createId(),
                        versionNonce: Math.floor(Math.random() * 2_147_483_647),
                      });
                      setPicker(false);
                    }}
                  >
                    <Icon name="checkbox-outline" />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
                        {task.content}
                      </Text>
                      <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
                        {task.sourceLabel}
                      </Text>
                    </View>
                    <Icon name="add" color={colors.accent} />
                  </DividerRow>
                ))}
              </View>
            ) : null}

            {!activePages.length && !activeTasks.length ? (
              <View style={styles.pickerEmpty}>
                {normalizedQuery ? (
                  <Text style={[typography.body, { color: colors.secondary }]}>No matches</Text>
                ) : (
                  <Button
                    label="Create page"
                    tone="accent"
                    onPress={() => {
                      setPicker(false);
                      void run((repository) => repository.createPage())
                        .then((pageId) => router.push(`/notes/${pageId}`))
                        .catch(() => undefined);
                    }}
                  />
                )}
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1 },
  bar: {
    minHeight: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scrim: { flex: 1 },
  sheet: { maxHeight: "72%", padding: spacing.lg, gap: spacing.sm },
  search: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchInput: { flex: 1, minWidth: 0 },
  sectionLabel: { paddingTop: spacing.md, paddingBottom: spacing.xs },
  pickerEmpty: { gap: spacing.lg, paddingVertical: spacing.lg },
});
