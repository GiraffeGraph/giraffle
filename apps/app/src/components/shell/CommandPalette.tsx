import { selectableParentPages, type Page as PageModel } from "@giraffle/domain";
import { addCanvasNode } from "@giraffle/headless";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

type Step =
  | "main"
  | "schedule-page"
  | "state-page"
  | "state-target"
  | "move-page"
  | "parent-target"
  | "canvas-page"
  | "canvas-target";
interface Action { key: string; title: string; detail?: string; icon: IconName; keywords: string; run(): void }

function localDay(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const prompts: Record<Step, string> = {
  main: "Open, create, or capture…",
  "schedule-page": "Choose a Page for today…",
  "state-page": "Choose a Page…",
  "state-target": "Choose its new state…",
  "move-page": "Choose a Page to move…",
  "parent-target": "Choose its new parent…",
  "canvas-page": "Choose a Page for Canvas…",
  "canvas-target": "Choose a Canvas…",
};

export function CommandPalette({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [step, setStep] = useState<Step>("main");
  const [pendingPage, setPendingPage] = useState<PageModel | null>(null);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => input.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [visible]);

  const resetSearch = () => { setQuery(""); setSelected(0); };
  const enter = (next: Step) => { setStep(next); resetSearch(); };
  const close = () => { setStep("main"); setPendingPage(null); resetSearch(); onClose(); };
  const finish = (work: () => void) => { close(); work(); };
  const pages = snapshot.pages
    .filter((page) => !page.isArchived)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const openState = snapshot.states.find((state) => state.family === "open" && state.isDefault)
    ?? snapshot.states.find((state) => state.family === "open");

  const choosePage = (next: Step): Action[] => pages.map((page) => ({
    key: `choose-${page.id}`,
    title: page.title || "Untitled",
    detail: page.parentId ? "Nested Page" : "Top-level Page",
    icon: page.isPinned ? "pin-outline" : "document-text-outline",
    keywords: page.title,
    run: () => { setPendingPage(page); enter(next); },
  }));

  let actions: Action[];
  if (step === "schedule-page") {
    actions = choosePage("main").map((action, index) => ({
      ...action,
      run: () => {
        const page = pages[index];
        if (!page) return;
        finish(() => void run((repository) => repository.updatePage(page.id, {
          scheduledAt: localDay(),
          ...(openState ? { stateId: openState.id } : {}),
        })));
      },
    }));
  } else if (step === "state-page") {
    actions = choosePage("state-target");
  } else if (step === "state-target") {
    actions = snapshot.states.map((state) => ({
      key: `state-${state.id}`,
      title: state.title,
      detail: `${state.family} state`,
      icon: state.family === "done" ? "checkmark-circle-outline" : state.family === "open" ? "ellipse-outline" : "bookmark-outline",
      keywords: `${state.title} ${state.family}`,
      run: () => pendingPage && finish(() => void run((repository) => repository.updatePage(pendingPage.id, { stateId: state.id }))),
    }));
  } else if (step === "move-page") {
    actions = choosePage("parent-target");
  } else if (step === "parent-target") {
    const parents = pendingPage ? selectableParentPages(snapshot.pages, pendingPage.id).filter((page) => !page.isArchived) : [];
    actions = [
      { key: "parent-root", title: "Workspace root", detail: "Make it a top-level Page", icon: "home-outline", keywords: "root top", run: () => pendingPage && finish(() => void run((repository) => repository.movePage(pendingPage.id, null))) },
      ...parents.map((parent): Action => ({ key: `parent-${parent.id}`, title: parent.title || "Untitled", detail: "Move inside this Page", icon: "folder-outline", keywords: parent.title, run: () => pendingPage && finish(() => void run((repository) => repository.movePage(pendingPage.id, parent.id))) })),
    ];
  } else if (step === "canvas-page") {
    actions = choosePage("canvas-target");
  } else if (step === "canvas-target") {
    actions = snapshot.canvases.map((canvas) => ({
      key: `canvas-${canvas.id}`,
      title: canvas.title,
      detail: `${canvas.elements.filter((element) => !element.isDeleted).length} elements`,
      icon: "map-outline",
      keywords: canvas.title,
      run: () => {
        if (!pendingPage) return;
        const result = addCanvasNode({
          canvasId: canvas.id,
          elements: canvas.elements,
          pages: snapshot.pages,
          node: { key: `page-${pendingPage.id}`, text: pendingPage.title || "Untitled", pageId: pendingPage.id },
        });
        finish(() => void run((repository) => repository.saveCanvas(canvas.id, result.elements, canvas.appState)).then(() => router.push(`/canvas/${canvas.id}`)));
      },
    }));
  } else {
    const createPage = () => void run((repository) => repository.createPage()).then((id) => router.push(`/pages/${id}`));
    const capture = () => void run((repository) => repository.createCapture(query.trim() || "Untitled")).then((id) => router.push(`/pages/${id}`));
    actions = [
      { key: "today", title: "Open Today", detail: "Your daily focus", icon: "sunny-outline", keywords: "today daily plan", run: () => finish(() => router.navigate("/today")) },
      { key: "capture", title: query.trim() ? `Capture “${query.trim()}”` : "Quick capture", detail: "Add an open Page to Inbox", icon: "flash-outline", keywords: "capture inbox new", run: () => finish(capture) },
      { key: "new-page", title: "New Page", detail: "Create at workspace root", icon: "document-outline", keywords: "page create new", run: () => finish(createPage) },
      { key: "schedule", title: "Plan a Page for today", detail: "Schedule and open it", icon: "calendar-outline", keywords: "schedule today page", run: () => enter("schedule-page") },
      { key: "state", title: "Change Page state", detail: "Open, done, forever, or custom", icon: "options-outline", keywords: "state status page", run: () => enter("state-page") },
      { key: "move", title: "Move a Page", detail: "Choose its one real parent", icon: "git-branch-outline", keywords: "move parent organize", run: () => enter("move-page") },
      { key: "canvas-page", title: "Add Page to Canvas", detail: "Create a linked visual tile", icon: "shapes-outline", keywords: "canvas add page", run: () => enter("canvas-page") },
      { key: "new-canvas", title: "New Canvas", detail: "Start a visual map", icon: "map-outline", keywords: "canvas create new", run: () => finish(() => void run((repository) => repository.createCanvas()).then((id) => router.push(`/canvas/${id}`))) },
      { key: "search", title: "Full-text search", detail: "Search inside Page documents", icon: "search-outline", keywords: "find search content", run: () => finish(() => router.push("/search")) },
      { key: "account", title: "Settings & account", detail: "Appearance, backup, sync, and lock", icon: "settings-outline", keywords: "settings account backup theme lock", run: () => finish(() => router.push("/account")) },
      ...pages.slice(0, 40).map((page): Action => ({ key: `page-${page.id}`, title: page.title || "Untitled", detail: page.parentId ? "Page" : "Top-level Page", icon: page.isPinned ? "pin-outline" : "document-text-outline", keywords: `page open ${page.title}`, run: () => finish(() => router.push(`/pages/${page.id}`)) })),
    ];
  }

  const normalized = query.trim().toLocaleLowerCase();
  const shown = actions.filter((action) => !normalized || `${action.title} ${action.detail ?? ""} ${action.keywords}`.toLocaleLowerCase().includes(normalized)).slice(0, 18);
  const goBack = () => { setPendingPage(null); enter("main"); };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={close} />
    <SafeAreaView pointerEvents="box-none" style={styles.frame}>
      <View style={[styles.panel, { backgroundColor: colors.surfaceStrong, borderColor: colors.borderStrong }]}>
        <View style={[styles.search, { borderBottomColor: colors.border }]}>
          {step !== "main" ? <Pressable accessibilityRole="button" accessibilityLabel="Back to commands" onPress={goBack} style={styles.back}><Icon name="arrow-back" size={19} color={colors.secondary} /></Pressable> : <Icon name="search-outline" size={20} color={colors.muted} />}
          <TextInput
            ref={input}
            value={query}
            onChangeText={(value) => { setQuery(value); setSelected(0); }}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "ArrowDown") setSelected((value) => Math.min(shown.length - 1, value + 1));
              else if (nativeEvent.key === "ArrowUp") setSelected((value) => Math.max(0, value - 1));
            }}
            placeholder={prompts[step]}
            placeholderTextColor={colors.faint}
            onSubmitEditing={() => shown[selected]?.run()}
            style={[typography.body, styles.input, { color: colors.text }]}
          />
          {Platform.OS === "web" ? <Text style={[typography.caption, styles.key, { color: colors.muted, borderColor: colors.border }]}>esc</Text> : null}
        </View>
        {pendingPage && step !== "main" && step !== "state-page" && step !== "move-page" && step !== "canvas-page" ? <View style={[styles.context, { borderBottomColor: colors.border }]}><Icon name="document-text-outline" size={15} color={colors.accent} /><Text numberOfLines={1} style={[typography.caption, { color: colors.secondary }]}>{pendingPage.title}</Text></View> : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
          {shown.length ? shown.map((action, index) => <Pressable key={action.key} accessibilityRole="button" onHoverIn={() => setSelected(index)} onPress={action.run} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.pressed : index === selected ? colors.hover : "transparent" }]}>
            <View style={[styles.icon, { backgroundColor: index === selected ? colors.accentSubtle : colors.hover }]}><Icon name={action.icon} size={18} color={index === selected ? colors.accent : colors.secondary} /></View>
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[typography.body, { fontWeight: "600", color: colors.text }]}>{action.title}</Text>{action.detail ? <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>{action.detail}</Text> : null}</View>
            {index === selected && Platform.OS === "web" ? <Text style={[typography.caption, styles.key, { color: colors.muted, borderColor: colors.border }]}>↵</Text> : null}
          </Pressable>) : <View style={styles.empty}><Text style={[typography.title, { color: colors.text }]}>No match</Text><Text style={[typography.body, { color: colors.muted }]}>Try another title or command.</Text></View>}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: colors.border }]}><Text style={[typography.caption, { color: colors.faint }]}>↑↓ navigate</Text><Text style={[typography.caption, { color: colors.faint }]}>⌘K anywhere</Text></View>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", inset: 0 },
  frame: { flex: 1, alignItems: "center", paddingTop: 72, paddingHorizontal: spacing.lg },
  panel: { width: "100%", maxWidth: 640, maxHeight: "72%", borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.sheet, overflow: "hidden", shadowColor: "#0f0d0a", shadowOpacity: 0.22, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 20 },
  search: { minHeight: 58, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minWidth: 0, fontSize: 16 },
  context: { minHeight: 34, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  results: { padding: spacing.sm },
  row: { minHeight: 56, paddingHorizontal: spacing.sm, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  key: { paddingHorizontal: 7, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.xs },
  empty: { padding: spacing.xl, gap: spacing.sm, alignItems: "flex-start" },
  footer: { minHeight: 36, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
