import { dayKey, parseDue, type Page as PageModel } from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Icon } from "@/components/ui/primitives";
import { useUndo } from "@/components/ui/UndoProvider";
import { useTheme } from "@/design/ThemeProvider";
import { controls, radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const destinations = [
  { id: "focus", label: "Focus", icon: "flash-outline" },
  { id: "later", label: "Later", icon: "time-outline" },
  { id: "keep", label: "Keep", icon: "bookmark-outline" },
  { id: "close", label: "Close", icon: "close" },
] as const;

type Destination = (typeof destinations)[number]["id"];

const clock = (page: PageModel): string => {
  const due = parseDue(page.scheduledAt);
  if (!due) return "";
  const time = due.minutes === null
    ? "All day"
    : new Date(2000, 0, 1, Math.floor(due.minutes / 60), due.minutes % 60).toLocaleTimeString(
        undefined,
        { hour: "numeric", minute: "2-digit" },
      );
  return page.durationMinutes ? `${time} · ${page.durationMinutes}m` : time;
};

const bySchedule = (left: PageModel, right: PageModel) =>
  (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? "");

export default function Today() {
  const { snapshot, run } = useApp();
  const commit = useUndo();
  const today = dayKey(new Date());

  const { scheduled, overdue, inProgress, captures } = useMemo(() => {
    const family = new Map(snapshot.states.map((state) => [state.id, state.family]));
    const staged = new Set(
      snapshot.states
        .filter((state) => state.family === "open" && !state.isDefault)
        .map((state) => state.id),
    );
    const pages = snapshot.pages.filter((page) => !page.isArchived);
    const open = pages.filter((page) => family.get(page.stateId) === "open");
    const scheduledToday = open
      .filter((page) => parseDue(page.scheduledAt)?.day === today)
      .sort(bySchedule);
    const late = open
      .filter((page) => {
        const due = parseDue(page.scheduledAt)?.day;
        return due ? due < today : false;
      })
      .sort(bySchedule);
    const alreadyShown = new Set([...scheduledToday, ...late].map((page) => page.id));

    return {
      scheduled: scheduledToday,
      overdue: late,
      inProgress: open.filter(
        (page) => staged.has(page.stateId) && !alreadyShown.has(page.id),
      ),
      captures: snapshot.inboxPageId
        ? pages.filter((page) => page.parentId === snapshot.inboxPageId)
        : [],
    };
  }, [snapshot, today]);

  const complete = useCallback(
    (page: PageModel) => {
      const done =
        snapshot.states.find((state) => state.family === "done" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "done");
      if (!done) return;
      void commit({
        label: "Marked complete",
        action: () => run((repository) => repository.updatePage(page.id, { stateId: done.id })),
        undo: () =>
          run((repository) => repository.updatePage(page.id, { stateId: page.stateId })),
      });
    },
    [commit, run, snapshot.states],
  );

  const capture = useCallback(
    (title: string) => run((repository) => repository.createCapture(title)),
    [run],
  );

  const routeThought = useCallback(
    (page: PageModel, destination: Destination) => {
      const open =
        snapshot.states.find((state) => state.family === "open" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "open");
      const forever =
        snapshot.states.find((state) => state.family === "forever" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "forever");
      const done =
        snapshot.states.find((state) => state.family === "done" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "done");

      const action = async () =>
        run(async (repository) => {
          if (destination === "close") {
            if (done) await repository.updatePage(page.id, { stateId: done.id });
            await repository.archivePage(page.id);
            return;
          }

          await repository.movePage(page.id, null);

          if (destination === "focus") {
            await repository.updatePage(page.id, {
              ...(open ? { stateId: open.id } : {}),
              priority: "do",
              scheduledAt: today,
            });
            return;
          }

          if (destination === "later") {
            await repository.updatePage(page.id, {
              ...(open ? { stateId: open.id } : {}),
              priority: "schedule",
            });
            return;
          }

          await repository.updatePage(page.id, {
            ...(forever ? { stateId: forever.id } : {}),
            priority: null,
            scheduledAt: null,
            durationMinutes: null,
          });
        });

      void commit({
        label:
          destination === "close"
            ? "Moved to archive"
            : `Moved to ${destinations.find((item) => item.id === destination)?.label ?? destination}`,
        action,
        undo: () =>
          run(async (repository) => {
            if (destination === "close") await repository.archivePage(page.id, false);
            else await repository.movePage(page.id, page.parentId);
            await repository.updatePage(page.id, {
              stateId: page.stateId,
              categoryId: page.categoryId,
              priority: page.priority,
              scheduledAt: page.scheduledAt,
              durationMinutes: page.durationMinutes,
            });
          }),
      });
    },
    [commit, run, snapshot.states, today],
  );

  return (
    <>
      <ScreenTopbar title="Today" />
      <Page>
        <Composer onCapture={capture} />
        <View style={styles.sections}>
          <Agenda title="Today" pages={scheduled} onComplete={complete} />
          <Agenda title="Overdue" pages={overdue} tone="danger" onComplete={complete} />
          <Inbox pages={captures} onRoute={routeThought} />
          <Agenda title="In progress" pages={inProgress} onComplete={complete} />
        </View>
      </Page>
    </>
  );
}

function Composer({ onCapture }: { onCapture(title: string): Promise<unknown> }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    setDraft("");
    void onCapture(title)
      .catch(() => setDraft(title))
      .finally(() => setBusy(false));
  };

  return (
    <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Icon name="flash-outline" size={16} color={colors.faint} />
      <TextInput
        accessibilityLabel="Capture a thought"
        editable={!busy}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        placeholder="Capture…"
        placeholderTextColor={colors.faint}
        returnKeyType="done"
        style={[styles.composerInput, typography.body, { color: colors.text }]}
        value={draft}
      />
      {draft.trim() ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Capture thought"
          onPress={submit}
          style={[styles.send, { backgroundColor: colors.accent }]}
        >
          <Icon name="arrow-up" size={15} color={colors.accentInk} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Inbox({
  pages,
  onRoute,
}: {
  pages: PageModel[];
  onRoute(page: PageModel, destination: Destination): void;
}) {
  if (!pages.length) return null;

  return (
    <View style={styles.section}>
      <SectionLabel title="Inbox" count={pages.length} />
      {pages.map((page) => (
        <InboxRow key={page.id} page={page} onRoute={onRoute} />
      ))}
    </View>
  );
}

function InboxRow({
  page,
  onRoute,
}: {
  page: PageModel;
  onRoute(page: PageModel, destination: Destination): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const title = page.title || "Untitled";
  const showMenu = Platform.OS !== "web" || hovered || open;

  return (
    <View
      style={[
        styles.row,
        styles.inboxRow,
        { backgroundColor: hovered ? colors.hover : "transparent", zIndex: open ? 3 : 0 },
      ]}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        if (Platform.OS === "web") setOpen(false);
      }}
    >
      <View style={styles.icon}>
        <Icon name="ellipse-outline" size={13} color={colors.faint} />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${title}`}
        onPress={() => router.push(`/pages/${page.id}`)}
        style={styles.rowCopy}
      >
        <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
          {title}
        </Text>
      </Pressable>
      <View style={styles.moreSlot}>
        {showMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Organize ${title}`}
            onPress={() => setOpen((value) => !value)}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: pressed ? colors.pressed : "transparent" },
            ]}
          >
            <Icon name="ellipsis-horizontal" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <View
          style={[
            styles.inboxMenu,
            { backgroundColor: colors.surfaceStrong, borderColor: colors.borderStrong },
          ]}
        >
          {destinations.map((destination) => (
            <Pressable
              key={destination.id}
              accessibilityRole="button"
              accessibilityLabel={`${destination.label}: ${title}`}
              onPress={() => {
                setOpen(false);
                onRoute(page, destination.id);
              }}
              style={({ pressed }) => [
                styles.menuRow,
                { backgroundColor: pressed ? colors.hover : "transparent" },
              ]}
            >
              <Icon
                name={destination.icon}
                size={15}
                color={destination.id === "close" ? colors.danger : colors.faint}
              />
              <Text
                style={[
                  typography.body,
                  { color: destination.id === "close" ? colors.danger : colors.text },
                ]}
              >
                {destination.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Text style={[typography.label, styles.sectionTitle, { color: colors.faint }]}>{title}</Text>
      <Text style={[typography.caption, { color: colors.faint }]}>{count}</Text>
    </View>
  );
}

function Agenda({
  title,
  pages,
  onComplete,
  tone,
}: {
  title: string;
  pages: PageModel[];
  onComplete(page: PageModel): void;
  tone?: "danger";
}) {
  if (!pages.length) return null;

  return (
    <View style={styles.section}>
      <SectionLabel title={title} count={pages.length} />
      {pages.map((page) => (
        <AgendaRow
          key={page.id}
          page={page}
          trailing={clock(page)}
          {...(tone ? { tone } : {})}
          onComplete={() => onComplete(page)}
        />
      ))}
    </View>
  );
}

function AgendaRow({
  page,
  trailing,
  tone,
  onComplete,
}: {
  page: PageModel;
  trailing: string;
  tone?: "danger";
  onComplete(): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const title = page.title || "Untitled";

  return (
    <View
      style={[styles.row, { backgroundColor: hovered ? colors.hover : "transparent" }]}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false }}
        accessibilityLabel={`Complete ${title}`}
        onPress={onComplete}
        style={[styles.check, { borderColor: colors.borderStrong }]}
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${title}`}
        onPress={() => router.push(`/pages/${page.id}`)}
        style={styles.rowCopy}
      >
        <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
          {title}
        </Text>
      </Pressable>
      {trailing ? (
        <Text style={[typography.caption, { color: tone ? colors.danger : colors.faint }]}>
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: spacing.xl },
  section: { gap: spacing.xxs },
  sectionHead: {
    height: controls.compact,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionTitle: { textTransform: "uppercase", letterSpacing: 0.6 },
  row: {
    minHeight: controls.default,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inboxRow: { position: "relative" },
  rowCopy: { flex: 1, minWidth: 0 },
  icon: { width: 20, alignItems: "center" },
  check: {
    width: 16,
    height: 16,
    marginHorizontal: 2,
    borderRadius: radii.xs,
    borderWidth: 1.5,
  },
  composer: {
    minHeight: controls.comfortable,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  composerInput: { flex: 1, minHeight: controls.comfortable },
  send: {
    width: controls.compact,
    height: controls.compact,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  moreSlot: { width: controls.compact, height: controls.compact },
  action: {
    width: controls.compact,
    height: controls.compact,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxMenu: {
    position: "absolute",
    top: controls.default - 2,
    right: 0,
    width: 152,
    padding: spacing.xxs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  menuRow: {
    minHeight: controls.default,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
