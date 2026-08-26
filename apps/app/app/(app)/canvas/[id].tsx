import type { CanvasElement } from "@giraffle/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
  const [sceneRevision, setSceneRevision] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const seenUpdatedAt = useRef(canvas?.updatedAt ?? 0);

  useEffect(() => {
    if (!canvas || canvas.updatedAt === seenUpdatedAt.current) return;
    seenUpdatedAt.current = canvas.updatedAt;
    if (!pendingScene.current) setSceneRevision((value) => value + 1);
  }, [canvas]);

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
      page.id !== snapshot.inboxPageId &&
      (!normalizedQuery || page.title.toLocaleLowerCase().includes(normalizedQuery)),
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
        ) : saveState === "saving" ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.caption, { color: colors.muted }]}
          >
            Saving…
          </Text>
        ) : null}
        <Button
          icon="scan-outline"
          accessibilityLabel="Fit canvas content"
          onPress={() => setFitRequest((value) => value + 1)}
        />
        <Button
          icon="add"
          accessibilityLabel="Add page to canvas"
          onPress={() => {
            setPickerQuery("");
            setPicker(true);
          }}
        />
      </View>
      <View style={styles.canvas}>
        <Canvas
          elements={canvas.elements}
          sceneRevision={sceneRevision}
          fitRequest={fitRequest}
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
          onOpenPage={(pageId) => router.push(`/pages/${pageId}`)}
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
              placeholder="Find a page"
              placeholderTextColor={colors.faint}
              style={[styles.searchInput, typography.body, { color: colors.text }]}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {activePages.length ? (
              <View>
                {activePages.map((page) => {
                  return (
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
                    </DividerRow>
                  );
                })}
              </View>
            ) : null}

            {!activePages.length ? (
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
                        .then((pageId) => router.push(`/pages/${pageId}`))
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
  pickerEmpty: { gap: spacing.lg, paddingVertical: spacing.lg },
});
