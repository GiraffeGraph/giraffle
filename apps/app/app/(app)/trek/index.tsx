import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  DragSortItem,
  DragSortProvider,
  useDragSort,
  type DropTarget,
} from "@/components/dnd/DragSortContext";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

/** Lane of the boards that carry no status. */
const UNSORTED = "none";
const LANE_PREFIX = "lane:";

const laneKey = (laneId: string) => `${LANE_PREFIX}${laneId}`;
const laneIdFromKey = (id: string) =>
  id.startsWith(LANE_PREFIX) ? id.slice(LANE_PREFIX.length) : null;

export default function Trek() {
  return (
    <DragSortProvider>
      <TrekScreen />
    </DragSortProvider>
  );
}

function TrekScreen() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const drag = useDragSort();
  const create = (statusId: string | null = snapshot.statuses[0]?.id ?? null) => {
    void run((repository) => repository.createBoard("Untitled board", statusId))
      .then((id) => router.push(`/trek/${id}`))
      .catch(() => undefined);
  };
  const confirmDelete = (id: string, title: string) => {
    Alert.alert(
      "Delete board?",
      `“${title}” and its board tasks will no longer be available.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void run((repository) => repository.deleteBoard(id)),
        },
      ],
    );
  };
  const lanes = [
    ...snapshot.statuses,
    { id: UNSORTED, title: "Unsorted", color: null, position: "99" },
  ];

  /** Dropping a board on its own lane head would move nothing. */
  const blockedByLane = useMemo(
    () =>
      new Map(
        [...snapshot.statuses.map((status) => status.id), UNSORTED].map((laneId) => [
          laneId,
          [laneKey(laneId)],
        ]),
      ),
    [snapshot.statuses],
  );

  const relocate = useCallback(
    (sourceId: string, laneId: string, afterBoardId: string | null) => {
      const source = snapshot.boards.find((board) => board.id === sourceId);
      if (!source) return;

      const statusId = laneId === UNSORTED ? null : laneId;
      void run(async (repository) => {
        if ((source.statusId ?? UNSORTED) !== laneId) {
          await repository.updateBoard(sourceId, { statusId });
        }
        await repository.moveBoard(sourceId, afterBoardId);
      }).catch(() => undefined);
    },
    [run, snapshot.boards],
  );

  const handleDrop = useCallback(
    (sourceId: string, target: DropTarget) => {
      const laneId = laneIdFromKey(target.id);

      if (laneId) {
        const last = snapshot.boards
          .filter((board) => (board.statusId ?? UNSORTED) === laneId)
          .at(-1);
        relocate(sourceId, laneId, last?.id ?? null);
        return;
      }

      const dropped = snapshot.boards.find((board) => board.id === target.id);
      if (!dropped || dropped.id === sourceId) return;

      const lane = snapshot.boards.filter(
        (board) => (board.statusId ?? UNSORTED) === (dropped.statusId ?? UNSORTED),
      );
      const index = lane.findIndex((board) => board.id === dropped.id);
      const after = target.zone === "before" ? lane[index - 1] : dropped;
      relocate(sourceId, dropped.statusId ?? UNSORTED, after?.id ?? null);
    },
    [relocate, snapshot.boards],
  );

  return (
    <>
      <ScreenTopbar
        title="Trek"
        action={<Button label="Board" icon="add" tone="accent" onPress={() => create()} />}
      />
      <Page>
      {snapshot.boards.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="Start with a board"
          body="Create a board and add your first task."
          action={<Button label="Create board" tone="accent" onPress={() => create()} />}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.lanes}
        >
          {lanes.map((status) => {
            const boards = snapshot.boards.filter(
              (board) => (board.statusId ?? UNSORTED) === status.id,
            );
            return (
              <View
                key={status.id}
                style={[styles.lane, { borderTopColor: status.color ?? colors.accent }]}
              >
                <DragSortItem
                  id={laneKey(status.id)}
                  containerOnly
                  disabled
                  onDrop={handleDrop}
                >
                  <View
                    style={[
                      styles.laneHead,
                      drag.target?.id === laneKey(status.id)
                        ? { backgroundColor: colors.hover }
                        : null,
                    ]}
                  >
                    <Text style={[typography.label, { color: colors.text, flex: 1 }]}>
                      {status.title}
                    </Text>
                    <Text style={[typography.caption, { color: colors.muted }]}>
                      {boards.length}
                    </Text>
                  </View>
                </DragSortItem>
                {boards.map((board) => {
                  /** A board row is not a container, so hovering its middle sorts after it. */
                  const zone =
                    drag.target?.id === board.id
                      ? drag.target.zone === "before"
                        ? "before"
                        : "after"
                      : null;
                  return (
                    <DragSortItem
                      key={board.id}
                      id={board.id}
                      blockedIds={blockedByLane.get(status.id) ?? []}
                      onDrop={handleDrop}
                    >
                      <View
                        style={[
                          styles.edge,
                          zone === "before" ? { backgroundColor: colors.accent } : null,
                        ]}
                      />
                      <DividerRow
                        {...(drag.draggingId === board.id ? { style: styles.dragging } : {})}
                      >
                        <Icon name="albums-outline" size={17} />
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={[typography.title, { color: colors.text }]}>
                            {board.title}
                          </Text>
                          <Text style={[typography.caption, { color: colors.muted }]}>
                            {snapshot.tasks.filter((task) => task.boardId === board.id).length} tasks ·{" "}
                            {snapshot.columns.filter((column) => column.boardId === board.id).length} columns
                          </Text>
                        </View>
                        <Button label="Open" onPress={() => router.push(`/trek/${board.id}`)} />
                        <Button
                          icon="trash-outline"
                          tone="danger"
                          accessibilityLabel="Delete board"
                          onPress={() => confirmDelete(board.id, board.title)}
                        />
                      </DividerRow>
                      <View
                        style={[
                          styles.edge,
                          zone === "after" ? { backgroundColor: colors.accent } : null,
                        ]}
                      />
                    </DragSortItem>
                  );
                })}
                <Button
                  label="Add board"
                  icon="add-outline"
                  onPress={() => create(status.id === UNSORTED ? null : status.id)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  lanes: { gap: spacing.xl, paddingBottom: 8 },
  lane: { width: 300, borderTopWidth: 2 },
  laneHead: { height: 38, flexDirection: "row", alignItems: "center" },
  dragging: { opacity: 0.45 },
  edge: { height: 2, borderRadius: 1 },
});
