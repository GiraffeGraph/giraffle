import type { Task, TaskPriority } from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  DragSortItem,
  DragSortProvider,
  useDragSort,
  type DropTarget,
} from "@/components/dnd/DragSortContext";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { TaskViewSwitch } from "@/components/shell/TaskViewSwitch";
import { QuickTaskButton } from "@/components/tasks/QuickTaskButton";
import { Page } from "@/components/ui/Page";
import { Button, EmptyState, Icon, Segment } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const quadrants = [
  { id: "do", title: "Focus", caption: "Urgent · important", icon: "flame-outline" },
  { id: "schedule", title: "Plan", caption: "Important · not urgent", icon: "time-outline" },
  { id: "delegate", title: "Delegate", caption: "Urgent · can move", icon: "people-outline" },
  { id: "eliminate", title: "Drop", caption: "Low value", icon: "remove-circle-outline" },
] as const;

const QUADRANT_SLOT = "quadrant:";
const QUADRANT_PREVIEW_LIMIT = 3;
type Filter = "active" | "all" | "done";

export default function PriorityMatrix() {
  return (
    <DragSortProvider>
      <PriorityScreen />
    </DragSortProvider>
  );
}

function PriorityScreen() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const drag = useDragSort();
  const [filter, setFilter] = useState<Filter>("active");
  const [expandedQuadrants, setExpandedQuadrants] = useState<Set<TaskPriority>>(
    () => new Set(),
  );

  const visibleTasks = useMemo(
    () =>
      snapshot.tasks.filter((task) =>
        filter === "all" ? true : filter === "done" ? task.completed : !task.completed,
      ),
    [filter, snapshot.tasks],
  );
  const taskIds = useMemo(() => snapshot.tasks.map((task) => task.id), [snapshot.tasks]);
  const unprioritized = visibleTasks.filter((task) => task.priority === null);

  const setPriority = useCallback(
    (taskId: string, priority: TaskPriority | null) => {
      void run((repository) => repository.updateTask(taskId, { priority })).catch(
        () => undefined,
      );
    },
    [run],
  );

  const handleDrop = useCallback(
    (sourceId: string, target: DropTarget) => {
      if (!target.id.startsWith(QUADRANT_SLOT)) return;
      setPriority(sourceId, target.id.slice(QUADRANT_SLOT.length) as TaskPriority);
    },
    [setPriority],
  );

  const toggleTask = (task: Task) => {
    void run((repository) =>
      repository.updateTask(task.id, { completed: !task.completed }),
    ).catch(() => undefined);
  };

  const openSource = (task: Task) => {
    if (task.boardId) router.push(`/trek/${task.boardId}`);
    else router.push(`/notes/${task.pageId}`);
  };

  const toggleQuadrant = (priority: TaskPriority) => {
    setExpandedQuadrants((current) => {
      const next = new Set(current);
      if (next.has(priority)) next.delete(priority);
      else next.add(priority);
      return next;
    });
  };

  return (
    <>
      <ScreenTopbar
        title="Priority"
        aside={<TaskViewSwitch />}
        action={<QuickTaskButton />}
      />
      <Page>
        <View style={styles.toolbar}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.title, { color: colors.text }]}>Task priority</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}
            </Text>
          </View>
          <Segment values={["active", "all", "done"] as const} value={filter} onChange={setFilter} />
        </View>

        {visibleTasks.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title={filter === "done" ? "No completed tasks" : "No active tasks"}
            body="Tasks created in Notes or Boards appear here automatically."
          />
        ) : (
          <>
            {unprioritized.length ? (
              <View style={styles.unprioritized}>
                <View style={styles.sectionHeading}>
                  <Text style={[typography.label, { color: colors.text, flex: 1 }]}>No priority</Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {unprioritized.length}
                  </Text>
                </View>
                <View style={styles.unprioritizedTasks}>
                  {unprioritized.map((task) => (
                    <DragSortItem
                      key={task.id}
                      id={task.id}
                      blockedIds={taskIds}
                      onDrop={handleDrop}
                      style={styles.unprioritizedItem}
                    >
                      <TaskCard
                        task={task}
                        dragging={drag.draggingId === task.id}
                        onToggle={() => toggleTask(task)}
                        onOpen={() => openSource(task)}
                        onNext={() => setPriority(task.id, "do")}
                      />
                    </DragSortItem>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.matrix}>
              {quadrants.map((quadrant) => {
                const slotId = `${QUADRANT_SLOT}${quadrant.id}`;
                const tasks = visibleTasks.filter((task) => task.priority === quadrant.id);
                const expanded = expandedQuadrants.has(quadrant.id);
                const shownTasks = expanded
                  ? tasks
                  : tasks.slice(0, QUADRANT_PREVIEW_LIMIT);
                const hiddenCount = tasks.length - shownTasks.length;
                const receiving = drag.target?.id === slotId;

                return (
                  <DragSortItem
                    key={quadrant.id}
                    id={slotId}
                    containerOnly
                    disabled
                    onDrop={handleDrop}
                    style={styles.quadrantSlot}
                  >
                    <View
                      style={[
                        styles.quadrant,
                        {
                          borderColor: receiving ? colors.accent : colors.border,
                          backgroundColor: receiving ? colors.accentSubtle : colors.surface,
                        },
                      ]}
                    >
                      <View style={styles.quadrantHeading}>
                        <View style={[styles.quadrantIcon, { backgroundColor: colors.accentSubtle }]}>
                          <Icon name={quadrant.icon} size={18} color={colors.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.title, { color: colors.text }]}>
                            {quadrant.title}
                          </Text>
                          <Text style={[typography.caption, { color: colors.muted }]}>
                            {quadrant.caption}
                          </Text>
                        </View>
                        <Text style={[typography.caption, { color: colors.muted }]}>{tasks.length}</Text>
                      </View>

                      <View style={styles.quadrantTasks}>
                        {shownTasks.map((task) => {
                          const index = quadrants.findIndex((item) => item.id === quadrant.id);
                          const next = quadrants[index + 1]?.id ?? null;
                          return (
                            <DragSortItem
                              key={task.id}
                              id={task.id}
                              blockedIds={taskIds}
                              onDrop={handleDrop}
                            >
                              <TaskCard
                                task={task}
                                dragging={drag.draggingId === task.id}
                                onToggle={() => toggleTask(task)}
                                onOpen={() => openSource(task)}
                                onNext={() => setPriority(task.id, next)}
                              />
                            </DragSortItem>
                          );
                        })}
                        {tasks.length === 0 ? (
                          <View style={styles.quadrantEmpty}>
                            <Text style={[typography.caption, { color: colors.faint }]}>—</Text>
                          </View>
                        ) : null}
                        {hiddenCount > 0 || expanded ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={expanded ? "Show fewer tasks" : `Show ${hiddenCount} more tasks`}
                            onPress={() => toggleQuadrant(quadrant.id)}
                            style={({ pressed }) => [
                              styles.moreButton,
                              {
                                borderTopColor: colors.border,
                                opacity: pressed ? 0.55 : 1,
                              },
                            ]}
                          >
                            <Text style={[typography.label, { color: colors.accent }]}>
                              {expanded ? "Show less" : `+${hiddenCount} more`}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </DragSortItem>
                );
              })}
            </View>
          </>
        )}
      </Page>
    </>
  );
}

function TaskCard({
  task,
  dragging,
  onToggle,
  onOpen,
  onNext,
}: {
  task: Task;
  dragging: boolean;
  onToggle(): void;
  onOpen(): void;
  onNext(): void;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.taskCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceStrong,
          opacity: dragging ? 0.82 : 1,
        },
      ]}
    >
      <Button
        icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
        accessibilityLabel={task.completed ? "Mark incomplete" : "Complete task"}
        onPress={onToggle}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${task.sourceLabel}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.taskCopy, { opacity: pressed ? 0.55 : 1 }]}
      >
        <Text
          numberOfLines={2}
          style={[
            typography.body,
            {
              color: task.completed ? colors.muted : colors.text,
              textDecorationLine: task.completed ? "line-through" : "none",
            },
          ]}
        >
          {task.content}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
          {task.sourceLabel}
        </Text>
      </Pressable>
      <Button
        icon="arrow-forward"
        accessibilityLabel="Move to next priority"
        onPress={onNext}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionHeading: { minHeight: 32, flexDirection: "row", alignItems: "center" },
  unprioritized: { gap: spacing.sm },
  unprioritizedTasks: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  unprioritizedItem: { width: "100%", maxWidth: 420 },
  matrix: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  quadrantSlot: { flexBasis: "47%", flexGrow: 1, minWidth: 150 },
  quadrant: {
    flex: 1,
    minHeight: 240,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    gap: spacing.md,
  },
  quadrantHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  quadrantIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  quadrantTasks: { gap: spacing.sm },
  quadrantEmpty: { minHeight: 88, alignItems: "center", justifyContent: "center" },
  moreButton: {
    minHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  taskCard: {
    minHeight: 62,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  taskCopy: { flex: 1, minWidth: 0, gap: 2 },
});
