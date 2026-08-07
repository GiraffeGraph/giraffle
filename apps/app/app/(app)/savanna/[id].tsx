import type { CanvasElement } from "@giraffle/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { EditableText } from "@/components/ui/EditableText";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import Canvas from "@/dom/Canvas";
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
  const [saveState, setSaveState] = useState<CanvasSaveState>("saved");
  const saveRevision = useRef(0);
  const pendingScene = useRef<{
    elements: CanvasElement[];
    appState: Record<string, unknown>;
  } | null>(null);
  const [add, setAdd] = useState<{
    pageId: string;
    title: string;
    elementId: string;
    versionNonce: number;
  } | null>(null);

  if (!canvas) {
    return (
      <View style={{ flex: 1, paddingTop: 80, backgroundColor: colors.background }}>
        <EmptyState
          icon="alert-circle-outline"
          title="Map unavailable"
          body="This canvas may have been deleted."
        />
      </View>
    );
  }

  const activePages = snapshot.pages.filter((page) => !page.isArchived);
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
          label="Add page"
          icon="document-attach-outline"
          onPress={() => setPicker(true)}
        />
      </View>
      <View style={styles.canvas}>
        <Canvas
          elements={canvas.elements}
          pendingPage={add}
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
          onOpenPage={(pageId) => router.push(`/notes/${pageId}`)}
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
          <Text style={[typography.title, { color: colors.text }]}>Add page reference</Text>
          {activePages.length ? (
            activePages.map((page) => (
              <DividerRow
                key={page.id}
                onPress={() => {
                  setAdd({
                    pageId: page.id,
                    title: page.title,
                    elementId: createId(),
                    versionNonce: Math.floor(Math.random() * 2_147_483_647),
                  });
                  setPicker(false);
                }}
              >
                <Icon name="document-outline" />
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                  {page.title}
                </Text>
                <Icon name="add" color={colors.accent} />
              </DividerRow>
            ))
          ) : (
            <View style={styles.pickerEmpty}>
              <Text style={[typography.body, { color: colors.secondary }]}>
                Create a page first, then return here to place it on the map.
              </Text>
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
            </View>
          )}
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
  sheet: { maxHeight: "65%", padding: spacing.lg, gap: spacing.sm },
  pickerEmpty: { gap: spacing.lg, paddingVertical: spacing.lg },
});
