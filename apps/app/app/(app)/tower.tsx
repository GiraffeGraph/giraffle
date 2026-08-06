import type { PagePriority, TaskPriority } from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  DragSortItem,
  DragSortProvider,
  useDragSort,
  type DropTarget,
} from "@/components/dnd/DragSortContext";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { TaskViewSwitch } from "@/components/shell/TaskViewSwitch";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const quadrants = [
  { id: "do", title: "Do", caption: "Urgent · important", icon: "flame-outline" },
  { id: "schedule", title: "Schedule", caption: "Important · later", icon: "calendar-outline" },
  { id: "delegate", title: "Delegate", caption: "Urgent · lighter", icon: "people-outline" },
  { id: "eliminate", title: "Eliminate", caption: "Neither", icon: "close-circle-outline" },
] as const;

/** Keeps quadrant drop slots out of the id space shared with pages and tasks. */
const QUADRANT_SLOT = "quadrant:";

export default function Tower() {
  return (
    <DragSortProvider>
      <TowerScreen />
    </DragSortProvider>
  );
}

function TowerScreen() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const { width } = useWindowDimensions();
  const drag = useDragSort();
  const activePages = snapshot.pages.filter((page) => !page.isArchived);
  const [selected, setSelected] = useState<string | null>(activePages[0]?.id ?? null);
  const [showTasks, setShowTasks] = useState(false);
  const phone = width < 720;
  const boardTasks = snapshot.tasks.filter((task) => task.boardId !== null);
  const showingBoardTasks = selected === "trek";
  // The stored page can disappear when it is archived or deleted, so fall back
  // to the first available page instead of correcting state after render.
  const selectedPage = showingBoardTasks
    ? undefined
    : (activePages.find((page) => page.id === selected) ?? activePages[0]);
  const boardTasksVisible = boardTasks.length > 0 && (!phone || showingBoardTasks);
  const selectedTasks = selectedPage
    ? snapshot.tasks.filter((task) => task.pageId === selectedPage.id)
    : [];
  const unprioritized = selectedTasks.filter((task) => task.priority === null);

  const choosePage = (pageId: string) => {
    setSelected(pageId);
    if (phone) setShowTasks(true);
  };
  const placeNextPage = (priority: PagePriority) => {
    const page = activePages.find((item) => !snapshot.pagePriorities[item.id]);
    if (!page) return;
    void run((repository) => repository.setPagePriority(page.id, priority))
      .then(() => choosePage(page.id))
      .catch(() => undefined);
  };

  /**
   * Quadrants are the only drop targets. Every card blocks every other card so
   * a card under the finger cannot shadow the quadrant it sits in.
   */
  const cardIds = useMemo(
    () => [...snapshot.pages.map((page) => page.id), ...snapshot.tasks.map((task) => task.id)],
    [snapshot.pages, snapshot.tasks],
  );

  /** Phones show the matrix and the task list apart, leaving a task nowhere to land. */
  const taskDragDisabled = phone;

  const handleDrop = useCallback(
    (sourceId: string, target: DropTarget) => {
      if (!target.id.startsWith(QUADRANT_SLOT)) return;
      const priority = target.id.slice(QUADRANT_SLOT.length) as TaskPriority;
      const isPage = snapshot.pages.some((page) => page.id === sourceId);

      void run((repository) =>
        isPage
          ? repository.setPagePriority(sourceId, priority)
          : repository.updateTask(sourceId, { priority }),
      ).catch(() => undefined);
    },
    [run, snapshot.pages],
  );

  const pageMatrix = (
    <View style={styles.matrix}>
      {phone && boardTasks.length ? (
        <View style={styles.trekShortcut}>
          <Button
            label={`Trek tasks (${boardTasks.length})`}
            icon="albums-outline"
            onPress={() => {
              setSelected("trek");
              setShowTasks(true);
            }}
          />
        </View>
      ) : null}
      {quadrants.map((quadrant) => {
        const slotId = `${QUADRANT_SLOT}${quadrant.id}`;
        const hovered = drag.target?.id === slotId;

        return (
          <DragSortItem key={quadrant.id} id={slotId} containerOnly disabled onDrop={handleDrop}>
            <View
              style={[
                styles.quadrant,
                { borderColor: hovered ? colors.accent : colors.border },
                hovered ? { backgroundColor: colors.hover } : null,
              ]}
            >
              <View style={styles.quadrantHead}>
                <Icon name={quadrant.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.label, { color: colors.text }]}>{quadrant.title}</Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {quadrant.caption}
                  </Text>
                </View>
              </View>
              {activePages
                .filter((page) => snapshot.pagePriorities[page.id] === quadrant.id)
                .map((page) => (
                  <DragSortItem
                    key={page.id}
                    id={page.id}
                    blockedIds={cardIds}
                    onDrop={handleDrop}
                  >
                    <Pressable
                      onPress={() => choosePage(page.id)}
                      style={[
                        styles.item,
                        {
                          borderBottomColor: colors.border,
                          backgroundColor:
                            selected === page.id ? colors.accentSubtle : "transparent",
                        },
                        drag.draggingId === page.id ? styles.dragging : null,
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[typography.body, { color: colors.text, flex: 1 }]}
                      >
                        {page.title}
                      </Text>
                      <Text style={[typography.caption, { color: colors.muted }]}>
                        {snapshot.tasks.filter((task) => task.pageId === page.id).length}
                      </Text>
                    </Pressable>
                  </DragSortItem>
                ))}
              <Button
                label="Place page"
                icon="add-outline"
                disabled={!activePages.some((page) => !snapshot.pagePriorities[page.id])}
                onPress={() => placeNextPage(quadrant.id as PagePriority)}
              />
            </View>
          </DragSortItem>
        );
      })}
    </View>
  );

  const tasks = (
    <View style={styles.taskPanel}>
      {phone ? (
        <Button label="Page matrix" icon="chevron-back" onPress={() => setShowTasks(false)} />
      ) : null}
      <Text style={[typography.title, { color: colors.text }]}>
        {selectedPage?.title ?? (boardTasksVisible ? "Trek tasks" : "Select a page")}
      </Text>
      <Text style={[typography.caption, { color: colors.muted }]}>
        Task priority is separate from page placement.
      </Text>
      {selectedPage ? (
        <>
          <Button
            label="Add task"
            icon="add"
            onPress={() =>
              void run((repository) =>
                repository.createTask({ pageId: selectedPage.id, priority: "do" }),
              )
            }
          />
          {unprioritized.length ? (
            <View>
              <Text style={[typography.label, { color: colors.secondary, marginTop: 12 }]}>
                Needs priority
              </Text>
              {unprioritized.map((task) => (
                <DragSortItem
                  key={task.id}
                  id={task.id}
                  blockedIds={cardIds}
                  disabled={taskDragDisabled}
                  onDrop={handleDrop}
                >
                  <DividerRow
                    {...(drag.draggingId === task.id ? { style: styles.dragging } : {})}
                  >
                    <Button
                      icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
                      accessibilityLabel="Complete task"
                      onPress={() =>
                        void run((repository) =>
                          repository.updateTask(task.id, { completed: !task.completed }),
                        )
                      }
                    />
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                      {task.content}
                    </Text>
                    <Button
                      label="Set Do"
                      onPress={() =>
                        void run((repository) => repository.updateTask(task.id, { priority: "do" }))
                      }
                    />
                  </DividerRow>
                </DragSortItem>
              ))}
            </View>
          ) : null}
          {quadrants.map((quadrant) => (
            <View key={quadrant.id}>
              <Text style={[typography.label, { color: colors.secondary, marginTop: 12 }]}>
                {quadrant.title}
              </Text>
              {selectedTasks
                .filter((task) => task.priority === quadrant.id)
                .map((task) => (
                  <DragSortItem
                    key={task.id}
                    id={task.id}
                    blockedIds={cardIds}
                    disabled={taskDragDisabled}
                    onDrop={handleDrop}
                  >
                    <DividerRow
                      {...(drag.draggingId === task.id ? { style: styles.dragging } : {})}
                    >
                      <Button
                        icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
                        accessibilityLabel="Complete task"
                        onPress={() =>
                          void run((repository) =>
                            repository.updateTask(task.id, { completed: !task.completed }),
                          )
                        }
                      />
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                        {task.content}
                      </Text>
                      <Button
                        icon="arrow-forward"
                        accessibilityLabel="Change priority"
                        onPress={() => {
                          const next =
                            quadrants[
                              (quadrants.findIndex((item) => item.id === quadrant.id) + 1) %
                                quadrants.length
                            ];
                          if (next) {
                            void run((repository) =>
                              repository.updateTask(task.id, {
                                priority: next.id as TaskPriority,
                              }),
                            );
                          }
                        }}
                      />
                    </DividerRow>
                  </DragSortItem>
                ))}
            </View>
          ))}
        </>
      ) : null}
      {boardTasksVisible ? (
        <View>
          <Text style={[typography.label, { color: colors.secondary, marginTop: 12 }]}>Trek tasks</Text>
          {boardTasks.map((task) => (
            <DragSortItem
              key={task.id}
              id={task.id}
              blockedIds={cardIds}
              disabled={taskDragDisabled}
              onDrop={handleDrop}
            >
              <DividerRow
                {...(drag.draggingId === task.id ? { style: styles.dragging } : {})}
              >
                <Button
                  icon={task.completed ? "checkmark-circle" : "ellipse-outline"}
                  accessibilityLabel="Complete task"
                  onPress={() =>
                    void run((repository) =>
                      repository.updateTask(task.id, { completed: !task.completed }),
                    )
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { color: colors.text }]}>{task.content}</Text>
                  <Pressable
                    onPress={() => {
                      if (task.boardId) router.push(`/trek/${task.boardId}`);
                    }}
                  >
                    <Text style={[typography.caption, { color: colors.link }]}>
                      {task.sourceLabel}
                    </Text>
                  </Pressable>
                </View>
                <Button
                  label={task.priority ? "Next" : "Set Do"}
                  onPress={() => {
                    const currentIndex = quadrants.findIndex((item) => item.id === task.priority);
                    const next = quadrants[(currentIndex + 1) % quadrants.length];
                    if (next) {
                      void run((repository) =>
                        repository.updateTask(task.id, { priority: next.id as TaskPriority }),
                      );
                    }
                  }}
                />
              </DividerRow>
            </DragSortItem>
          ))}
        </View>
      ) : null}
      {!selectedPage && !boardTasksVisible ? (
        <EmptyState
          icon="document-outline"
          title="No page selected"
          body="Place or select a page in the matrix to manage its canonical tasks."
        />
      ) : null}
    </View>
  );

  return (
    <>
      <ScreenTopbar title="Priorities" aside={<TaskViewSwitch />} />
      <Page>
      {phone ? (
        showTasks ? tasks : pageMatrix
      ) : (
        <View style={styles.desktop}>
          <View style={{ flex: 2 }}>{pageMatrix}</View>
          <View style={[styles.detail, { borderLeftColor: colors.border }]}>{tasks}</View>
        </View>
      )}
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  matrix: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  trekShortcut: { marginBottom: spacing.sm },
  quadrant: {
    width: "48%",
    minHeight: 190,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 4,
  },
  quadrantHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  item: {
    minHeight: 38,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    gap: 8,
  },
  dragging: { opacity: 0.45 },
  desktop: { flexDirection: "row", gap: spacing.xl },
  detail: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: spacing.xl },
  taskPanel: { gap: 4 },
});
