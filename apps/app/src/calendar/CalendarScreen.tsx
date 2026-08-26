import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDays,
  addMonths,
  dayKey,
  formatDue,
  parseDue,
  snapMinutes,
  startOfWeek,
  type Page,
  type PagePriority,
  type PageState,
} from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, Segment } from "@/components/ui/primitives";
import { useUndo } from "@/components/ui/UndoProvider";
import { useTheme } from "@/design/ThemeProvider";
import { controls, radii, spacing, typography, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";
import { pickCalendarFile, shareCalendarFile } from "./calendarFile";
import { CALENDAR_COLORS, calendarColorStyle } from "./calendarColors";
import { exportCalendarIcs, importCalendarIcs } from "./ics";
import { calendarReminders, reconcileCalendarReminders, setCalendarReminder } from "./reminders";
import { useGoogleCalendarSync } from "./useGoogleCalendarSync";
import {
  calendarPages,
  layoutTimedPages,
  pagesOnDay,
  parseQuickSchedule,
  recurrenceDays,
  type CalendarMode,
  type RecurrenceFrequency,
} from "./calendarModel";

const MODE_KEY = "giraffle.calendar.mode";
const DAY_KEY = "giraffle.calendar.day";
const COMPLETED_KEY = "giraffle.calendar.completed";
const HOUR_HEIGHT = 64;
const TIME_GUTTER = 52;
const MIN_EVENT_HEIGHT = 25;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const titleOf = (page: Page) => page.title || "Untitled";

const dateAtNoon = (day: string) => new Date(`${day}T12:00:00`);
const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
  dateAtNoon(day).toLocaleDateString(undefined, options);
const fullDayLabel = (day: string) =>
  dateLabel(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const shortDayLabel = (day: string) => dateLabel(day, { weekday: "short", month: "short", day: "numeric" });
const timeLabel = (minutes: number) => {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
const weekDays = (day: string) => {
  const first = startOfWeek(day);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
};
const weekTitle = (days: readonly string[]) => {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return "";
  const start = dateAtNoon(first);
  const end = dateAtNoon(last);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, {
    month: start.getMonth() === end.getMonth() ? undefined : "short",
    day: "numeric",
    year: start.getFullYear() === end.getFullYear() ? undefined : "numeric",
  });
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
};

interface DraftSchedule {
  day: string;
  minutes: number | null;
  durationMinutes: number;
}

export function CalendarScreen() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const commit = useUndo();
  const googleSync = useGoogleCalendarSync(snapshot.pages, run);
  const { width } = useWindowDimensions();
  const compact = width < WIDE_LAYOUT_MIN_WIDTH;
  const today = dayKey(new Date());
  const [day, setDayValue] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(() => weekDays(today)[0] as string);
  const [mode, setModeValue] = useState<CalendarMode>(compact ? "day" : "week");
  const [visibleMonth, setVisibleMonth] = useState(today.slice(0, 7));
  const [showCompleted, setShowCompleted] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSchedule | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stateIds, setStateIds] = useState<Set<string>>(new Set());
  const [priorities, setPriorities] = useState<Set<PagePriority>>(new Set());
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState<"import" | "export" | null>(null);
  const [reminders, setReminders] = useState<Record<string, number>>({});

  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem(MODE_KEY),
      AsyncStorage.getItem(DAY_KEY),
      AsyncStorage.getItem(COMPLETED_KEY),
      AccessibilityInfo.isReduceMotionEnabled(),
    ]).then(([storedMode, storedDay, storedCompleted, reduced]) => {
      if (storedMode === "day" || storedMode === "week" || storedMode === "month") {
        setModeValue(storedMode);
      }
      if (storedDay && parseDue(storedDay)) {
        setDayValue(storedDay);
        setWeekAnchor(weekDays(storedDay)[0] as string);
      }
      if (storedCompleted === "false") setShowCompleted(false);
      setReduceMotion(reduced);
    }).catch(() => undefined);
  }, []);

  const setDay = (value: string) => {
    setDayValue(value);
    void AsyncStorage.setItem(DAY_KEY, value).catch(() => undefined);
  };
  const setMode = (value: CalendarMode) => {
    if (value === "week") setWeekAnchor(weekDays(day)[0] as string);
    if (value === "month") setVisibleMonth(day.slice(0, 7));
    setModeValue(value);
    void AsyncStorage.setItem(MODE_KEY, value).catch(() => undefined);
  };
  const setCompleted = (value: boolean) => {
    setShowCompleted(value);
    void AsyncStorage.setItem(COMPLETED_KEY, String(value)).catch(() => undefined);
  };

  const states = useMemo(
    () => new Map(snapshot.states.map((state) => [state.id, state])),
    [snapshot.states],
  );
  const allScheduled = useMemo(
    () => calendarPages(snapshot.pages, snapshot.states),
    [snapshot.pages, snapshot.states],
  );
  const shown = useMemo(() => {
    const byId = new Map(snapshot.pages.map((page) => [page.id, page]));
    const inScope = (page: Page) => {
      if (!scopeId) return true;
      let current: Page | undefined = page;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        if (current.id === scopeId) return true;
        visited.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return false;
    };
    return calendarPages(allScheduled.filter(inScope), snapshot.states, {
      showCompleted,
      priorities,
      stateIds,
    });
  }, [allScheduled, priorities, scopeId, showCompleted, snapshot.pages, snapshot.states, stateIds]);
  const selected = selectedId ? snapshot.pages.find((page) => page.id === selectedId) ?? null : null;
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekAnchor, index)), [weekAnchor]);

  useEffect(() => {
    void calendarReminders().then(setReminders).catch(() => undefined);
  }, []);
  useEffect(() => {
    void reconcileCalendarReminders(allScheduled).catch(() => undefined);
  }, [allScheduled]);

  const step = (direction: number) => {
    const next = mode === "day"
      ? addDays(day, direction)
      : mode === "week"
        ? addDays(day, direction * 7)
        : addMonths(`${visibleMonth}-01`, direction);
    if (mode === "week") setWeekAnchor((current) => addDays(current, direction * 7));
    if (mode === "month") setVisibleMonth(next.slice(0, 7));
    setDay(next);
  };
  const glideTimeline = (direction: number) => {
    if (mode === "week") setWeekAnchor((current) => addDays(current, direction));
    else setDay(addDays(day, direction));
  };
  const title =
    mode === "day"
      ? fullDayLabel(day)
      : mode === "week"
        ? weekTitle(days)
        : dateLabel(`${visibleMonth}-01`, { month: "long", year: "numeric" });

  const nextSlot = () => {
    if (day !== today) return 9 * 60;
    const now = new Date();
    return snapMinutes(now.getHours() * 60 + now.getMinutes() + 15);
  };
  const openCreate = (value = day, minutes: number | null = nextSlot()) => {
    setDay(value);
    setDraft({ day: value, minutes, durationMinutes: 30 });
  };

  const exportFile = async () => {
    if (fileBusy) return;
    setFileError(null);
    setFileBusy("export");
    try {
      await shareCalendarFile(exportCalendarIcs(shown));
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "Calendar export failed");
    } finally {
      setFileBusy(null);
    }
  };
  const importFile = async () => {
    if (fileBusy) return;
    setFileError(null);
    setFileBusy("import");
    try {
      const source = await pickCalendarFile();
      if (!source) return;
      const imported = importCalendarIcs(source);
      if (!imported.length) throw new Error("No calendar items were found in that file");
      await run(async (repository) => {
        for (const item of imported) await repository.createScheduledPage(item);
      });
      setFiltersOpen(false);
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "Calendar import failed");
    } finally {
      setFileBusy(null);
    }
  };

  const move = (page: Page, nextDay: string, nextMinutes: number | null) => {
    const previous = page.scheduledAt;
    const scheduledAt = formatDue(nextDay, nextMinutes);
    if (scheduledAt === previous) return;
    void commit({
      label: "Event moved",
      action: () => run((repository) => repository.updatePage(page.id, { scheduledAt })),
      undo: () => run((repository) => repository.updatePage(page.id, { scheduledAt: previous })),
    });
  };
  const resize = (page: Page, durationMinutes: number) => {
    const previous = page.durationMinutes;
    const next = Math.max(15, Math.min(24 * 60, snapMinutes(durationMinutes)));
    if (next === previous) return;
    void commit({
      label: "Duration changed",
      action: () => run((repository) => repository.updatePage(page.id, { durationMinutes: next })),
      undo: () => run((repository) => repository.updatePage(page.id, { durationMinutes: previous })),
    });
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const listener = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.metaKey || event.ctrlKey || event.altKey || draft || selectedId || filtersOpen) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key.toLowerCase() === "t") { setDay(today); setWeekAnchor(weekDays(today)[0] as string); }
      else if (event.key.toLowerCase() === "n") openCreate();
      else if (event.key === "1") setMode("day");
      else if (event.key === "2") setMode("week");
      else if (event.key === "3") setMode("month");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Button icon="chevron-back" accessibilityLabel={`Previous ${mode}`} onPress={() => step(-1)} />
        <View style={styles.toolbarTitle}>
          <Text accessibilityRole="header" numberOfLines={1} style={[typography.heading, styles.title, { color: colors.text }]}>
            {title}
          </Text>
          {(mode === "week" ? !days.includes(today) : day !== today) ? (
            <Pressable accessibilityRole="button" onPress={() => { setDay(today); setWeekAnchor(weekDays(today)[0] as string); setVisibleMonth(today.slice(0, 7)); }} style={styles.todayButton}>
              <Text style={[typography.caption, { color: colors.accent }]}>Today</Text>
            </Pressable>
          ) : null}
        </View>
        <Button icon="chevron-forward" accessibilityLabel={`Next ${mode}`} onPress={() => step(1)} />
        <Button icon="options-outline" accessibilityLabel="Calendar filters" onPress={() => setFiltersOpen(true)} />
        {googleSync.connected ? (
          <Button
            icon="sync-outline"
            accessibilityLabel={googleSync.syncing ? "Syncing Google Calendar" : googleSync.error ? `Google Calendar sync failed: ${googleSync.error}` : "Sync Google Calendar"}
            disabled={googleSync.syncing}
            onPress={() => void googleSync.syncNow().catch(() => undefined)}
          />
        ) : null}
        {compact ? (
          <Button icon="add" accessibilityLabel="New calendar item" tone="accent" onPress={() => openCreate()} />
        ) : (
          <Button icon="add" label="New" accessibilityLabel="New calendar item" tone="accent" onPress={() => openCreate()} />
        )}
      </View>

      <Segment values={["day", "week", "month"] as const} value={mode} onChange={setMode} />

      {mode === "month" ? (
        <MonthView
          day={day}
          pages={shown}
          states={states}
          compact={compact}
          onDay={(value) => {
            setDay(value);
            setMode("day");
          }}
          onEvent={setSelectedId}
          onCreate={(value) => openCreate(value, null)}
          onVisibleMonth={setVisibleMonth}
        />
      ) : compact && mode === "week" ? (
        <WeekAgenda
          days={days}
          pages={shown}
          states={states}
          selectedDay={day}
          onDay={(value) => {
            setDay(value);
            setMode("day");
          }}
          onEvent={setSelectedId}
          onCreate={(value) => openCreate(value, null)}
          onNavigate={glideTimeline}
        />
      ) : (
        <Timeline
          days={mode === "day" ? [day] : days}
          selectedDay={day}
          pages={shown}
          states={states}
          compact={compact}
          onDay={setDay}
          onEvent={setSelectedId}
          onCreate={openCreate}
          onMove={move}
          onResize={resize}
          onNavigate={glideTimeline}
        />
      )}

      {draft ? (
        <QuickScheduleSheet
          key={`${draft.day}-${draft.minutes ?? "all"}`}
          draft={draft}
          reduceMotion={reduceMotion}
          onClose={() => setDraft(null)}
          onCreate={async (titleValue, schedule) => {
            const id = await run((repository) => repository.createScheduledPage({
              title: titleValue,
              scheduledAt: formatDue(schedule.day, schedule.minutes),
              durationMinutes: schedule.minutes === null ? null : schedule.durationMinutes,
            }));
            setDraft(null);
            setSelectedId(id);
          }}
        />
      ) : null}
      {selected ? (
        <CalendarItemSheet
          key={selected.id}
          page={selected}
          state={states.get(selected.stateId)}
          states={[...states.values()]}
          reduceMotion={reduceMotion}
          reminderMinutes={reminders[selected.id] ?? null}
          onClose={() => setSelectedId(null)}
          onMove={move}
          onReminder={async (value) => {
            await setCalendarReminder(selected, value);
            setReminders((current) => {
              const next = { ...current };
              if (value === null) delete next[selected.id]; else next[selected.id] = value;
              return next;
            });
          }}
          onResize={resize}
        />
      ) : null}
      <FilterSheet
        visible={filtersOpen}
        states={snapshot.states}
        stateIds={stateIds}
        priorities={priorities}
        pages={snapshot.pages.filter((page) => !page.isArchived && page.parentId === null && page.id !== snapshot.inboxPageId)}
        scopeId={scopeId}
        showCompleted={showCompleted}
        reduceMotion={reduceMotion}
        onCompleted={setCompleted}
        fileError={fileError}
        fileBusy={fileBusy}
        onExport={() => void exportFile()}
        onImport={() => void importFile()}
        onPriorities={setPriorities}
        onScope={setScopeId}
        onStateIds={setStateIds}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
}

function Timeline({
  days,
  selectedDay,
  pages,
  states,
  compact,
  onDay,
  onEvent,
  onCreate,
  onMove,
  onResize,
  onNavigate,
}: {
  days: string[];
  selectedDay: string;
  pages: Page[];
  states: Map<string, PageState>;
  compact: boolean;
  onDay(day: string): void;
  onEvent(id: string): void;
  onCreate(day: string, minutes: number | null): void;
  onMove(page: Page, day: string, minutes: number | null): void;
  onResize(page: Page, durationMinutes: number): void;
  onNavigate(direction: number): void;
}) {
  const { colors } = useTheme();
  const shell = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const autoScrolledSignature = useRef("");
  const [width, setWidth] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const today = dayKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dayWidth = width > TIME_GUTTER ? (width - TIME_GUTTER) / days.length : 0;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const daySignature = days.join("|");
  const scrollToCurrentTime = useCallback(() => {
    const current = new Date();
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    scroll.current?.scrollTo({ y: Math.max(0, (currentMinutes - 75) * HOUR_HEIGHT / 60), animated: false });
    autoScrolledSignature.current = daySignature;
  }, [daySignature]);

  useEffect(() => {
    autoScrolledSignature.current = "";
    const timer = setTimeout(scrollToCurrentTime, 0);
    return () => clearTimeout(timer);
  }, [scrollToCurrentTime]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = shell.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    let distance = 0;
    let reset: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (rawEvent: Event) => {
      const event = rawEvent as WheelEvent;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (!horizontal) return;
      event.preventDefault();
      distance += horizontal;
      while (Math.abs(distance) >= 80) {
        const direction = distance > 0 ? 1 : -1;
        onNavigate(direction);
        distance -= direction * 80;
      }
      if (reset) clearTimeout(reset);
      reset = setTimeout(() => { distance = 0; }, 180);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      if (reset) clearTimeout(reset);
      node.removeEventListener("wheel", onWheel);
    };
  }, [onNavigate]);

  return (
    <View ref={shell} style={[styles.timelineShell, { borderColor: colors.border }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {compact && days.length === 1 ? (
        <View style={[styles.mobileDayStrip, { borderBottomColor: colors.border }]}>
          {weekDays(selectedDay).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={fullDayLabel(value)}
              accessibilityState={{ selected: value === selectedDay }}
              onPress={() => onDay(value)}
              style={[styles.mobileDay, { backgroundColor: value === selectedDay ? colors.selected : "transparent" }]}
            >
              <Text style={[typography.label, { color: colors.muted }]}>{dateLabel(value, { weekday: "narrow" })}</Text>
              <Text style={[typography.title, { color: value === today ? colors.accent : colors.text }]}>{Number(value.slice(8, 10))}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.timelineHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.timelineGutter, { borderRightColor: colors.border }]} />
        {days.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={fullDayLabel(value)}
            accessibilityState={{ selected: value === selectedDay }}
            onPress={() => onDay(value)}
            style={[styles.timelineDayHead, { width: dayWidth, backgroundColor: value === selectedDay ? colors.selected : "transparent" }]}
          >
            <Text style={[typography.label, { color: colors.muted }]}>{dateLabel(value, { weekday: "short" })}</Text>
            <Text style={[typography.title, { color: value === today ? colors.accent : colors.text }]}>{Number(value.slice(8, 10))}</Text>
          </Pressable>
        ))}
      </View>

      <AllDayStrip days={days} dayWidth={dayWidth} pages={pages} states={states} onEvent={onEvent} onCreate={onCreate} />

      <ScrollView
        ref={scroll}
        nestedScrollEnabled
        onContentSizeChange={() => {
          if (autoScrolledSignature.current !== daySignature) scrollToCurrentTime();
        }}
        style={styles.timelineScroll}
        contentContainerStyle={{ height: HOUR_HEIGHT * 24 }}
      >
        <View style={{ height: HOUR_HEIGHT * 24, width }}>
          {HOURS.map((hour) => (
            <View key={hour} pointerEvents="box-none" style={[styles.hourLine, { top: hour * HOUR_HEIGHT, borderTopColor: colors.border }]}>
              {hour > 0 ? <Text style={[typography.caption, styles.hourLabel, { color: colors.faint }]}>{timeLabel(hour * 60)}</Text> : null}
            </View>
          ))}
          {days.map((value, dayIndex) => (
            <View key={value} pointerEvents="box-none">
              <View pointerEvents="none" style={[styles.dayDivider, { left: TIME_GUTTER + dayIndex * dayWidth, borderLeftColor: colors.border }]} />
              {HOURS.map((hour) => (
                <Pressable
                  key={`${value}-${hour}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Create on ${fullDayLabel(value)} at ${timeLabel(hour * 60)}`}
                  onPress={() => onCreate(value, hour * 60)}
                  style={[styles.hourSlot, { left: TIME_GUTTER + dayIndex * dayWidth, top: hour * HOUR_HEIGHT, width: dayWidth, height: HOUR_HEIGHT }]}
                />
              ))}
              {layoutTimedPages(pagesOnDay(pages, value).timed).map((placement) => (
                <DraggableEvent
                  key={placement.page.id}
                  placement={placement}
                  state={states.get(placement.page.stateId)}
                  day={value}
                  dayIndex={dayIndex}
                  dayWidth={dayWidth}
                  totalDays={days.length}
                  onOpen={() => onEvent(placement.page.id)}
                  onMove={onMove}
                  onResize={onResize}
                />
              ))}
              {value === today ? (
                <View pointerEvents="none" style={[styles.nowLine, { left: TIME_GUTTER + dayIndex * dayWidth, top: nowMinutes * HOUR_HEIGHT / 60, width: dayWidth, backgroundColor: colors.danger }]}>
                  <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function AllDayStrip({ days, dayWidth, pages, states, onEvent, onCreate }: {
  days: string[];
  dayWidth: number;
  pages: Page[];
  states: Map<string, PageState>;
  onEvent(id: string): void;
  onCreate(day: string, minutes: number | null): void;
}) {
  const { colors } = useTheme();
  const maxItems = 2;
  return (
    <View style={[styles.allDay, { borderBottomColor: colors.border }]}>
      <Text style={[typography.caption, styles.allDayLabel, { color: colors.faint }]}>all-day</Text>
      {days.map((day) => {
        const items = pagesOnDay(pages, day).allDay;
        return (
          <Pressable key={day} accessibilityRole="button" accessibilityLabel={`Add all-day item on ${fullDayLabel(day)}`} onPress={() => onCreate(day, null)} style={[styles.allDayColumn, { width: dayWidth, borderLeftColor: colors.border }]}>
            {items.slice(0, maxItems).map((page) => {
              const done = states.get(page.stateId)?.family === "done";
              const customColor = calendarColorStyle(page.calendarColor);
              return (
                <Pressable key={page.id} accessibilityRole="button" accessibilityLabel={`Open ${titleOf(page)}`} onPress={() => onEvent(page.id)} style={[styles.allDayEvent, { backgroundColor: customColor?.background ?? colors.accentSubtle, opacity: done ? 0.5 : 1 }]}>
                  <Text numberOfLines={1} style={[typography.caption, { color: customColor?.foreground ?? colors.text, textDecorationLine: done ? "line-through" : "none" }]}>{titleOf(page)}</Text>
                </Pressable>
              );
            })}
            {items.length > maxItems ? <Text style={[typography.caption, { color: colors.faint }]}>+{items.length - maxItems}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function DraggableEvent({ placement, state, day, dayIndex, dayWidth, totalDays, onOpen, onMove, onResize }: {
  placement: ReturnType<typeof layoutTimedPages>[number];
  state: PageState | undefined;
  day: string;
  dayIndex: number;
  dayWidth: number;
  totalDays: number;
  onOpen(): void;
  onMove(page: Page, day: string, minutes: number | null): void;
  onResize(page: Page, durationMinutes: number): void;
}) {
  const { colors } = useTheme();
  const [translation] = useState(() => new Animated.ValueXY());
  const [dragging, setDragging] = useState(false);
  const width = dayWidth / placement.columns;
  const left = TIME_GUTTER + dayIndex * dayWidth + placement.column * width + 2;
  const top = placement.start * HOUR_HEIGHT / 60 + 1;
  const height = Math.max(MIN_EVENT_HEIGHT, (placement.end - placement.start) * HOUR_HEIGHT / 60 - 2);
  const done = state?.family === "done";
  const customColor = calendarColorStyle(placement.page.calendarColor);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
    onPanResponderGrant: () => setDragging(true),
    onPanResponderMove: Animated.event([null, { dx: translation.x, dy: translation.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_event, gesture) => {
      const dayOffset = totalDays > 1 ? Math.round(gesture.dx / Math.max(1, dayWidth)) : 0;
      const minuteOffset = Math.round((gesture.dy * 60 / HOUR_HEIGHT) / 15) * 15;
      translation.setValue({ x: 0, y: 0 });
      setDragging(false);
      onMove(placement.page, addDays(day, dayOffset), snapMinutes(placement.start + minuteOffset));
    },
    onPanResponderTerminate: () => {
      translation.setValue({ x: 0, y: 0 });
      setDragging(false);
    },
  }), [day, dayWidth, onMove, placement.page, placement.start, totalDays, translation]);

  const resizePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderRelease: (_event, gesture) => onResize(
      placement.page,
      (placement.page.durationMinutes ?? 30) + Math.round((gesture.dy * 60 / HOUR_HEIGHT) / 15) * 15,
    ),
  }), [onResize, placement.page]);

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.timedEvent,
        {
          left,
          top,
          width: Math.max(24, width - 4),
          height,
          backgroundColor: customColor?.background ?? colors.accentSubtle,
          borderLeftColor: customColor?.foreground ?? colors.accent,
          opacity: done ? 0.5 : dragging ? 0.72 : 1,
          transform: translation.getTranslateTransform(),
          zIndex: dragging ? 10 : 3,
        },
      ]}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`${titleOf(placement.page)}, ${timeLabel(placement.start)}`} onPress={onOpen} style={styles.eventPress}>
        <Text numberOfLines={1} style={[typography.caption, styles.eventTitle, { color: customColor?.foreground ?? colors.text, textDecorationLine: done ? "line-through" : "none" }]}>{titleOf(placement.page)}</Text>
        {height >= 38 ? <Text numberOfLines={1} style={[typography.caption, { color: customColor?.foreground ?? colors.secondary, opacity: 0.78 }]}>{timeLabel(placement.start)}</Text> : null}
      </Pressable>
      <View
        {...resizePan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Resize ${titleOf(placement.page)}`}
        accessibilityValue={{ text: `${placement.page.durationMinutes ?? 30} minutes` }}
        accessibilityActions={[{ name: "increment", label: "Add 15 minutes" }, { name: "decrement", label: "Remove 15 minutes" }]}
        onAccessibilityAction={(event) => onResize(
          placement.page,
          (placement.page.durationMinutes ?? 30) + (event.nativeEvent.actionName === "increment" ? 15 : -15),
        )}
        hitSlop={16}
        style={styles.resizeHandle}
      >
        <View style={[styles.resizeGrip, { backgroundColor: customColor?.foreground ?? colors.accent }]} />
      </View>
    </Animated.View>
  );
}

function WeekAgenda({ days, pages, states, selectedDay, onDay, onEvent, onCreate, onNavigate }: {
  days: string[];
  pages: Page[];
  states: Map<string, PageState>;
  selectedDay: string;
  onDay(value: string): void;
  onEvent(id: string): void;
  onCreate(value: string): void;
  onNavigate(direction: number): void;
}) {
  const { colors } = useTheme();
  const today = dayKey(new Date());
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 32 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) > 64) onNavigate(gesture.dx > 0 ? -1 : 1);
    },
  }), [onNavigate]);

  return (
    <ScrollView {...swipe.panHandlers} style={styles.agendaScroll} contentContainerStyle={styles.agendaContent}>
      {days.map((value) => {
        const items = pagesOnDay(pages, value);
        const scheduled = [...items.allDay, ...items.timed];
        return (
          <View key={value} style={[styles.agendaSection, { borderBottomColor: colors.border }]}>
            <View style={styles.agendaHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${fullDayLabel(value)}`}
                accessibilityState={{ selected: value === selectedDay }}
                onPress={() => onDay(value)}
                style={[styles.agendaDate, { backgroundColor: value === selectedDay ? colors.selected : "transparent" }]}
              >
                <Text style={[typography.label, { color: value === today ? colors.accent : colors.muted }]}>
                  {dateLabel(value, { weekday: "long" })}
                </Text>
                <Text style={[typography.title, { color: value === today ? colors.accent : colors.text }]}>
                  {dateLabel(value, { month: "short", day: "numeric" })}
                </Text>
              </Pressable>
              <Button icon="add" accessibilityLabel={`Add item on ${fullDayLabel(value)}`} onPress={() => onCreate(value)} />
            </View>
            {scheduled.length ? (
              <View style={styles.agendaItems}>
                {scheduled.map((page) => {
                  const due = parseDue(page.scheduledAt);
                  const done = states.get(page.stateId)?.family === "done";
                  const customColor = calendarColorStyle(page.calendarColor);
                  const when = due?.minutes === null
                    ? "All day"
                    : due
                      ? `${timeLabel(due.minutes)}${page.durationMinutes ? ` · ${page.durationMinutes}m` : ""}`
                      : "";
                  return (
                    <Pressable
                      key={page.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${titleOf(page)}, ${when}`}
                      onPress={() => onEvent(page.id)}
                      style={[styles.agendaEvent, { backgroundColor: customColor?.background ?? colors.surface, opacity: done ? 0.5 : 1 }]}
                    >
                      <View style={[styles.agendaMarker, { backgroundColor: done ? colors.faint : customColor?.foreground ?? colors.accent }]} />
                      <Text numberOfLines={1} style={[typography.body, styles.agendaEventTitle, { color: customColor?.foreground ?? colors.text, textDecorationLine: done ? "line-through" : "none" }]}>
                        {titleOf(page)}
                      </Text>
                      <Text style={[typography.caption, { color: colors.muted }]}>{when}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function MonthView({ day, pages, states, compact, onDay, onEvent, onCreate, onVisibleMonth }: {
  day: string;
  pages: Page[];
  states: Map<string, PageState>;
  compact: boolean;
  onDay(value: string): void;
  onEvent(id: string): void;
  onCreate(value: string): void;
  onVisibleMonth(value: string): void;
}) {
  const { colors } = useTheme();
  const list = useRef<FlatList<string>>(null);
  const [baseWeek] = useState(() => weekDays(day)[0] as string);
  const today = dayKey(new Date());
  const centre = 2600;
  const rowHeight = compact ? 82 : 116;
  const weeks = useMemo(
    () => Array.from({ length: centre * 2 + 1 }, (_, index) => addDays(baseWeek, (index - centre) * 7)),
    [baseWeek],
  );
  const weekIndex = useCallback((value: string) => {
    const start = new Date(`${baseWeek}T12:00:00`).getTime();
    const target = new Date(`${weekDays(value)[0]}T12:00:00`).getTime();
    return centre + Math.round((target - start) / (7 * 86_400_000));
  }, [baseWeek]);
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);
  const visibleItems = useCallback(({ viewableItems }: { viewableItems: { item: string }[] }) => {
    const visible = viewableItems[0]?.item;
    if (visible) onVisibleMonth(addDays(visible, 3).slice(0, 7));
  }, [onVisibleMonth]);

  useEffect(() => {
    const target = weekIndex(day);
    if (target >= 0 && target < weeks.length) list.current?.scrollToIndex({ index: target, animated: true });
  }, [day, weekIndex, weeks.length]);

  return (
    <View style={styles.monthScroll}>
      <View style={[styles.monthWeekdays, { borderBottomColor: colors.border }]}>
        {WEEKDAYS.map((label) => <Text key={label} style={[typography.label, styles.monthWeekday, { color: colors.faint }]}>{label}</Text>)}
      </View>
      <FlatList
        ref={list}
        data={weeks}
        initialScrollIndex={centre}
        keyExtractor={(value) => value}
        getItemLayout={(_data, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={11}
        showsVerticalScrollIndicator={false}
        style={styles.monthScroll}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={visibleItems}
        onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset({ offset: index * rowHeight, animated: false })}
        renderItem={({ item: week }) => (
          <View style={[styles.monthGrid, { height: rowHeight }]}>
            {weekDays(week).map((value) => {
              const items = pagesOnDay(pages, value);
              const all = [...items.allDay, ...items.timed];
              const startsMonth = value.endsWith("-01");
              return (
                <View key={value} style={[styles.monthCell, compact ? styles.monthCellCompact : null, { height: rowHeight, borderColor: colors.border, backgroundColor: value === day ? colors.selected : "transparent" }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${fullDayLabel(value)}, ${all.length} scheduled`} accessibilityState={{ selected: value === day }} onPress={() => onDay(value)} onLongPress={() => onCreate(value)} style={styles.monthDateButton}>
                    <Text style={[typography.caption, styles.monthDate, { color: value === today ? colors.accent : colors.text, fontWeight: value === today || startsMonth ? "700" : "400" }]}>
                      {startsMonth ? dateLabel(value, { month: "short", day: "numeric" }) : Number(value.slice(8, 10))}
                    </Text>
                  </Pressable>
                  {compact ? (
                    all.length ? <View style={styles.dots}>{all.slice(0, 3).map((page) => <View key={page.id} style={[styles.dot, { backgroundColor: states.get(page.stateId)?.family === "done" ? colors.faint : page.calendarColor ?? colors.accent }]} />)}</View> : null
                  ) : (
                    all.slice(0, 3).map((page) => {
                      const done = states.get(page.stateId)?.family === "done";
                      const customColor = calendarColorStyle(page.calendarColor);
                      return <Pressable key={page.id} accessibilityRole="button" accessibilityLabel={`Open ${titleOf(page)}`} onPress={() => onEvent(page.id)} style={[styles.monthEvent, { backgroundColor: customColor?.background ?? colors.accentSubtle, opacity: done ? 0.5 : 1 }]}><Text numberOfLines={1} style={[typography.caption, { color: customColor?.foreground ?? colors.text, textDecorationLine: done ? "line-through" : "none" }]}>{titleOf(page)}</Text></Pressable>;
                    })
                  )}
                  {all.length > 3 ? <Text style={[typography.caption, { color: colors.faint }]}>+{all.length - 3}</Text> : null}
                </View>
              );
            })}
          </View>
        )}
      />
    </View>
  );
}

function SheetFrame({ visible, reduceMotion, onClose, children }: { visible: boolean; reduceMotion: boolean; onClose(): void; children: ReactNode }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? "none" : wide ? "fade" : "slide"} onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[styles.scrim, { backgroundColor: wide ? "transparent" : colors.scrim }]} />
      {wide ? (
        <View pointerEvents="box-none" style={styles.sheetRail}>
          <View style={[styles.panel, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelScroll}>{children}</ScrollView>
          </View>
        </View>
      ) : (
        <SafeAreaView edges={["bottom"]} style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelScroll}>{children}</ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

function QuickScheduleSheet({ draft, reduceMotion, onClose, onCreate }: {
  draft: DraftSchedule;
  reduceMotion: boolean;
  onClose(): void;
  onCreate(title: string, schedule: DraftSchedule): Promise<void>;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState<DraftSchedule>(draft);
  const [busy, setBusy] = useState(false);

  const parsed = parseQuickSchedule(title, dateAtNoon(schedule.day));
  const hasClock = /\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:at\s+)?\d{1,2}:\d{2}\b/i.test(title);
  const hasDuration = /\bfor\s+(?:\d+\s*h(?:ours?)?)?\s*(?:\d+\s*m(?:in(?:ute)?s?)?)?/i.test(title);
  const effective = {
    day: parsed.day,
    minutes: hasClock ? parsed.minutes : schedule.minutes,
    durationMinutes: hasDuration ? parsed.durationMinutes : schedule.durationMinutes,
  };
  const submit = () => {
    if (busy) return;
    setBusy(true);
    void onCreate(parsed.title, effective).finally(() => setBusy(false));
  };
  return (
    <SheetFrame visible reduceMotion={reduceMotion} onClose={onClose}>
      <View style={styles.sheetBody}>
        <View style={styles.sheetTitleRow}>
          <Text style={[typography.title, { color: colors.text, flex: 1 }]}>New calendar item</Text>
          <Button icon="close" accessibilityLabel="Close" onPress={onClose} />
        </View>
        <TextInput autoFocus accessibilityLabel="Calendar item title" placeholder="Plan something…" placeholderTextColor={colors.faint} value={title} onChangeText={setTitle} onSubmitEditing={submit} returnKeyType="done" style={[styles.titleInput, typography.heading, { color: colors.text, borderBottomColor: colors.border }]} />
        <View style={styles.detailRow}>
          <Icon name="calendar-outline" size={16} color={colors.muted} />
          <Button icon="chevron-back" accessibilityLabel="Previous day" onPress={() => setSchedule({ ...schedule, day: addDays(schedule.day, -1) })} />
          <Text style={[typography.body, styles.quickDate, { color: colors.text }]}>{shortDayLabel(effective.day)}</Text>
          {effective.day !== dayKey(new Date()) ? <Button label="Today" onPress={() => setSchedule({ ...schedule, day: dayKey(new Date()) })} /> : null}
          <Button icon="chevron-forward" accessibilityLabel="Next day" onPress={() => setSchedule({ ...schedule, day: addDays(schedule.day, 1) })} />
        </View>
        <Text style={[typography.caption, { color: colors.muted }]}>{effective.minutes === null ? "All day" : `${timeLabel(effective.minutes)} · ${effective.durationMinutes}m`}</Text>
        <View style={styles.buttonWrap}>
          <Button label="All day" tone={schedule.minutes === null ? "accent" : "quiet"} onPress={() => setSchedule({ ...schedule, minutes: null })} />
          {[9, 12, 15, 18].map((hour) => <Button key={hour} label={timeLabel(hour * 60)} tone={schedule.minutes === hour * 60 ? "accent" : "quiet"} onPress={() => setSchedule({ ...schedule, minutes: hour * 60 })} />)}
        </View>
        {schedule.minutes !== null ? <View style={styles.buttonWrap}>{[15, 30, 45, 60, 90].map((duration) => <Button key={duration} label={`${duration}m`} tone={schedule.durationMinutes === duration ? "accent" : "quiet"} onPress={() => setSchedule({ ...schedule, durationMinutes: duration })} />)}</View> : null}
        <Button label={busy ? "Creating…" : "Create"} icon="add" tone="accent" disabled={busy} onPress={submit} />
      </View>
    </SheetFrame>
  );
}

function CalendarItemSheet({ page, state, states, reduceMotion, reminderMinutes, onClose, onMove, onReminder, onResize }: {
  page: Page;
  state: PageState | undefined;
  states: PageState[];
  reduceMotion: boolean;
  reminderMinutes: number | null;
  onClose(): void;
  onMove(page: Page, day: string, minutes: number | null): void;
  onReminder(value: number | null): Promise<void>;
  onResize(page: Page, durationMinutes: number): void;
}) {
  const { colors } = useTheme();
  const { run } = useApp();
  const commit = useUndo();
  const [title, setTitle] = useState(page.title);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const due = parseDue(page.scheduledAt);
  if (!due) return null;
  const saveTitle = () => {
    const next = title.trim() || "Untitled";
    if (next === page.title) return;
    void run((repository) => repository.updatePage(page.id, { title: next }));
  };
  const changeState = () => {
    const family = state?.family === "done" ? "open" : "done";
    const target = states.find((item) => item.family === family && item.isDefault) ?? states.find((item) => item.family === family);
    if (!target) return;
    const previous = page.stateId;
    void commit({ label: family === "done" ? "Marked complete" : "Reopened", action: () => run((repository) => repository.updatePage(page.id, { stateId: target.id })), undo: () => run((repository) => repository.updatePage(page.id, { stateId: previous })) });
  };
  const changeColor = (calendarColor: string | null) => {
    const previous = page.calendarColor;
    if (calendarColor === previous) return;
    void commit({
      label: "Calendar color changed",
      action: () => run((repository) => repository.updatePage(page.id, { calendarColor })),
      undo: () => run((repository) => repository.updatePage(page.id, { calendarColor: previous })),
    });
  };
  const clear = () => {
    const previous = { scheduledAt: page.scheduledAt, durationMinutes: page.durationMinutes };
    void commit({ label: "Removed from calendar", action: () => run((repository) => repository.updatePage(page.id, { scheduledAt: null, durationMinutes: null })), undo: () => run((repository) => repository.updatePage(page.id, previous)) });
    onClose();
  };
  const repeat = async (frequency: RecurrenceFrequency, count: number) => {
    if (seriesBusy) return;
    setSeriesBusy(true);
    try {
      await run(async (repository) => {
        for (const nextDay of recurrenceDays(due.day, frequency, count)) {
          const id = await repository.createPage({
            title: titleOf(page),
            parentId: page.parentId,
            stateId: page.stateId,
          });
          await repository.updatePage(id, {
            icon: page.icon,
            priority: page.priority,
            scheduledAt: formatDue(nextDay, due.minutes),
            durationMinutes: page.durationMinutes,
            description: page.description,
          });
        }
      });
    } finally {
      setSeriesBusy(false);
    }
  };
  return (
    <SheetFrame visible reduceMotion={reduceMotion} onClose={onClose}>
      <View style={styles.sheetBody}>
        <View style={styles.sheetTitleRow}>
          <Text style={[typography.caption, { color: colors.muted, flex: 1 }]}>{state?.title ?? "Calendar item"}</Text>
          <Button icon="close" accessibilityLabel="Close" onPress={onClose} />
        </View>
        <TextInput accessibilityLabel="Calendar item title" value={title} onChangeText={setTitle} onBlur={saveTitle} onSubmitEditing={saveTitle} style={[styles.titleInput, typography.heading, { color: colors.text, borderBottomColor: colors.border }]} />
        <View style={styles.detailRow}><Icon name="calendar-outline" size={16} color={colors.muted} /><Text style={[typography.body, { color: colors.text, flex: 1 }]}>{fullDayLabel(due.day)}</Text><Button icon="chevron-back" accessibilityLabel="Move one day earlier" onPress={() => onMove(page, addDays(due.day, -1), due.minutes)} /><Button icon="chevron-forward" accessibilityLabel="Move one day later" onPress={() => onMove(page, addDays(due.day, 1), due.minutes)} /></View>
        <View style={styles.detailRow}><Icon name="time-outline" size={16} color={colors.muted} /><Text style={[typography.body, { color: colors.text, flex: 1 }]}>{due.minutes === null ? "All day" : timeLabel(due.minutes)}</Text>{due.minutes === null ? <Button label="Add time" onPress={() => onMove(page, due.day, 9 * 60)} /> : <><Button label="−15m" onPress={() => onMove(page, due.day, snapMinutes(due.minutes as number - 15))} /><Button label="+15m" onPress={() => onMove(page, due.day, snapMinutes(due.minutes as number + 15))} /><Button label="All day" onPress={() => onMove(page, due.day, null)} /></>}</View>
        {due.minutes !== null ? <View style={styles.detailRow}><Icon name="hourglass-outline" size={16} color={colors.muted} /><Text style={[typography.body, { color: colors.text, flex: 1 }]}>Duration</Text>{[15, 30, 60, 90].map((duration) => <Button key={duration} label={`${duration}m`} tone={page.durationMinutes === duration ? "accent" : "quiet"} onPress={() => onResize(page, duration)} />)}</View> : null}
        <View style={styles.section}>
          <Text style={[typography.label, { color: colors.faint }]}>Color</Text>
          <View accessibilityRole="radiogroup" style={styles.colorChoices}>
            <Pressable accessibilityRole="radio" accessibilityLabel="Default color" accessibilityState={{ checked: page.calendarColor === null }} onPress={() => changeColor(null)} style={[styles.colorChoice, { borderColor: page.calendarColor === null ? colors.text : colors.border }]}>
              <View style={[styles.colorSwatch, { backgroundColor: colors.accentSubtle }]} />
            </Pressable>
            {CALENDAR_COLORS.map((choice) => (
              <Pressable key={choice.id} accessibilityRole="radio" accessibilityLabel={choice.name} accessibilityState={{ checked: page.calendarColor === choice.hex }} onPress={() => changeColor(choice.hex)} style={[styles.colorChoice, { borderColor: page.calendarColor === choice.hex ? colors.text : "transparent" }]}>
                <View style={[styles.colorSwatch, { backgroundColor: choice.hex }]} />
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={[typography.label, { color: colors.faint }]}>Reminder · this device</Text>
          <View style={styles.buttonWrap}>
            {[0, 5, 15, 30, 60].map((value) => (
              <Button
                key={value}
                label={value === 0 ? "At start" : value === 60 ? "1h before" : `${value}m before`}
                tone={reminderMinutes === value ? "accent" : "quiet"}
                onPress={() => {
                  setReminderError(null);
                  void onReminder(value).catch((cause) => setReminderError(cause instanceof Error ? cause.message : "Could not set reminder"));
                }}
              />
            ))}
            {reminderMinutes !== null ? <Button label="None" onPress={() => void onReminder(null)} /> : null}
          </View>
          {reminderError ? <Text accessibilityLiveRegion="assertive" style={[typography.caption, { color: colors.danger }]}>{reminderError}</Text> : null}
        </View>
        <View style={styles.section}>
          <Text style={[typography.label, { color: colors.faint }]}>Create an editable series</Text>
          <View style={styles.buttonWrap}>
            <Button label={seriesBusy ? "Creating…" : "Daily · 7"} disabled={seriesBusy} onPress={() => void repeat("daily", 7)} />
            <Button label="Weekly · 4" disabled={seriesBusy} onPress={() => void repeat("weekly", 4)} />
            <Button label="Monthly · 6" disabled={seriesBusy} onPress={() => void repeat("monthly", 6)} />
            <Button label="Yearly · 3" disabled={seriesBusy} onPress={() => void repeat("yearly", 3)} />
          </View>
        </View>
        <View style={styles.sheetActions}><Button label={state?.family === "done" ? "Reopen" : "Complete"} icon={state?.family === "done" ? "refresh-outline" : "checkmark"} onPress={changeState} /><Button label="Open page" icon="document-text-outline" onPress={() => { onClose(); router.push(`/pages/${page.id}`); }} /><Button label="Remove" icon="trash-outline" tone="danger" onPress={clear} /></View>
      </View>
    </SheetFrame>
  );
}

function FilterSheet({ visible, states, stateIds, priorities, pages, scopeId, showCompleted, reduceMotion, fileError, fileBusy, onCompleted, onExport, onImport, onPriorities, onScope, onStateIds, onClose }: {
  visible: boolean;
  states: PageState[];
  stateIds: Set<string>;
  priorities: Set<PagePriority>;
  pages: Page[];
  scopeId: string | null;
  showCompleted: boolean;
  reduceMotion: boolean;
  fileError: string | null;
  fileBusy: "import" | "export" | null;
  onCompleted(value: boolean): void;
  onExport(): void;
  onImport(): void;
  onPriorities(value: Set<PagePriority>): void;
  onScope(value: string | null): void;
  onStateIds(value: Set<string>): void;
  onClose(): void;
}) {
  const { colors } = useTheme();
  const toggle = (id: string) => {
    const next = new Set(stateIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onStateIds(next);
  };
  const togglePriority = (priority: PagePriority) => {
    const next = new Set(priorities);
    if (next.has(priority)) next.delete(priority); else next.add(priority);
    onPriorities(next);
  };
  return (
    <SheetFrame visible={visible} reduceMotion={reduceMotion} onClose={onClose}>
      <View style={styles.sheetBody}>
        <View style={styles.sheetTitleRow}><Text style={[typography.title, { color: colors.text, flex: 1 }]}>Calendar filters</Text><Button icon="close" accessibilityLabel="Close" onPress={onClose} /></View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: showCompleted }} onPress={() => onCompleted(!showCompleted)} style={styles.filterRow}><Icon name={showCompleted ? "checkbox" : "square-outline"} color={showCompleted ? colors.accent : colors.faint} /><Text style={[typography.body, { color: colors.text }]}>Show completed</Text></Pressable>
        <Text style={[typography.label, { color: colors.faint }]}>States · none selected shows all</Text>
        {states.map((state) => <Pressable key={state.id} accessibilityRole="checkbox" accessibilityState={{ checked: stateIds.has(state.id) }} onPress={() => toggle(state.id)} style={styles.filterRow}><Icon name={stateIds.has(state.id) ? "checkbox" : "square-outline"} color={stateIds.has(state.id) ? colors.accent : colors.faint} /><Text style={[typography.body, { color: colors.text }]}>{state.title}</Text></Pressable>)}
        {stateIds.size ? <Button label="Clear state filters" onPress={() => onStateIds(new Set())} /> : null}
        <Text style={[typography.label, { color: colors.faint }]}>Priority · none selected shows all</Text>
        <View style={styles.buttonWrap}>
          {([['do', 'Focus'], ['schedule', 'Plan'], ['delegate', 'Delegate'], ['eliminate', 'Drop']] as const).map(([priority, label]) => (
            <Button key={priority} label={label} tone={priorities.has(priority) ? "accent" : "quiet"} onPress={() => togglePriority(priority)} />
          ))}
        </View>
        {pages.length ? <><Text style={[typography.label, { color: colors.faint }]}>Page branch</Text><View style={styles.buttonWrap}><Button label="Everywhere" tone={scopeId === null ? "accent" : "quiet"} onPress={() => onScope(null)} />{pages.slice(0, 12).map((page) => <Button key={page.id} label={titleOf(page)} tone={scopeId === page.id ? "accent" : "quiet"} onPress={() => onScope(page.id)} />)}</View></> : null}
        <Text style={[typography.label, { color: colors.faint }]}>Calendar files</Text>
        <View style={styles.buttonWrap}>
          <Button label={fileBusy === "import" ? "Importing…" : "Import .ics"} icon="download-outline" disabled={fileBusy !== null} onPress={onImport} />
          <Button label={fileBusy === "export" ? "Exporting…" : "Export .ics"} icon="share-outline" disabled={fileBusy !== null} onPress={onExport} />
        </View>
        {fileError ? <Text accessibilityLiveRegion="assertive" style={[typography.caption, { color: colors.danger }]}>{fileError}</Text> : null}
      </View>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.md },
  toolbar: { minHeight: controls.comfortable, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  toolbarTitle: { flex: 1, minWidth: 0, alignItems: "center" },
  title: { fontSize: 20, lineHeight: 26, textAlign: "center" },
  todayButton: { minHeight: 24, minWidth: 44, alignItems: "center", justifyContent: "center" },
  timelineShell: { flex: 1, minHeight: 420, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, overflow: "hidden" },
  mobileDayStrip: { minHeight: 50, flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  mobileDay: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: spacing.xxs },
  timelineHeader: { minHeight: 48, flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  timelineGutter: { width: TIME_GUTTER, flexShrink: 0, boxSizing: "border-box", borderRightWidth: StyleSheet.hairlineWidth },
  timelineDayHead: { minHeight: 48, boxSizing: "border-box", alignItems: "center", justifyContent: "center", gap: spacing.xxs },
  allDay: { minHeight: 46, flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  allDayLabel: { width: TIME_GUTTER, flexShrink: 0, boxSizing: "border-box", paddingTop: spacing.sm, paddingRight: spacing.xs, textAlign: "right" },
  allDayColumn: { minHeight: 46, boxSizing: "border-box", padding: spacing.xxs, borderLeftWidth: StyleSheet.hairlineWidth, gap: spacing.xxs },
  allDayEvent: { minHeight: 20, paddingHorizontal: spacing.xs, borderRadius: radii.xs, justifyContent: "center" },
  timelineScroll: { flex: 1 },
  hourLine: { position: "absolute", left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  hourLabel: { position: "absolute", width: TIME_GUTTER - spacing.xs, top: -8, textAlign: "right" },
  dayDivider: { position: "absolute", top: 0, height: HOUR_HEIGHT * 24, borderLeftWidth: StyleSheet.hairlineWidth },
  hourSlot: { position: "absolute" },
  timedEvent: { position: "absolute", borderLeftWidth: 2, borderRadius: radii.sm, overflow: "hidden" },
  eventPress: { flex: 1, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  eventTitle: { fontWeight: "600" },
  resizeHandle: { position: "absolute", left: 8, right: 8, bottom: 0, height: 12, alignItems: "center", justifyContent: "flex-end" },
  resizeGrip: { width: "100%", height: 3, marginBottom: 1, borderRadius: 2, opacity: 0.65 },
  nowLine: { position: "absolute", height: 1, zIndex: 5 },
  nowDot: { position: "absolute", left: -3, top: -3, width: 7, height: 7, borderRadius: 4 },
  agendaScroll: { flex: 1 },
  agendaContent: { paddingBottom: spacing.lg },
  agendaSection: { paddingVertical: spacing.sm, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  agendaHeader: { minHeight: controls.comfortable, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  agendaDate: { flex: 1, minHeight: controls.comfortable, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.sm },
  agendaItems: { gap: spacing.xs },
  agendaEvent: { minHeight: controls.comfortable, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radii.sm },
  agendaMarker: { width: 3, height: 24, borderRadius: 2 },
  agendaEventTitle: { flex: 1 },
  monthScroll: { flex: 1 },
  monthWeekdays: { flexDirection: "row" },
  monthWeekday: { width: `${100 / 7}%`, minHeight: 28, textAlign: "center", textTransform: "uppercase" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  monthCell: { width: `${100 / 7}%`, minHeight: 112, padding: spacing.xxs, borderWidth: StyleSheet.hairlineWidth, gap: spacing.xxs },
  monthCellCompact: { minHeight: 68, alignItems: "center" },
  monthDateButton: { width: "100%", minHeight: controls.comfortable, alignItems: "center", justifyContent: "center" },
  monthDate: { textAlign: "center" },
  monthEvent: { minHeight: 22, paddingHorizontal: spacing.xs, borderRadius: radii.xs, justifyContent: "center" },
  dots: { minHeight: 12, flexDirection: "row", alignItems: "center", gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  scrim: { position: "absolute", inset: 0 },
  sheetRail: { flex: 1, alignItems: "flex-end" },
  panel: { width: 460, maxWidth: "100%", height: "100%", borderLeftWidth: StyleSheet.hairlineWidth },
  panelScroll: { flexGrow: 1 },
  sheet: { marginTop: "auto", maxHeight: "88%", borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, overflow: "hidden" },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  sheetTitleRow: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  titleInput: { minHeight: 48, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  detailRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  quickDate: { flex: 1, textAlign: "center" },
  buttonWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  section: { gap: spacing.sm },
  colorChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  colorChoice: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderWidth: 2, borderRadius: 17 },
  colorSwatch: { width: 24, height: 24, borderRadius: 12 },
  sheetActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingTop: spacing.sm },
  filterRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
