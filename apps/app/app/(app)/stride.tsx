import {
  DEFAULT_DURATION_MINUTES,
  addDays,
  dayKey,
  formatClock,
  formatDue,
  parseDue,
} from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
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

type ViewMode = "day" | "week";

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
          <Segment values={["day", "week"] as const} value={mode} onChange={setMode} />
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
        ) : (
          <WeekGrid
            days={weekDays}
            today={today}
            tasks={snapshot.tasks}
            onPrevious={() => setDay((current) => addDays(current, -7))}
            onNext={() => setDay((current) => addDays(current, 7))}
            onToday={() => setDay(today)}
            onOpenDay={(target) => {
              setDay(target);
              setMode("day");
            }}
            onToggleTask={toggleTask}
          />
        )}
      </View>
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

function WeekGrid({
  days,
  today,
  tasks,
  onPrevious,
  onNext,
  onToday,
  onOpenDay,
  onToggleTask,
}: {
  days: string[];
  today: string;
  tasks: { id: string; content: string; completed: boolean; dueDate: string | null }[];
  onPrevious(): void;
  onNext(): void;
  onToday(): void;
  onOpenDay(day: string): void;
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${dayLabel(day)}`}
                onPress={() => onOpenDay(day)}
                style={({ pressed }) => [styles.dayCardHead, { opacity: pressed ? 0.55 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[typography.label, { color: isToday ? colors.accent : colors.text }]}>
                    {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                    })}
                  </Text>
                  <Text style={[typography.heading, styles.dayNumber, { color: colors.text }]}>
                    {new Date(`${day}T12:00:00`).getDate()}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {dayTasks.length || "—"}
                </Text>
              </Pressable>

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
