import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { TaskViewSwitch } from "@/components/shell/TaskViewSwitch";
import { DayGrid } from "@/components/stride/DayGrid";
import { Button, DividerRow, EmptyState, Icon, Segment } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import {
  DEFAULT_DURATION_MINUTES,
  addDays,
  dayKey,
  formatClock,
  formatDue,
  parseDue,
} from "@/domain/stride/schedule";
import { useApp } from "@/state/AppProvider";

type ViewMode = "day" | "week";
type Filter = "active" | "all" | "done";

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function Stride() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const [mode, setMode] = useState<ViewMode>("day");
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [composeAt, setComposeAt] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const today = dayKey(new Date());
  const resolveMinutes = useRef<((absoluteY: number) => number | null) | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(today, index)),
    [today],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const backlog = snapshot.tasks.filter(
    (task) =>
      !task.dueDate &&
      (filter === "all" || (filter === "done" ? task.completed : !task.completed)) &&
      task.content.toLocaleLowerCase().includes(normalizedQuery),
  );

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
              onDropRegister={(resolve) => {
                resolveMinutes.current = resolve;
              }}
            />
            {composeAt === null ? null : (
              <View style={[styles.composer, { borderTopColor: colors.border }]}>
                <Text style={[typography.label, { color: colors.accent }]}>
                  {formatClock(composeAt)}
                </Text>
                <TextInput
                  autoFocus
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={() => {
                    const content = draft.trim();
                    if (content) {
                      void run((repository) =>
                        repository.createScheduledTask({
                          content,
                          dueDate: formatDue(day, composeAt),
                          durationMinutes: DEFAULT_DURATION_MINUTES,
                        }),
                      ).catch(() => undefined);
                    }
                    setComposeAt(null);
                    setDraft("");
                  }}
                  placeholder="New task"
                  placeholderTextColor={colors.faint}
                  returnKeyType="done"
                  style={[styles.composerInput, { color: colors.text }]}
                />
                <Button
                  icon="close"
                  accessibilityLabel="Cancel"
                  onPress={() => {
                    setComposeAt(null);
                    setDraft("");
                  }}
                />
              </View>
            )}
          </>
        ) : (
          <WeekList
            days={weekDays}
            today={today}
            tasks={snapshot.tasks}
            onOpenDay={(target) => {
              setDay(target);
              setMode("day");
            }}
            onToggleTask={toggleTask}
          />
        )}

        <View style={[styles.backlog, { borderTopColor: colors.border }]}>
          <View style={styles.backlogHead}>
            <Text style={[typography.label, { color: colors.muted, flex: 1 }]}>
              Backlog · hold a task and drop it on the grid
            </Text>
            <Segment values={["active", "all", "done"] as const} value={filter} onChange={setFilter} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search backlog"
            placeholderTextColor={colors.faint}
            style={[
              styles.search,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          />
          {backlog.length === 0 ? (
            <EmptyState
              icon="calendar-clear-outline"
              title="Backlog clear"
              body="Create a task in Notes or Trek, or unschedule one here."
            />
          ) : (
            <View style={styles.backlogList}>
              {backlog.slice(0, 12).map((task) => (
                <BacklogChip
                  key={task.id}
                  label={task.content}
                  onOpen={() => openSource(task.id)}
                  onDropAt={(absoluteY) => {
                    const minutes = resolveMinutes.current?.(absoluteY) ?? null;
                    if (minutes === null) return;
                    scheduleAt(task.id, day, minutes);
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </>
  );
}

function BacklogChip({
  label,
  onOpen,
  onDropAt,
}: {
  label: string;
  onOpen(): void;
  onDropAt(absoluteY: number): void;
}) {
  const { colors } = useTheme();
  const [dragging, setDragging] = useState(false);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(180)
        .onStart(() => setDragging(true))
        .onEnd((event) => onDropAt(event.absoluteY))
        .onFinalize(() => setDragging(false))
        .runOnJS(true),
    [onDropAt],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={[
          styles.chip,
          {
            backgroundColor: colors.surface,
            borderColor: dragging ? colors.accent : colors.border,
            opacity: dragging ? 0.6 : 1,
          },
        ]}
      >
        <Icon name="ellipse-outline" size={13} color={colors.muted} />
        <Text numberOfLines={1} style={[typography.caption, { color: colors.text }]}>
          {label}
        </Text>
      </Pressable>
    </GestureDetector>
  );
}

function WeekList({
  days,
  today,
  tasks,
  onOpenDay,
  onToggleTask,
}: {
  days: string[];
  today: string;
  tasks: { id: string; content: string; completed: boolean; dueDate: string | null }[];
  onOpenDay(day: string): void;
  onToggleTask(taskId: string): void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.week}>
      {days.map((day) => {
        const dayTasks = tasks.filter((task) => parseDue(task.dueDate)?.day === day);

        return (
          <View key={day} style={[styles.weekDay, { borderBottomColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenDay(day)}
              style={styles.weekHead}
            >
              <Text
                style={[
                  typography.label,
                  { color: day === today ? colors.accent : colors.secondary, flex: 1 },
                ]}
              >
                {dayLabel(day)}
                {day === today ? " · today" : ""}
              </Text>
              <Text style={[typography.caption, { color: colors.muted }]}>
                {dayTasks.length || ""}
              </Text>
            </Pressable>
            {dayTasks.map((task) => (
              <DividerRow key={task.id}>
                <Button
                  icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
                  accessibilityLabel="Toggle task"
                  onPress={() => onToggleTask(task.id)}
                />
                <Text
                  numberOfLines={1}
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
              </DividerRow>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: 96 },
  controls: { paddingVertical: spacing.md },
  dayBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: 6 },
  week: { flex: 1 },
  weekDay: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  weekHead: { minHeight: 36, flexDirection: "row", alignItems: "center" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerInput: { flex: 1, height: 38 },
  backlog: { paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  backlogHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  search: { height: 38, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 12 },
  backlogList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    maxWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: radii.sm,
  },
});
