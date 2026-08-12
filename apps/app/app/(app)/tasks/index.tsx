import type { Task } from "@giraffle/domain";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { TaskViewSwitch } from "@/components/shell/TaskViewSwitch";
import { QuickTaskButton } from "@/components/tasks/QuickTaskButton";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { Page } from "@/components/ui/Page";
import { Button, EmptyState, Icon, Segment } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

type Filter = "active" | "all" | "done";

const priorityLabel = {
  do: "Focus",
  schedule: "Plan",
  delegate: "Delegate",
  eliminate: "Drop",
} as const;

export default function TasksList() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const [filter, setFilter] = useState<Filter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tasks = useMemo(
    () =>
      [...snapshot.tasks]
        .filter((task) =>
          filter === "all" ? true : filter === "done" ? task.completed : !task.completed,
        )
        .sort((left, right) => {
          if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
          if (left.dueDate) return -1;
          if (right.dueDate) return 1;
          return right.updatedAt - left.updatedAt;
        }),
    [filter, snapshot.tasks],
  );
  const selected = snapshot.tasks.find((task) => task.id === selectedId) ?? null;
  const selectedBoard = selected?.boardId
    ? snapshot.boards.find((board) => board.id === selected.boardId)
    : null;
  const selectedSourceBoard = selected
    ? snapshot.boards.find((board) => board.pageId === selected.pageId)
    : null;

  const deleteTask = (task: Task) => {
    Alert.alert("Delete task?", `“${task.content}” will be removed everywhere.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setSelectedId(null);
          void run((repository) => repository.deleteTask(task.id));
        },
      },
    ]);
  };

  return (
    <>
      <ScreenTopbar
        title="Tasks"
        aside={<TaskViewSwitch />}
        action={<QuickTaskButton />}
      />
      <Page>
        <View style={styles.toolbar}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.title, { color: colors.text }]}>Task list</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            </Text>
          </View>
          <Segment values={["active", "all", "done"] as const} value={filter} onChange={setFilter} />
        </View>

        {tasks.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title={filter === "done" ? "No completed tasks" : "No active tasks"}
            body="Add a task here, in a page, or on a board."
          />
        ) : (
          <View style={[styles.list, { borderTopColor: colors.border }]}>
            {tasks.map((task) => {
              const board = task.boardId
                ? snapshot.boards.find((item) => item.id === task.boardId)
                : null;
              const metadata = [
                task.sourceLabel,
                board?.title,
                task.dueDate?.replace("T", " · "),
                task.priority ? priorityLabel[task.priority] : null,
              ].filter(Boolean);
              return (
                <View key={task.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Button
                    icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
                    accessibilityLabel={task.completed ? "Mark incomplete" : "Complete task"}
                    onPress={() =>
                      void run((repository) =>
                        repository.updateTask(task.id, { completed: !task.completed }),
                      )
                    }
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${task.content}`}
                    onPress={() => setSelectedId(task.id)}
                    style={({ pressed }) => [styles.taskLink, { opacity: pressed ? 0.58 : 1 }]}
                  >
                    <Text
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
                      {metadata.join(" · ")}
                    </Text>
                  </Pressable>
                  {task.boardId ? <Icon name="albums-outline" size={17} color={colors.faint} /> : null}
                  <Icon name="chevron-forward" size={16} color={colors.faint} />
                </View>
              );
            })}
          </View>
        )}
      </Page>

      <TaskDetailSheet
        task={selected}
        boardTitle={selectedBoard?.title}
        onClose={() => setSelectedId(null)}
        onSave={(patch) => run((repository) => repository.updateTask(selected!.id, patch))}
        onOpenSource={() => {
          if (!selected) return;
          setSelectedId(null);
          router.push(selectedSourceBoard ? `/boards/${selectedSourceBoard.id}` : `/pages/${selected.pageId}`);
        }}
        onRemoveFromBoard={
          selected?.boardId && selectedBoard && selected.pageId !== selectedBoard.pageId
            ? () => {
                setSelectedId(null);
                void run((repository) => repository.removeTaskFromBoard(selected.id));
              }
            : undefined
        }
        onDelete={() => {
          if (selected) deleteTask(selected);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  list: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    minHeight: 64,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  taskLink: { flex: 1, minWidth: 0, paddingVertical: spacing.sm, gap: 3, borderRadius: radii.xs },
});
