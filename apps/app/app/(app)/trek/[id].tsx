import type { Task } from "@giraffle/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddBoardTaskSheet } from "@/components/boards/AddBoardTaskSheet";
import {
  DragSortItem,
  DragSortProvider,
  useDragSort,
  type DropTarget,
} from "@/components/dnd/DragSortContext";
import { Page } from "@/components/ui/Page";
import { EditableText } from "@/components/ui/EditableText";
import { Button, EmptyState } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

/** Cards follow their board position; the shared task list is ordered for the agenda screens. */
function cardsOf(tasks: Task[], columnId: string): Task[] {
  return tasks
    .filter((task) => task.columnId === columnId)
    .sort((left, right) => Number(left.position) - Number(right.position));
}

export default function BoardDetail() {
  return (
    <DragSortProvider>
      <BoardScreen />
    </DragSortProvider>
  );
}

function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { snapshot, run } = useApp();
  const drag = useDragSort();
  const [addColumnId, setAddColumnId] = useState<string | null>(null);
  const board = snapshot.boards.find((item) => item.id === id);
  const columns = useMemo(
    () => snapshot.columns.filter((item) => item.boardId === id),
    [id, snapshot.columns],
  );
  const boardTasks = useMemo(
    () => snapshot.tasks.filter((task) => task.boardId === id),
    [id, snapshot.tasks],
  );

  /**
   * Dropping a card back on its own column head would move nothing, so that
   * head is the only target a card cannot use. Cards in other columns stay
   * available: dropping on one places the card at that exact position.
   */
  const blockedByColumn = useMemo(
    () => new Map(columns.map((column) => [column.id, [column.id]])),
    [columns],
  );

  const handleDrop = useCallback(
    (sourceId: string, target: DropTarget) => {
      const column = columns.find((item) => item.id === target.id);

      if (column) {
        const last = cardsOf(boardTasks, column.id).at(-1);
        void run((repository) =>
          repository.moveTask(sourceId, column.id, last?.id ?? null),
        ).catch(() => undefined);
        return;
      }

      const dropped = boardTasks.find((task) => task.id === target.id);
      const columnId = dropped?.columnId;
      if (!dropped || !columnId || dropped.id === sourceId) return;

      const siblings = cardsOf(boardTasks, columnId);
      const index = siblings.findIndex((task) => task.id === dropped.id);
      const after = target.zone === "before" ? siblings[index - 1] : dropped;

      void run((repository) => repository.moveTask(sourceId, columnId, after?.id ?? null)).catch(
        () => undefined,
      );
    },
    [boardTasks, columns, run],
  );

  if (!board) {
    return (
      <Page>
        <EmptyState
          icon="alert-circle-outline"
          title="Board unavailable"
          body="This board may have been deleted."
          action={<Button label="Back to Boards" onPress={() => router.replace("/trek")} />}
        />
      </Page>
    );
  }

  const addColumn = columns.find((column) => column.id === addColumnId);
  const unassignedTasks = snapshot.tasks.filter(
    (task) => !task.boardId && !task.completed,
  );

  return (
    <Page scroll={false}>
      <View style={[styles.heading, { paddingTop: insets.top }]}>
        <View style={styles.titleRow}>
          <Button icon="chevron-back" accessibilityLabel="Back to Boards" onPress={() => router.back()} />
          <EditableText
            value={board.title}
            onSave={(title) => void run((repository) => repository.updateBoard(id, { title }))}
            style={[typography.heading, { flex: 1 }]}
          />
        </View>
      </View>
      <ScrollView
        horizontal
        style={styles.boardScroll}
        contentContainerStyle={styles.columns}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        {columns.map((column) => {
          const tasks = cardsOf(boardTasks, column.id);
          const receiving = drag.target?.id === column.id;
          return (
            <View
              key={column.id}
              style={[styles.column, { borderTopColor: column.color ?? colors.accent }]}
            >
              <DragSortItem id={column.id} containerOnly disabled onDrop={handleDrop}>
                <View
                  style={[
                    styles.columnHead,
                    receiving ? { backgroundColor: colors.hover } : null,
                  ]}
                >
                  <EditableText
                    value={column.title}
                    onSave={(title) =>
                      void run((repository) => repository.updateColumn(column.id, { title }))
                    }
                    style={[typography.label, { flex: 1 }]}
                  />
                  <Text style={[typography.caption, { color: colors.muted }]}>{tasks.length}</Text>
                  <Button
                    icon="add"
                    accessibilityLabel={`Add task to ${column.title}`}
                    onPress={() => setAddColumnId(column.id)}
                  />
                </View>
              </DragSortItem>
              <ScrollView
                style={styles.taskList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {tasks.map((task) => {
                  /** A card is not a container, so hovering its middle lands the drop after it. */
                  const zone =
                    drag.target?.id === task.id
                      ? drag.target.zone === "before"
                        ? "before"
                        : "after"
                      : null;
                  return (
                    <DragSortItem
                      key={task.id}
                      id={task.id}
                      blockedIds={blockedByColumn.get(column.id) ?? []}
                      onDrop={handleDrop}
                    >
                      <View
                        style={[
                          styles.edge,
                          zone === "before" ? { backgroundColor: colors.accent } : null,
                        ]}
                      />
                      <View
                        style={[
                          styles.task,
                          { borderBottomColor: colors.border },
                          drag.draggingId === task.id ? styles.dragging : null,
                        ]}
                      >
                        <Button
                          icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
                          accessibilityLabel={task.completed ? "Mark incomplete" : "Complete task"}
                          onPress={() =>
                            void run((repository) =>
                              repository.updateTask(task.id, { completed: !task.completed }),
                            )
                          }
                        />
                        <EditableText
                          value={task.content}
                          onSave={(content) =>
                            void run((repository) => repository.updateTask(task.id, { content }))
                          }
                          multiline
                          placeholder="New task"
                          style={[
                            typography.body,
                            {
                              color: task.completed ? colors.muted : colors.text,
                              flex: 1,
                              textDecorationLine: task.completed ? "line-through" : "none",
                            },
                          ]}
                        />
                        {columns.length > 1 ? (
                          <Button
                            icon="arrow-forward-circle-outline"
                            accessibilityLabel="Move task to next column"
                            onPress={() => {
                              const currentIndex = columns.findIndex(
                                (item) => item.id === column.id,
                              );
                              const next = columns[(currentIndex + 1) % columns.length];
                              if (next) {
                                const last = cardsOf(boardTasks, next.id).at(-1);
                                void run((repository) =>
                                  repository.moveTask(task.id, next.id, last?.id ?? null),
                                );
                              }
                            }}
                          />
                        ) : null}
                        <Button
                          icon={task.pageId === board.pageId ? "trash-outline" : "remove-circle-outline"}
                          tone={task.pageId === board.pageId ? "danger" : "quiet"}
                          accessibilityLabel={task.pageId === board.pageId ? "Delete task" : "Remove from board"}
                          onPress={() =>
                            task.pageId === board.pageId
                              ? Alert.alert("Delete task?", `“${task.content}” will be removed everywhere.`, [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Delete",
                                    style: "destructive",
                                    onPress: () =>
                                      void run((repository) => repository.deleteTask(task.id)),
                                  },
                                ])
                              : Alert.alert("Remove from board?", `“${task.content}” will remain in ${task.sourceLabel}.`, [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Remove",
                                    onPress: () =>
                                      void run((repository) => repository.removeTaskFromBoard(task.id)),
                                  },
                                ])
                          }
                        />
                      </View>
                      <View
                        style={[
                          styles.edge,
                          zone === "after" ? { backgroundColor: colors.accent } : null,
                        ]}
                      />
                    </DragSortItem>
                  );
                })}
              </ScrollView>
              <Button
                label="Add task"
                icon="add-outline"
                onPress={() => setAddColumnId(column.id)}
              />
            </View>
          );
        })}
        <View style={[styles.addColumn, { borderColor: colors.border }]}>
          <Button
            label="Add column"
            icon="add"
            onPress={() => void run((repository) => repository.createColumn(id))}
          />
        </View>
      </ScrollView>
      <AddBoardTaskSheet
        visible={Boolean(addColumn)}
        columnTitle={addColumn?.title ?? ""}
        tasks={unassignedTasks}
        onClose={() => setAddColumnId(null)}
        onCreate={(content) => {
          if (!addColumn) return;
          setAddColumnId(null);
          void run((repository) =>
            repository.createTask({ boardId: id, columnId: addColumn.id, content }),
          );
        }}
        onAdd={(taskId) => {
          if (!addColumn) return;
          setAddColumnId(null);
          void run((repository) =>
            repository.addTaskToBoard(taskId, id, addColumn.id),
          );
        }}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  heading: { paddingBottom: spacing.md, gap: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  boardScroll: { flex: 1 },
  columns: {
    paddingBottom: spacing.md,
    gap: spacing.xl,
    alignItems: "stretch",
  },
  column: { width: 290, borderTopWidth: 2 },
  columnHead: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskList: { flex: 1 },
  task: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dragging: { opacity: 0.45 },
  edge: { height: 2, borderRadius: 1 },
  addColumn: { width: 180, height: 60, borderWidth: 1, borderRadius: 9, padding: 10 },
});
