import {
  addDays,
  addMonths,
  dayKey,
  formatClock,
  groupPagesByDay,
  monthCells,
  parseDue,
  startOfWeek,
  type Page as PageModel,
  type PagePriority,
  type PageState,
} from "@giraffle/domain";
import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  DragSortItem,
  DragSortProvider,
  useDragSort,
  type DropTarget,
} from "@/components/dnd/DragSortContext";
import { StateManagerSheet } from "@/components/pages/StateManagerSheet";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, Icon, Segment } from "@/components/ui/primitives";
import { useUndo } from "@/components/ui/UndoProvider";
import { useTheme } from "@/design/ThemeProvider";
import {
  controls,
  radii,
  spacing,
  typography,
  WIDE_LAYOUT_MIN_WIDTH,
} from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

type Lens = "table" | "board" | "calendar";
type CalendarMode = "day" | "week" | "month";

const LENSES = ["table", "board", "calendar"] as const;
const PRIORITIES: Record<PagePriority, string> = {
  do: "Focus",
  schedule: "Plan",
  delegate: "Delegate",
  eliminate: "Drop",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATE_LANE = "state-lane:";
const STATE_PAGE = "state-page:";
const activationDelay = Platform.OS === "web" ? 0 : 220;
const ignoreDrop = () => undefined;
const titleOf = (page: PageModel) => page.title || "Untitled";

const byPlan = (left: PageModel, right: PageModel) =>
  (left.scheduledAt ?? "z").localeCompare(right.scheduledAt ?? "z") ||
  right.updatedAt - left.updatedAt;

const dateLabel = (scheduledAt: string | null) => {
  const due = parseDue(scheduledAt);
  if (!due) return "";
  const label = new Date(`${due.day}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return due.minutes === null ? label : `${label} ${formatClock(due.minutes)}`;
};

const isLate = (page: PageModel, state: PageState | undefined, today: string) => {
  const due = parseDue(page.scheduledAt)?.day;
  return state?.family === "open" && due ? due < today : false;
};

export default function Plan() {
  const { snapshot, run } = useApp();
  const commit = useUndo();
  const { width } = useWindowDimensions();
  const [lens, setLens] = useState<Lens>("table");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [statesOpen, setStatesOpen] = useState(false);
  const compact = width < WIDE_LAYOUT_MIN_WIDTH;
  const today = dayKey(new Date());

  const { states, stateById, pages, activePages, scheduledPages } = useMemo(() => {
    const stateById = new Map(snapshot.states.map((state) => [state.id, state]));
    const states = snapshot.states
      .filter((state) => state.family !== "forever")
      .sort((left, right) => left.position.localeCompare(right.position));
    const pages = snapshot.pages
      .filter(
        (page) => !page.isArchived && stateById.get(page.stateId)?.family !== "forever",
      )
      .sort(byPlan);
    return {
      states,
      stateById,
      pages,
      activePages: pages.filter((page) => stateById.get(page.stateId)?.family !== "done"),
      scheduledPages: snapshot.pages
        .filter((page) => !page.isArchived && parseDue(page.scheduledAt))
        .sort(byPlan),
    };
  }, [snapshot]);

  return (
    <>
      <ScreenTopbar
        title="Plan"
        action={
          <View style={styles.actions}>
            <Button
              icon="options-outline"
              accessibilityLabel="Manage states"
              onPress={() => setStatesOpen(true)}
            />
            <Button
              label="Capture"
              icon="flash-outline"
              onPress={() => void run((repository) => repository.createCapture("Untitled"))}
            />
          </View>
        }
      />
      <Page wide>
        <Segment values={LENSES} value={lens} onChange={setLens} />
        {lens === "table" ? (
          <TableLens
            pages={activePages}
            stateById={stateById}
            today={today}
            compact={compact}
          />
        ) : lens === "board" ? (
          <BoardLens
            states={states}
            pages={pages}
            onMove={(pageId, stateId) => {
              const previous = pages.find((page) => page.id === pageId)?.stateId;
              const target = stateById.get(stateId)?.title ?? "state";
              if (!previous) return;
              void commit({
                label: `Moved to ${target}`,
                action: () => run((repository) => repository.updatePage(pageId, { stateId })),
                undo: () =>
                  run((repository) => repository.updatePage(pageId, { stateId: previous })),
              });
            }}
          />
        ) : (
          <CalendarLens pages={scheduledPages} day={day} onDay={setDay} compact={compact} />
        )}
      </Page>
      <StateManagerSheet visible={statesOpen} onClose={() => setStatesOpen(false)} />
    </>
  );
}

function PageLink({
  page,
  style,
  children,
}: {
  page: PageModel;
  style(active: boolean): StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${titleOf(page)}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => router.push(`/pages/${page.id}`)}
      style={({ pressed }) => style(pressed || hovered)}
    >
      {children}
    </Pressable>
  );
}

function TableLens({
  pages,
  stateById,
  today,
  compact,
}: {
  pages: PageModel[];
  stateById: Map<string, PageState>;
  today: string;
  compact: boolean;
}) {
  const { colors } = useTheme();
  if (!pages.length) return null;

  return (
    <View>
      <View style={[styles.tableRow, styles.tableHead, { borderBottomColor: colors.border }]}>
        <Text style={[styles.column, styles.name, { color: colors.muted }]}>Name</Text>
        <Text style={[styles.column, styles.state, { color: colors.muted }]}>State</Text>
        {compact ? null : (
          <Text style={[styles.column, styles.priority, { color: colors.muted }]}>Priority</Text>
        )}
        <Text style={[styles.column, styles.date, { color: colors.muted }]}>Date</Text>
      </View>
      {pages.map((page) => {
        const state = stateById.get(page.stateId);
        return (
          <View
            key={page.id}
            style={[styles.tableRow, styles.tableBody, { borderBottomColor: colors.border }]}
          >
            <PageLink
              page={page}
              style={(active) => [
                styles.name,
                styles.nameLink,
                { backgroundColor: active ? colors.hover : "transparent" },
              ]}
            >
              {page.icon ? (
                <Text style={styles.glyph}>{page.icon}</Text>
              ) : (
                <Icon name="document-text-outline" size={15} color={colors.faint} />
              )}
              <Text numberOfLines={1} style={[typography.body, { color: colors.text, flex: 1 }]}>
                {titleOf(page)}
              </Text>
            </PageLink>
            <View style={styles.state}>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.secondary }]}>
                {state?.title ?? ""}
              </Text>
            </View>
            {compact ? null : (
              <Text numberOfLines={1} style={[typography.caption, styles.priority, { color: colors.muted }]}>
                {page.priority ? PRIORITIES[page.priority] : ""}
              </Text>
            )}
            <Text
              numberOfLines={1}
              style={[
                typography.caption,
                styles.date,
                { color: isLate(page, state, today) ? colors.danger : colors.muted },
              ]}
            >
              {dateLabel(page.scheduledAt)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function BoardLens({
  states,
  pages,
  onMove,
}: {
  states: PageState[];
  pages: PageModel[];
  onMove(pageId: string, stateId: string): void;
}) {
  if (!states.length) return null;

  const handleDrop = (sourceKey: string, target: DropTarget) => {
    if (!sourceKey.startsWith(STATE_PAGE)) return;
    const pageId = sourceKey.slice(STATE_PAGE.length);
    let stateId: string | undefined;

    if (target.id.startsWith(STATE_LANE)) {
      stateId = target.id.slice(STATE_LANE.length);
    } else if (target.id.startsWith(STATE_PAGE)) {
      stateId = pages.find(
        (page) => page.id === target.id.slice(STATE_PAGE.length),
      )?.stateId;
    }

    if (!stateId) return;
    const source = pages.find((page) => page.id === pageId);
    if (source?.stateId !== stateId) onMove(pageId, stateId);
  };

  return (
    <DragSortProvider>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.board}
      >
        {states.map((state) => (
          <BoardLane
            key={state.id}
            state={state}
            pages={pages.filter((page) => page.stateId === state.id)}
            onMove={handleDrop}
          />
        ))}
      </ScrollView>
    </DragSortProvider>
  );
}

function BoardLane({
  state,
  pages,
  onMove,
}: {
  state: PageState;
  pages: PageModel[];
  onMove(sourceId: string, target: DropTarget): void;
}) {
  const { colors } = useTheme();
  const drag = useDragSort();
  const laneId = `${STATE_LANE}${state.id}`;
  const targetHere =
    drag.draggingId !== null &&
    (drag.target?.id === laneId ||
      pages.some((page) => drag.target?.id === `${STATE_PAGE}${page.id}`));

  return (
    <DragSortItem
      id={laneId}
      containerOnly
      disabled
      onDrop={ignoreDrop}
      style={[
        styles.boardLane,
        {
          borderTopColor: targetHere ? colors.accent : colors.borderStrong,
          backgroundColor: targetHere ? colors.accentSubtle : "transparent",
        },
      ]}
    >
      <View style={styles.laneHead}>
        <Text numberOfLines={1} style={[typography.label, { color: colors.text, flex: 1 }]}>
          {state.title}
        </Text>
        <Text style={[typography.caption, { color: colors.faint }]}>{pages.length}</Text>
      </View>
      {pages.map((page) => {
        const id = `${STATE_PAGE}${page.id}`;
        return (
          <DragSortItem
            key={page.id}
            id={id}
            activationDelay={activationDelay}
            onDrop={onMove}
          >
            <BoardCard page={page} dragging={drag.draggingId === id} />
          </DragSortItem>
        );
      })}
    </DragSortItem>
  );
}

function BoardCard({ page, dragging }: { page: PageModel; dragging: boolean }) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const showHandle = Platform.OS !== "web" || hovered || dragging;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${titleOf(page)}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => router.push(`/pages/${page.id}`)}
      style={({ pressed }) => [
        styles.boardCard,
        {
          backgroundColor: pressed || hovered ? colors.hover : "transparent",
          borderBottomColor: colors.border,
          opacity: dragging ? 0.46 : 1,
        },
      ]}
    >
      <View style={styles.cardCopy}>
        <Text numberOfLines={2} style={[typography.body, { color: colors.text }]}>
          {titleOf(page)}
        </Text>
        {page.scheduledAt ? (
          <Text style={[typography.caption, { color: colors.muted }]}>
            {dateLabel(page.scheduledAt)}
          </Text>
        ) : null}
      </View>
      <View style={styles.dragSlot}>
        {showHandle ? <Icon name="reorder-three-outline" size={16} color={colors.faint} /> : null}
      </View>
    </Pressable>
  );
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
const monthLabel = (day: string) =>
  new Date(`${day.slice(0, 7)}-01T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
const weekdayName = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
const weekLabel = (days: string[]) => {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return "";
  const start = new Date(`${first}T12:00:00`);
  const end = new Date(`${last}T12:00:00`);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString(undefined, {
    ...(start.getMonth() === end.getMonth() ? {} : { month: "short" as const }),
    day: "numeric",
  })}`;
};

function EventChip({ page, clock }: { page: PageModel; clock: "always" | "time" | "none" }) {
  const { colors } = useTheme();
  const due = parseDue(page.scheduledAt);
  const time =
    due && due.minutes !== null
      ? formatClock(due.minutes)
      : clock === "always"
        ? "All day"
        : null;
  const body = (
    <>
      <Text numberOfLines={1} style={[typography.caption, { color: colors.text, flex: 1 }]}>
        {titleOf(page)}
      </Text>
      {clock !== "none" && time ? (
        <Text style={[typography.caption, { color: colors.secondary }]}>{time}</Text>
      ) : null}
    </>
  );

  if (clock === "none") {
    return <View style={[styles.event, { backgroundColor: colors.accentSubtle }]}>{body}</View>;
  }

  return (
    <PageLink
      page={page}
      style={(active) => [
        styles.event,
        { backgroundColor: active ? colors.hover : colors.accentSubtle },
      ]}
    >
      {body}
    </PageLink>
  );
}

function CalendarLens({
  pages,
  day,
  onDay,
  compact,
}: {
  pages: PageModel[];
  day: string;
  onDay(value: string): void;
  compact: boolean;
}) {
  const { colors } = useTheme();
  const { run } = useApp();
  const [mode, setMode] = useState<CalendarMode>("day");
  const byDay = useMemo(() => groupPagesByDay(pages), [pages]);
  const week = useMemo(() => {
    const first = startOfWeek(day);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }, [day]);
  const cells = useMemo(() => monthCells(day), [day]);
  const today = dayKey(new Date());
  const items = byDay.get(day) ?? [];

  const step = (direction: number) =>
    onDay(
      mode === "day"
        ? addDays(day, direction)
        : mode === "week"
          ? addDays(day, direction * 7)
          : addMonths(day, direction),
    );
  const openDay = (value: string) => {
    onDay(value);
    setMode("day");
  };
  const schedule = async () => {
    const id = await run((repository) =>
      repository.createScheduledPage({
        title: "Untitled",
        scheduledAt: day,
        durationMinutes: 30,
      }),
    );
    router.push(`/pages/${id}`);
  };

  return (
    <View style={styles.calendar}>
      <View style={styles.dayBar}>
        <Button
          icon="chevron-back"
          accessibilityLabel={`Previous ${mode}`}
          onPress={() => step(-1)}
        />
        <View style={styles.dayTitle}>
          <Text style={[typography.title, { color: colors.text }]}>
            {mode === "day" ? dayLabel(day) : mode === "week" ? weekLabel(week) : monthLabel(day)}
          </Text>
          {day !== today ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Return to today"
              onPress={() => onDay(today)}
            >
              <Text style={[typography.caption, { color: colors.accent }]}>Today</Text>
            </Pressable>
          ) : null}
        </View>
        <Button
          icon="chevron-forward"
          accessibilityLabel={`Next ${mode}`}
          onPress={() => step(1)}
        />
        <Button
          icon="add"
          accessibilityLabel={`Schedule a page on ${dayLabel(day)}`}
          onPress={() => void schedule()}
        />
      </View>
      <Segment values={["day", "week", "month"] as const} value={mode} onChange={setMode} />

      {mode === "day" ? (
        items.length ? (
          <View style={styles.dayList}>
            {items.map((page) => (
              <EventChip key={page.id} page={page} clock="always" />
            ))}
          </View>
        ) : null
      ) : mode === "week" ? (
        <View style={[styles.week, compact ? styles.stack : null]}>
          {week.map((value) => (
            <View
              key={value}
              style={[
                compact ? styles.weekRow : styles.weekColumn,
                { borderTopColor: value === day ? colors.borderStrong : colors.border },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${value}`}
                onPress={() => openDay(value)}
                style={styles.weekHead}
              >
                <Text style={[typography.caption, styles.weekday, { color: colors.muted }]}>
                  {weekdayName(value)}
                </Text>
                <Text style={[typography.title, { color: value === today ? colors.accent : colors.text }]}>
                  {Number(value.slice(8, 10))}
                </Text>
              </Pressable>
              {(byDay.get(value) ?? []).map((page) => (
                <EventChip key={page.id} page={page} clock="time" />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.month}>
          <View style={styles.monthWeekdays}>
            {WEEKDAYS.map((label) => (
              <Text key={label} style={[typography.caption, styles.monthWeekday, { color: colors.faint }]}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.monthGrid}>
            {cells.map((value) => {
              const dayItems = byDay.get(value) ?? [];
              const inMonth = value.slice(0, 7) === day.slice(0, 7);
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`${value}, ${dayItems.length} scheduled`}
                  onPress={() => openDay(value)}
                  style={[
                    styles.monthCell,
                    {
                      borderColor: colors.border,
                      backgroundColor: value === day ? colors.selected : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: value === today ? colors.accent : inMonth ? colors.text : colors.faint,
                        fontWeight: value === today ? "700" : "400",
                      },
                    ]}
                  >
                    {Number(value.slice(8, 10))}
                  </Text>
                  {dayItems.slice(0, 2).map((page) => (
                    <EventChip key={page.id} page={page} clock="none" />
                  ))}
                  {dayItems.length > 2 ? (
                    <Text style={[typography.caption, { color: colors.faint }]}>
                      +{dayItems.length - 2}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing.xs },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHead: { minHeight: controls.compact },
  tableBody: { minHeight: controls.default },
  column: { ...typography.label, textTransform: "uppercase", letterSpacing: 0.6 },
  name: { flex: 1, minWidth: 0 },
  nameLink: {
    minHeight: controls.compact,
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  glyph: { width: 19, textAlign: "center", fontSize: 15 },
  state: { width: 112, justifyContent: "center" },
  priority: { width: 96 },
  date: { width: 104, textAlign: "right" },
  board: { gap: spacing.lg, paddingBottom: spacing.sm, alignItems: "flex-start" },
  boardLane: {
    width: 200,
    minHeight: 92,
    paddingBottom: spacing.xs,
    borderTopWidth: 1,
    borderRadius: radii.sm,
  },
  laneHead: {
    minHeight: controls.default,
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  boardCard: {
    minHeight: controls.comfortable,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  dragSlot: { width: 20, alignItems: "center" },
  calendar: { gap: spacing.md },
  dayBar: {
    minHeight: controls.comfortable,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dayTitle: { flex: 1, alignItems: "center" },
  dayList: { gap: spacing.xs },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.xs,
  },
  week: { flexDirection: "row", gap: spacing.xs },
  stack: { flexDirection: "column" },
  weekColumn: {
    flex: 1,
    minWidth: 0,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    gap: spacing.xxs,
  },
  weekRow: { paddingTop: spacing.xs, borderTopWidth: 1, gap: spacing.xxs },
  weekHead: {
    minHeight: controls.compact,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  weekday: { textTransform: "uppercase", letterSpacing: 0.6 },
  month: { gap: spacing.xs },
  monthWeekdays: { flexDirection: "row" },
  monthWeekday: {
    flexBasis: `${100 / 7}%`,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  monthCell: {
    flexBasis: `${100 / 7}%`,
    minHeight: 82,
    padding: spacing.xxs,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xxs,
  },
});
