import { pageAncestors, selectableParentPages, type Page as PageModel } from "@giraffle/domain";
import { addCanvasNode } from "@giraffle/headless";
import { router } from "expo-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { controls, radii, spacing, typography } from "@/design/tokens";
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
interface Action { key: string; title: string; detail?: string; icon: IconName; keywords: string; group: string; run(): void }

/** One result line. Fixed, so the keyboard can put the highlighted row back in view itself. */
const ROW_HEIGHT = 32;

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
  const list = useRef<ScrollView>(null);
  const rowTops = useRef<Record<string, number>>({});
  const viewport = useRef(0);
  const scrolled = useRef(0);

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
  /** Where the Page sits, which is what tells two same-named Pages apart. */
  const trail = (page: PageModel) =>
    pageAncestors(snapshot.pages, page.id).map((crumb) => crumb.title || "Untitled").join(" / ") || "Workspace";

  const choosePage = (next: Step): Action[] => pages.map((page) => ({
    key: `choose-${page.id}`,
    title: page.title || "Untitled",
    detail: trail(page),
    icon: page.isPinned ? "pin-outline" : "document-text-outline",
    keywords: page.title,
    group: "Pages",
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
      group: "States",
      run: () => pendingPage && finish(() => void run((repository) => repository.updatePage(pendingPage.id, { stateId: state.id }))),
    }));
  } else if (step === "move-page") {
    actions = choosePage("parent-target");
  } else if (step === "parent-target") {
    const parents = pendingPage ? selectableParentPages(snapshot.pages, pendingPage.id).filter((page) => !page.isArchived) : [];
    actions = [
      { key: "parent-root", title: "Workspace root", detail: "Make it a top-level Page", icon: "home-outline", keywords: "root top", group: "Workspace", run: () => pendingPage && finish(() => void run((repository) => repository.movePage(pendingPage.id, null))) },
      ...parents.map((parent): Action => ({ key: `parent-${parent.id}`, title: parent.title || "Untitled", detail: trail(parent), icon: "folder-outline", keywords: parent.title, group: "Pages", run: () => pendingPage && finish(() => void run((repository) => repository.movePage(pendingPage.id, parent.id))) })),
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
      group: "Canvases",
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
      { key: "today", title: "Open Today", detail: "Your daily focus", icon: "sunny-outline", keywords: "today daily plan", group: "Actions", run: () => finish(() => router.navigate("/today")) },
      { key: "capture", title: query.trim() ? `Capture “${query.trim()}”` : "Quick capture", detail: "Add an open Page to Inbox", icon: "flash-outline", keywords: "capture inbox new", group: "Actions", run: () => finish(capture) },
      { key: "new-page", title: "New Page", detail: "Create at workspace root", icon: "document-outline", keywords: "page create new", group: "Actions", run: () => finish(createPage) },
      { key: "schedule", title: "Plan a Page for today", detail: "Schedule and open it", icon: "calendar-outline", keywords: "schedule today page", group: "Actions", run: () => enter("schedule-page") },
      { key: "state", title: "Change Page state", detail: "Open, done, forever, or custom", icon: "options-outline", keywords: "state status page", group: "Actions", run: () => enter("state-page") },
      { key: "move", title: "Move a Page", detail: "Choose its one real parent", icon: "git-branch-outline", keywords: "move parent organize", group: "Actions", run: () => enter("move-page") },
      { key: "canvas-page", title: "Add Page to Canvas", detail: "Create a linked visual tile", icon: "shapes-outline", keywords: "canvas add page", group: "Actions", run: () => enter("canvas-page") },
      { key: "new-canvas", title: "New Canvas", detail: "Start a visual map", icon: "map-outline", keywords: "canvas create new", group: "Actions", run: () => finish(() => void run((repository) => repository.createCanvas()).then((id) => router.push(`/canvas/${id}`))) },
      { key: "search", title: "Full-text search", detail: "Search inside Page documents", icon: "search-outline", keywords: "find search content", group: "Actions", run: () => finish(() => router.push("/search")) },
      { key: "account", title: "Settings & account", detail: "Appearance, backup, sync, and lock", icon: "settings-outline", keywords: "settings account backup theme lock", group: "Actions", run: () => finish(() => router.push("/account")) },
      ...pages.slice(0, 40).map((page): Action => ({ key: `page-${page.id}`, title: page.title || "Untitled", detail: trail(page), icon: page.isPinned ? "pin-outline" : "document-text-outline", keywords: `page open ${page.title}`, group: "Pages", run: () => finish(() => router.push(`/pages/${page.id}`)) })),
    ];
  }

  const normalized = query.trim().toLocaleLowerCase();
  const shown = actions.filter((action) => !normalized || `${action.title} ${action.detail ?? ""} ${action.keywords}`.toLocaleLowerCase().includes(normalized)).slice(0, 18);
  const goBack = () => { setPendingPage(null); enter("main"); };
  // Typing shortens the list under the highlight, so the row that Enter opens is
  // the last one that still exists rather than a gap.
  const active = Math.min(selected, Math.max(0, shown.length - 1));
  const activeKey = shown[active]?.key;
  const labelled = new Set(shown.map((action) => action.group)).size > 1;

  // A ScrollView has no notion of a selected child, so walking past the panel's
  // edge with the arrow keys has to bring the row back into view by hand.
  useEffect(() => {
    const top = activeKey === undefined ? undefined : rowTops.current[activeKey];
    if (top === undefined) return;
    if (top < scrolled.current) list.current?.scrollTo({ y: top, animated: false });
    else if (top + ROW_HEIGHT > scrolled.current + viewport.current) list.current?.scrollTo({ y: top + ROW_HEIGHT - viewport.current, animated: false });
  }, [activeKey]);

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close" style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={close} />
    <SafeAreaView pointerEvents="box-none" style={styles.frame}>
      <View style={[styles.panel, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}>
        <View style={styles.search}>
          {step !== "main" ? <Pressable accessibilityRole="button" accessibilityLabel="Back to commands" onPress={goBack} style={styles.back}><Icon name="arrow-back" size={16} color={colors.secondary} /></Pressable> : <Icon name="search-outline" size={16} color={colors.faint} />}
          <TextInput
            ref={input}
            accessibilityLabel="Search commands and Pages"
            value={query}
            onChangeText={(value) => { setQuery(value); setSelected(0); }}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "ArrowDown") setSelected(Math.max(0, Math.min(shown.length - 1, active + 1)));
              else if (nativeEvent.key === "ArrowUp") setSelected(Math.max(0, active - 1));
              else if (nativeEvent.key === "Escape") close();
            }}
            placeholder={prompts[step]}
            placeholderTextColor={colors.faint}
            onSubmitEditing={() => shown[active]?.run()}
            style={[typography.body, styles.input, { color: colors.text }]}
          />
          {Platform.OS === "web" ? <Text style={[typography.caption, styles.key, { color: colors.muted, borderColor: colors.border }]}>esc</Text> : null}
        </View>
        {pendingPage && step !== "main" && step !== "state-page" && step !== "move-page" && step !== "canvas-page" ? <View style={styles.context}><Icon name="document-text-outline" size={15} color={colors.accent} /><Text numberOfLines={1} style={[typography.caption, { color: colors.secondary }]}>{pendingPage.title || "Untitled"}</Text></View> : null}
        <ScrollView
          ref={list}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => { scrolled.current = nativeEvent.contentOffset.y; }}
          onLayout={({ nativeEvent }) => { viewport.current = nativeEvent.layout.height; }}
          contentContainerStyle={styles.results}
        >
          {shown.length ? shown.map((action, index) => <Fragment key={action.key}>
            {labelled && shown[index - 1]?.group !== action.group ? <Text style={[typography.label, styles.groupLabel, { color: colors.faint }]}>{action.group}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.detail ? `${action.title}, ${action.detail}` : action.title}
              accessibilityState={{ selected: index === active }}
              onLayout={({ nativeEvent }) => { rowTops.current[action.key] = nativeEvent.layout.y; }}
              onHoverIn={() => setSelected(index)}
              onPress={action.run}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.pressed : index === active ? colors.selected : "transparent" }]}
            >
              <Icon name={action.icon} size={16} color={colors.faint} />
              <Text numberOfLines={1} style={[typography.body, styles.title, { color: colors.text }]}>{action.title}</Text>
              {action.detail ? <Text numberOfLines={1} style={[typography.caption, styles.detail, { color: colors.faint }]}>{action.detail}</Text> : null}
              {index === active && Platform.OS === "web" ? <Text style={[typography.caption, styles.key, { color: colors.muted, borderColor: colors.border }]}>↵</Text> : null}
            </Pressable>
          </Fragment>) : <Text style={[typography.body, styles.empty, { color: colors.muted }]}>{normalized ? `No match for “${query.trim()}”.` : "Nothing to choose here yet."}</Text>}
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", inset: 0 },
  frame: { flex: 1, alignItems: "center", paddingTop: spacing.xxxl, paddingHorizontal: spacing.lg },
  panel: { width: "100%", maxWidth: 560, maxHeight: "72%", paddingBottom: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.sheet, overflow: "hidden" },
  search: { minHeight: controls.comfortable, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  back: { width: controls.compact, height: controls.compact, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minWidth: 0, height: controls.comfortable },
  context: { height: ROW_HEIGHT, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  results: { paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  groupLabel: { height: ROW_HEIGHT, paddingHorizontal: spacing.sm, lineHeight: ROW_HEIGHT, textTransform: "uppercase", letterSpacing: .6 },
  row: { height: ROW_HEIGHT, paddingHorizontal: spacing.sm, borderRadius: radii.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flexShrink: 1, minWidth: 0 },
  detail: { flex: 1, minWidth: 0 },
  key: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.xs },
  empty: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
});
