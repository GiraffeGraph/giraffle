import { dayKey, parseDue, type Page as PageModel } from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { controls, radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const RECENT_LIMIT = 6;

/** Where a clarified capture goes, in the order a person decides it. */
const destinations = [
  { id: "focus", label: "Focus", icon: "flash-outline" },
  { id: "later", label: "Later", icon: "time-outline" },
  { id: "keep", label: "Keep", icon: "bookmark-outline" },
  { id: "close", label: "Close", icon: "close" },
] as const;

type Destination = (typeof destinations)[number]["id"];

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  return hour < 18 ? "Good afternoon" : "Good evening";
};

const when = (value: number): string => {
  const minutes = Math.floor(Math.max(0, Date.now() - value) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
};

const clock = (page: PageModel): string => {
  const due = parseDue(page.scheduledAt);
  if (!due) return "";
  const time = due.minutes === null ? "All day" : (page.scheduledAt?.slice(11, 16) ?? "");
  return page.durationMinutes ? `${time} · ${page.durationMinutes}m` : time;
};

export default function Today() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const today = dayKey(new Date());

  const { scheduled, overdue, inProgress, captures, recent } = useMemo(() => {
    const family = new Map(snapshot.states.map((state) => [state.id, state.family]));
    // A custom open state is a stage deliberately chosen by the user. It reads
    // as work in flight without depending on the state's custom title.
    const staged = new Set(
      snapshot.states
        .filter((state) => state.family === "open" && !state.isDefault)
        .map((state) => state.id),
    );
    const pages = snapshot.pages.filter((page) => !page.isArchived);
    const open = pages.filter((page) => family.get(page.stateId) === "open");

    return {
      scheduled: open.filter((page) => parseDue(page.scheduledAt)?.day === today),
      overdue: open.filter((page) => {
        const due = parseDue(page.scheduledAt)?.day;
        return due ? due < today : false;
      }),
      inProgress: open.filter((page) => staged.has(page.stateId)),
      captures: snapshot.inboxPageId
        ? pages.filter((page) => page.parentId === snapshot.inboxPageId)
        : [],
      recent: [...pages]
        .filter((page) => page.id !== snapshot.inboxPageId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, RECENT_LIMIT),
    };
  }, [snapshot, today]);

  const complete = useCallback(
    (page: PageModel) => {
      const done =
        snapshot.states.find((state) => state.family === "done" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "done");
      if (done) void run((repository) => repository.updatePage(page.id, { stateId: done.id }));
    },
    [run, snapshot.states],
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

      void run(async (repository) => {
        if (destination === "close") {
          if (done) await repository.updatePage(page.id, { stateId: done.id });
          await repository.archivePage(page.id);
          return;
        }

        // Leaving the field means the capture has been clarified, so it moves
        // out from under the Inbox system Page.
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
      }).catch(() => undefined);
    },
    [run, snapshot.states, today],
  );

  const quiet = !scheduled.length && !overdue.length && !inProgress.length && !recent.length;

  return (
    <>
      <ScreenTopbar title="Home" />
      <Page>
        <Text
          accessibilityRole="header"
          style={[styles.greeting, typography.pageTitle, { color: colors.text }]}
        >
          {greeting()}
        </Text>

        <Composer onCapture={capture} />

        <View style={styles.sections}>
          <Inbox pages={captures} onRoute={routeThought} />
          <Agenda title="Today" pages={scheduled} onComplete={complete} />
          <Agenda title="Overdue" pages={overdue} tone="danger" onComplete={complete} />
          <Agenda title="In progress" pages={inProgress} onComplete={complete} />
          <Recent pages={recent} />
          {quiet ? <Quiet /> : null}
        </View>
      </Page>
    </>
  );
}

/** One line to catch a thought before it goes anywhere. */
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
        placeholder="What's on your mind?"
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

/** Captures wait here until they are told where they belong. */
function Inbox({
  pages,
  onRoute,
}: {
  pages: PageModel[];
  onRoute(page: PageModel, destination: Destination): void;
}) {
  const { colors } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  if (!pages.length) return null;

  return (
    <View style={styles.section}>
      <SectionLabel title="Inbox" count={pages.length} />
      {pages.map((page) => (
        <View
          key={page.id}
          style={[
            styles.row,
            { backgroundColor: hoveredId === page.id ? colors.hover : "transparent" },
          ]}
          onPointerEnter={() => setHoveredId(page.id)}
          onPointerLeave={() => setHoveredId((value) => (value === page.id ? null : value))}
        >
          <View style={styles.icon}>
            <Icon name="ellipse-outline" size={13} color={colors.faint} />
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${page.title || "Untitled"}`}
            onPress={() => router.push(`/pages/${page.id}`)}
            style={styles.rowCopy}
          >
            <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
              {page.title || "Untitled"}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            {destinations.map((destination) => (
              <Pressable
                key={destination.id}
                accessibilityRole="button"
                accessibilityLabel={`${destination.label}: ${page.title || "Untitled"}`}
                onPress={() => onRoute(page, destination.id)}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: pressed ? colors.pressed : "transparent" },
                ]}
              >
                <Icon
                  name={destination.icon}
                  size={15}
                  color={destination.id === "close" ? colors.danger : colors.muted}
                />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function SectionLabel({ title, count }: { title: string; count?: number }) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionHead}>
      <Text style={[typography.label, styles.sectionTitle, { color: colors.faint }]}>{title}</Text>
      {count ? <Text style={[typography.caption, { color: colors.faint }]}>{count}</Text> : null}
    </View>
  );
}

/** A row a person can finish without leaving the page they landed on. */
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
  const { colors } = useTheme();
  if (!pages.length) return null;

  return (
    <View style={styles.section}>
      <SectionLabel title={title} count={pages.length} />
      {pages.map((page) => (
        <Row
          key={page.id}
          page={page}
          trailing={clock(page)}
          {...(tone ? { tone } : {})}
          onPress={() => router.push(`/pages/${page.id}`)}
          leading={
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={`Complete ${page.title || "Untitled"}`}
              onPress={() => onComplete(page)}
              style={[styles.check, { borderColor: colors.borderStrong }]}
            />
          }
        />
      ))}
    </View>
  );
}

function Recent({ pages }: { pages: PageModel[] }) {
  if (!pages.length) return null;

  return (
    <View style={styles.section}>
      <SectionLabel title="Recently visited" />
      {pages.map((page) => (
        <Row
          key={page.id}
          page={page}
          trailing={when(page.updatedAt)}
          onPress={() => router.push(`/pages/${page.id}`)}
        />
      ))}
    </View>
  );
}

function Row({
  page,
  trailing,
  leading,
  tone,
  onPress,
}: {
  page: PageModel;
  trailing: string;
  leading?: React.ReactNode;
  tone?: "danger";
  onPress(): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: hovered ? colors.hover : "transparent" },
      ]}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {leading ?? (
        <View style={styles.icon}>
          {page.icon ? (
            <Text style={styles.emoji}>{page.icon}</Text>
          ) : (
            <Icon name="document-text-outline" size={15} color={colors.faint} />
          )}
        </View>
      )}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${page.title || "Untitled"}`}
        onPress={onPress}
        style={styles.rowCopy}
      >
        <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
          {page.title || "Untitled"}
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

/** A first-run workspace has nothing to show, and says so in one line. */
function Quiet() {
  const { colors } = useTheme();

  return (
    <Text style={[typography.body, styles.quiet, { color: colors.muted }]}>
      Nothing scheduled. Write a thought above, or start a page from the sidebar.
    </Text>
  );
}

const styles = StyleSheet.create({
  greeting: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  sections: { marginTop: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.xxs },
  sectionHead: {
    height: controls.compact,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionTitle: { textTransform: "uppercase", letterSpacing: 0.6 },
  row: {
    minHeight: 32,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  icon: { width: 20, alignItems: "center" },
  emoji: { fontSize: 15 },
  check: {
    width: 16,
    height: 16,
    marginHorizontal: 2,
    borderRadius: radii.xs,
    borderWidth: 1.5,
  },
  quiet: { paddingVertical: spacing.sm },
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
  actions: { flexDirection: "row", gap: spacing.xxs },
  action: {
    width: controls.compact,
    height: controls.compact,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
