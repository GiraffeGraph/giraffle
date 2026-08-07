import {
  DEFAULT_DURATION_MINUTES,
  addDays,
  dayKey,
  formatClock,
  formatDue,
  parseDue,
  type Task,
} from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { TaskViewSwitch } from "@/components/shell/TaskViewSwitch";
import { DayGrid } from "@/components/stride/DayGrid";
import { Button, DividerRow, Icon, Segment } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

type ViewMode = "day" | "week" | "month";

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function startOfWeek(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  return addDays(day, -mondayOffset);
}

function addMonths(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return dayKey(date);
}

function monthCells(day: string): string[] {
  const first = `${day.slice(0, 7)}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function monthLabel(day: string): string {
  return new Date(`${day.slice(0, 7)}-01T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function weekRangeLabel(days: string[]): string {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return "";
  const start = new Date(`${first}T12:00:00`);
  const end = new Date(`${last}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const right = end.toLocaleDateString(undefined, {
    ...(sameMonth ? {} : { month: "short" as const }),
    day: "numeric",
    year: start.getFullYear() === end.getFullYear() ? undefined : "numeric",
  });
  return `${left} – ${right}`;
}

export default function Stride() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const [mode, setMode] = useState<ViewMode>("day");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [composeAt, setComposeAt] = useState<number | null>(null);
  const [previewDay, setPreviewDay] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const today = dayKey(new Date());

  const weekDays = useMemo(() => {
    const first = startOfWeek(day);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }, [day]);

  const openSource = useCallback(
    (taskId: string) => {
      const task = snapshot.tasks.find((item) => item.id === taskId);
      if (!task) return;
      if (task.boardId) router.push(`/trek/${task.boardId}`);
      else router.push(`/notes/${task.pageId}`);
    },
    [snapshot.tasks],
  );

  const toggleTask = useCallback(
    (taskId: string) => {
      const task = snapshot.tasks.find((item) => item.id === taskId);
      if (!task) return;
      void run((repository) =>
        repository.updateTask(taskId, { completed: !task.completed }),
      ).catch(() => undefined);
    },
    [run, snapshot.tasks],
  );

  const scheduleAt = useCallback(
    (taskId: string, targetDay: string, minutes: number | null) => {
      const task = snapshot.tasks.find((item) => item.id === taskId);
      void run((repository) =>
        repository.updateTask(taskId, {
          dueDate: formatDue(targetDay, minutes),
          durationMinutes: task?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        }),
      ).catch(() => undefined);
    },
    [run, snapshot.tasks],
  );

  return (
    <>
      <ScreenTopbar title="Tasks" aside={<TaskViewSwitch />} />
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.controls}>
          <Segment values={["day", "week", "month"] as const} value={mode} onChange={setMode} />
        </View>

        {mode === "day" ? (
          <>
            <View style={styles.dayBar}>
              <Button
                icon="chevron-back"
                accessibilityLabel="Previous day"
                onPress={() => setDay((current) => addDays(current, -1))}
              />
              <Text style={[typography.title, { color: colors.text, flex: 1 }]}>
                {dayLabel(day)}
              </Text>
              {day === today ? null : (
                <Button label="Today" onPress={() => setDay(today)} />
              )}
              <Button
                icon="chevron-forward"
                accessibilityLabel="Next day"
                onPress={() => setDay((current) => addDays(current, 1))}
              />
            </View>
            <DayGrid
              day={day}
              tasks={snapshot.tasks}
              onOpenTask={openSource}
              onToggleTask={toggleTask}
              onMoveTask={(taskId, minutes) => scheduleAt(taskId, day, minutes)}
              onResizeTask={(taskId, duration) =>
                void run((repository) =>
                  repository.updateTask(taskId, { durationMinutes: duration }),
                ).catch(() => undefined)
              }
              onPickSlot={(minutes) => {
                setComposeAt(minutes);
                setDraft("");
              }}
            />
          </>
        ) : mode === "week" ? (
          <WeekGrid
            days={weekDays}
            today={today}
            tasks={snapshot.tasks}
            onPrevious={() => setDay((current) => addDays(current, -7))}
            onNext={() => setDay((current) => addDays(current, 7))}
            onToday={() => setDay(today)}
            onPreviewDay={setPreviewDay}
            onOpenDay={(target) => {
              setDay(target);
              setMode("day");
            }}
            onToggleTask={toggleTask}
          />
        ) : (
          <MonthGrid
            day={day}
            today={today}
            tasks={snapshot.tasks}
            onPrevious={() => setDay((current) => addMonths(current, -1))}
            onNext={() => setDay((current) => addMonths(current, 1))}
            onToday={() => setDay(today)}
            onPreviewDay={setPreviewDay}
            onOpenDay={(target) => {
              setDay(target);
              setMode("day");
            }}
          />
        )}
      </View>
      <DayPreview
        day={previewDay}
        tasks={snapshot.tasks}
        onClose={() => setPreviewDay(null)}
        onOpen={(target) => {
          setPreviewDay(null);
          setDay(target);
          setMode("day");
        }}
      />
      <ScheduleTaskSheet
        minutes={composeAt}
        tasks={snapshot.tasks.filter((task) => !task.dueDate && !task.completed)}
        draft={draft}
        onChangeDraft={setDraft}
        onClose={() => {
          setComposeAt(null);
          setDraft("");
        }}
        onChoose={(taskId) => {
          if (composeAt === null) return;
          scheduleAt(taskId, day, composeAt);
          setComposeAt(null);
          setDraft("");
        }}
        onCreate={() => {
          const content = draft.trim();
          if (!content || composeAt === null) return;
          void run((repository) =>
            repository.createScheduledTask({
              content,
              dueDate: formatDue(day, composeAt),
              durationMinutes: DEFAULT_DURATION_MINUTES,
            }),
          ).catch(() => undefined);
          setComposeAt(null);
          setDraft("");
        }}
      />
    </>
  );
}

function ScheduleTaskSheet({
  minutes,
  tasks,
  draft,
  onChangeDraft,
  onClose,
  onChoose,
  onCreate,
}: {
  minutes: number | null;
  tasks: { id: string; content: string; sourceLabel: string }[];
  draft: string;
  onChangeDraft(value: string): void;
  onClose(): void;
  onChoose(taskId: string): void;
  onCreate(): void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={minutes !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalRoot}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close task picker"
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
        >
          <View style={styles.sheetHeading}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.title, { color: colors.text }]}>Schedule a task</Text>
              <Text style={[typography.caption, { color: colors.accent }]}>
                {minutes === null ? "" : formatClock(minutes)} · 30 minutes
              </Text>
            </View>
            <Button icon="close" accessibilityLabel="Close" onPress={onClose} />
          </View>

          <View
            style={[
              styles.newTask,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <TextInput
              value={draft}
              onChangeText={onChangeDraft}
              onSubmitEditing={onCreate}
              placeholder="Create a new task"
              placeholderTextColor={colors.faint}
              returnKeyType="done"
              style={[styles.newTaskInput, typography.body, { color: colors.text }]}
            />
            <Button
              label="Add"
              icon="add"
              tone="accent"
              disabled={!draft.trim()}
              onPress={onCreate}
            />
          </View>

          <Text style={[typography.label, { color: colors.muted }]}>Or schedule an existing task</Text>
          {tasks.length ? (
            <ScrollView style={styles.taskPicker} keyboardShouldPersistTaps="handled">
              {tasks.map((task) => (
                <DividerRow key={task.id} onPress={() => onChoose(task.id)}>
                  <Icon name="ellipse-outline" size={17} color={colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
                      {task.content}
                    </Text>
                    <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
                      {task.sourceLabel}
                    </Text>
                  </View>
                  <Icon name="calendar-outline" size={17} color={colors.accent} />
                </DividerRow>
              ))}
            </ScrollView>
          ) : (
            <Text style={[typography.body, { color: colors.secondary }]}>
              No unscheduled tasks. Create one above.
            </Text>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DayPreview({
  day,
  tasks,
  onClose,
  onOpen,
}: {
  day: string | null;
  tasks: Task[];
  onClose(): void;
  onOpen(day: string): void;
}) {
  const { colors } = useTheme();
  const [scale] = useState(() => new Animated.Value(0.92));
  const [opacity] = useState(() => new Animated.Value(0));
  const dayTasks = day
    ? tasks.filter((task) => parseDue(task.dueDate)?.day === day)
    : [];

  useEffect(() => {
    if (!day) return;
    scale.setValue(0.92);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        stiffness: 260,
        damping: 22,
        mass: 0.72,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [day, opacity, scale]);

  return (
    <Modal visible={day !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close day preview"
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        <AnimatedSafeAreaView
          style={[
            styles.previewCard,
            {
              backgroundColor: colors.surfaceStrong,
              borderColor: colors.border,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={styles.previewHeading}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={[typography.heading, { color: colors.text }]}>
                {day
                  ? new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : ""}
              </Text>
              <Text style={[typography.caption, { color: colors.muted }]}>
                {dayTasks.length} {dayTasks.length === 1 ? "task" : "tasks"}
              </Text>
            </View>
            <Button icon="close" accessibilityLabel="Close preview" onPress={onClose} />
          </View>

          <ScrollView style={styles.previewTasks} showsVerticalScrollIndicator={false}>
            {dayTasks.length ? (
              dayTasks.map((task) => {
                const due = parseDue(task.dueDate);
                return (
                  <DividerRow key={task.id}>
                    <Icon
                      name={task.completed ? "checkmark-circle" : "ellipse-outline"}
                      size={17}
                      color={task.completed ? colors.accent : colors.muted}
                    />
                    <Text
                      numberOfLines={2}
                      style={[
                        typography.body,
                        {
                          color: task.completed ? colors.muted : colors.text,
                          flex: 1,
                          textDecorationLine: task.completed ? "line-through" : "none",
                        },
                      ]}
                    >
                      {task.content}
                    </Text>
                    <Text style={[typography.caption, { color: colors.muted }]}>
                      {due?.minutes === null || due?.minutes === undefined
                        ? "All day"
                        : formatClock(due.minutes)}
                    </Text>
                  </DividerRow>
                );
              })
            ) : (
              <View style={styles.previewEmpty}>
                <Icon name="calendar-clear-outline" size={22} color={colors.faint} />
                <Text style={[typography.body, { color: colors.muted }]}>No tasks</Text>
              </View>
            )}
          </ScrollView>

          <Button
            label="Open day"
            icon="arrow-forward"
            tone="accent"
            onPress={() => {
              if (day) onOpen(day);
            }}
          />
        </AnimatedSafeAreaView>
      </View>
    </Modal>
  );
}

function DayCardHeader({
  day,
  taskCount,
  today,
  onOpen,
  onPreview,
}: {
  day: string;
  taskCount: number;
  today: boolean;
  onOpen(): void;
  onPreview(): void;
}) {
  const { colors } = useTheme();
  const held = useRef(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${dayLabel(day)}`}
      accessibilityHint="Press and hold to preview"
      delayLongPress={240}
      onLongPress={() => {
        held.current = true;
        onPreview();
      }}
      onPress={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onOpen();
      }}
      onPressOut={() => {
        setTimeout(() => {
          held.current = false;
        }, 0);
      }}
      style={({ pressed }) => [
        styles.dayCardHead,
        { opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typography.label, { color: today ? colors.accent : colors.text }]}>
          {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
        </Text>
        <Text style={[typography.heading, styles.dayNumber, { color: colors.text }]}>
          {new Date(`${day}T12:00:00`).getDate()}
        </Text>
      </View>
      <Text style={[typography.caption, { color: colors.muted }]}>{taskCount || "—"}</Text>
    </Pressable>
  );
}

function WeekGrid({
  days,
  today,
  tasks,
  onPrevious,
  onNext,
  onToday,
  onOpenDay,
  onPreviewDay,
  onToggleTask,
}: {
  days: string[];
  today: string;
  tasks: { id: string; content: string; completed: boolean; dueDate: string | null }[];
  onPrevious(): void;
  onNext(): void;
  onToday(): void;
  onOpenDay(day: string): void;
  onPreviewDay(day: string): void;
  onToggleTask(taskId: string): void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = width >= 1000 ? ("31%" as const) : ("48%" as const);

  return (
    <View style={styles.week}>
      <View style={styles.weekToolbar}>
        <Button icon="chevron-back" accessibilityLabel="Previous week" onPress={onPrevious} />
        <Text style={[typography.title, { color: colors.text, flex: 1 }]}>
          {weekRangeLabel(days)}
        </Text>
        {days.includes(today) ? null : <Button label="Today" onPress={onToday} />}
        <Button icon="chevron-forward" accessibilityLabel="Next week" onPress={onNext} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.weekGrid}>
        {days.map((day) => {
          const dayTasks = tasks.filter((task) => parseDue(task.dueDate)?.day === day);
          const visible = dayTasks.slice(0, 3);
          const isToday = day === today;

          return (
            <View
              key={day}
              style={[
                styles.dayCard,
                {
                  width: cardWidth,
                  borderColor: isToday ? colors.accent : colors.border,
                  backgroundColor: isToday ? colors.accentSubtle : colors.surface,
                },
              ]}
            >
              <DayCardHeader
                day={day}
                taskCount={dayTasks.length}
                today={isToday}
                onOpen={() => onOpenDay(day)}
                onPreview={() => onPreviewDay(day)}
              />

              <View style={styles.dayTasks}>
                {visible.map((task) => (
                  <Pressable
                    key={task.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: task.completed }}
                    onPress={() => onToggleTask(task.id)}
                    style={({ pressed }) => [styles.cardTask, { opacity: pressed ? 0.55 : 1 }]}
                  >
                    <Icon
                      name={task.completed ? "checkmark-circle" : "ellipse-outline"}
                      size={15}
                      color={task.completed ? colors.accent : colors.muted}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.caption,
                        {
                          color: task.completed ? colors.muted : colors.text,
                          flex: 1,
                          textDecorationLine: task.completed ? "line-through" : "none",
                        },
                      ]}
                    >
                      {task.content}
                    </Text>
                  </Pressable>
                ))}
                {dayTasks.length > visible.length ? (
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    +{dayTasks.length - visible.length}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function MonthGrid({
  day,
  today,
  tasks,
  onPrevious,
  onNext,
  onToday,
  onOpenDay,
  onPreviewDay,
}: {
  day: string;
  today: string;
  tasks: Task[];
  onPrevious(): void;
  onNext(): void;
  onToday(): void;
  onOpenDay(day: string): void;
  onPreviewDay(day: string): void;
}) {
  const { colors } = useTheme();
  const days = useMemo(() => monthCells(day), [day]);
  const month = day.slice(0, 7);
  const currentMonth = today.slice(0, 7) === month;

  return (
    <View style={styles.month}>
      <View style={styles.weekToolbar}>
        <Button icon="chevron-back" accessibilityLabel="Previous month" onPress={onPrevious} />
        <Text style={[typography.title, { color: colors.text, flex: 1 }]}>
          {monthLabel(day)}
        </Text>
        {currentMonth ? null : <Button label="Today" onPress={onToday} />}
        <Button icon="chevron-forward" accessibilityLabel="Next month" onPress={onNext} />
      </View>

      <View style={[styles.monthCalendar, { borderColor: colors.border }]}>
        <View style={styles.monthWeekdays}>
          {WEEKDAY_LABELS.map((label) => (
            <Text
              key={label}
              style={[typography.caption, styles.monthWeekday, { color: colors.muted }]}
            >
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.monthCells}>
          {days.map((cellDay) => (
            <MonthCell
              key={cellDay}
              day={cellDay}
              taskCount={tasks.filter((task) => parseDue(task.dueDate)?.day === cellDay).length}
              outside={cellDay.slice(0, 7) !== month}
              selected={cellDay === day}
              today={cellDay === today}
              onOpen={() => onOpenDay(cellDay)}
              onPreview={() => onPreviewDay(cellDay)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function MonthCell({
  day,
  taskCount,
  outside,
  selected,
  today,
  onOpen,
  onPreview,
}: {
  day: string;
  taskCount: number;
  outside: boolean;
  selected: boolean;
  today: boolean;
  onOpen(): void;
  onPreview(): void;
}) {
  const { colors } = useTheme();
  const held = useRef(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${dayLabel(day)}`}
      accessibilityHint="Press and hold to preview"
      delayLongPress={240}
      onLongPress={() => {
        held.current = true;
        onPreview();
      }}
      onPress={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onOpen();
      }}
      onPressOut={() => {
        setTimeout(() => {
          held.current = false;
        }, 0);
      }}
      style={({ pressed }) => [
        styles.monthCell,
        {
          opacity: outside ? 0.38 : 1,
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: today ? colors.accentSubtle : pressed ? colors.hover : "transparent",
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Text style={[typography.label, { color: today ? colors.accent : colors.text }]}>
        {new Date(`${day}T12:00:00`).getDate()}
      </Text>
      {taskCount ? (
        <View style={styles.monthTaskCount}>
          {Array.from({ length: Math.min(taskCount, 3) }, (_, index) => (
            <View key={index} style={[styles.monthDot, { backgroundColor: colors.accent }]} />
          ))}
          {taskCount > 3 ? (
            <Text style={[typography.caption, { color: colors.muted }]}>+{taskCount - 3}</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: 72 },
  controls: { paddingVertical: spacing.md },
  dayBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: 6 },
  week: { flex: 1 },
  weekToolbar: {
    minHeight: 44,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  weekGrid: {
    paddingBottom: 96,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  dayCard: {
    minHeight: 148,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  dayCardHead: { flexDirection: "row", alignItems: "flex-start" },
  dayNumber: { marginTop: 2 },
  dayTasks: { gap: spacing.xs },
  cardTask: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  month: { flex: 1 },
  monthCalendar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  monthWeekdays: { flexDirection: "row" },
  monthWeekday: { width: "14.285%", paddingVertical: spacing.sm, textAlign: "center" },
  monthCells: { flexDirection: "row", flexWrap: "wrap" },
  monthCell: {
    width: "14.285%",
    minHeight: 64,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  monthTaskCount: { flexDirection: "row", alignItems: "center", gap: 3 },
  monthDot: { width: 5, height: 5, borderRadius: 3 },
  previewRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  previewCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "72%",
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sheet,
    gap: spacing.md,
  },
  previewHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  previewTasks: { maxHeight: 360 },
  previewEmpty: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "72%",
    alignSelf: "center",
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    gap: spacing.md,
  },
  sheetHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  newTask: {
    minHeight: 48,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  newTaskInput: { flex: 1, minHeight: 44 },
  taskPicker: { maxHeight: 320 },
});
