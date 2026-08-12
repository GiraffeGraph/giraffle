import {
  DEFAULT_DURATION_MINUTES,
  SNAP_MINUTES,
  formatClock,
  minutesNow,
  parseDue,
  snapMinutes,
  type Task,
} from "@giraffle/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTheme } from "@/design/ThemeProvider";
import { radii, typography } from "@/design/tokens";

/** Tall enough that the shortest block a drag can produce still reads as a row. */
const HOUR_HEIGHT = 80;
const MIN_BLOCK_MINUTES = SNAP_MINUTES;
const GUTTER_WIDTH = 46;

/** Durations follow the same grid as start times, and never collapse to nothing. */
function snapDuration(minutes: number): number {
  return Math.max(MIN_BLOCK_MINUTES, Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
}

function minutesFromOffset(pixels: number): number {
  return (pixels / HOUR_HEIGHT) * 60;
}

function selectionRange(anchor: number, current: number) {
  const minutes = Math.min(anchor, current);
  const duration = snapDuration(Math.abs(current - anchor));
  return { minutes, duration };
}

export interface ScheduledBlock {
  task: Task;
  minutes: number;
  duration: number;
}

/**
 * A day as a vertical time grid. Blocks sit at their start minute, can be
 * dragged to another time and resized from the bottom edge.
 */
export function DayGrid({
  day,
  tasks,
  onMoveTask,
  onResizeTask,
  onOpenTask,
  onToggleTask,
  onPickSlot,
  selectedMinutes = null,
  selectedDuration = DEFAULT_DURATION_MINUTES,
}: {
  day: string;
  tasks: Task[];
  onMoveTask(taskId: string, minutes: number): void;
  onResizeTask(taskId: string, duration: number): void;
  onOpenTask(taskId: string): void;
  onToggleTask(taskId: string): void;
  /** A tap uses the default duration; holding and dragging selects a range. */
  onPickSlot(minutes: number, duration?: number): void;
  /** The range currently being composed in the task sheet. */
  selectedMinutes?: number | null;
  selectedDuration?: number;
}) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => minutesNow());
  const [draftSlot, setDraftSlot] = useState<{ minutes: number; duration: number } | null>(null);
  const gridTop = useRef(0);
  const scrollOffset = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  // Measured through a plain View: react-native-web's layout event carries no
  // node with measureInWindow, so reading it off the event crashes there.
  const gridRef = useRef<View>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(minutesNow()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { timed, allDay } = useMemo(() => {
    const timedBlocks: ScheduledBlock[] = [];
    const allDayTasks: Task[] = [];

    for (const task of tasks) {
      const due = parseDue(task.dueDate);
      if (!due || due.day !== day) continue;

      if (due.minutes === null) allDayTasks.push(task);
      else {
        timedBlocks.push({
          task,
          minutes: due.minutes,
          duration: task.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        });
      }
    }

    return {
      timed: timedBlocks.sort((left, right) => left.minutes - right.minutes),
      allDay: allDayTasks,
    };
  }, [day, tasks]);

  const minutesAt = useCallback((absoluteY: number): number | null => {
    const offsetInGrid = absoluteY - gridTop.current + scrollOffset.current;
    if (offsetInGrid < 0) return null;
    return snapMinutes((offsetInGrid / HOUR_HEIGHT) * 60);
  }, []);

  const createRange = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(180)
        .minDistance(0)
        .onStart((event) => {
          const anchor = snapMinutes(minutesFromOffset(event.y));
          setDraftSlot({ minutes: anchor, duration: MIN_BLOCK_MINUTES });
        })
        .onUpdate((event) => {
          const anchor = snapMinutes(minutesFromOffset(event.y - event.translationY));
          const current = snapMinutes(minutesFromOffset(event.y));
          setDraftSlot(selectionRange(anchor, current));
        })
        .onEnd((event) => {
          const anchor = snapMinutes(minutesFromOffset(event.y - event.translationY));
          const current = snapMinutes(minutesFromOffset(event.y));
          const range = selectionRange(anchor, current);
          onPickSlot(range.minutes, range.duration);
        })
        .onFinalize(() => {
          setDraftSlot(null);
        })
        .runOnJS(true),
    [onPickSlot],
  );

  const highlightedSlot =
    draftSlot ??
    (selectedMinutes === null
      ? null
      : { minutes: selectedMinutes, duration: selectedDuration });

  // Open on the current hour rather than at midnight.
  useEffect(() => {
    const target = Math.max(0, (now / 60) * HOUR_HEIGHT - HOUR_HEIGHT * 2);
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: target, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [now]);

  return (
    <View style={styles.fill}>
      {allDay.length > 0 ? (
        <View style={[styles.allDay, { borderBottomColor: colors.border }]}>
          {allDay.map((task) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => onOpenTask(task.id)}
              style={[styles.allDayChip, { backgroundColor: colors.accentSubtle }]}
            >
              <Text numberOfLines={1} style={[typography.caption, { color: colors.text }]}>
                {task.content}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View
        ref={gridRef}
        collapsable={false}
        style={styles.fill}
        onLayout={() =>
          gridRef.current?.measureInWindow((_x, y) => {
            gridTop.current = y;
          })
        }
      >
      <ScrollView
        ref={scrollRef}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View style={{ height: HOUR_HEIGHT * 24 }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <View
              key={hour}
              style={[styles.hourRow, { top: hour * HOUR_HEIGHT, borderTopColor: colors.border }]}
            >
              <Text style={[typography.caption, styles.hourLabel, { color: colors.muted }]}>
                {formatClock(hour * 60)}
              </Text>
            </View>
          ))}

          <View
            style={[styles.nowLine, { top: (now / 60) * HOUR_HEIGHT, backgroundColor: colors.accent }]}
          />

          <GestureDetector gesture={createRange}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Schedule a task at this time"
              accessibilityHint="Tap for 30 minutes, or hold and drag to select a duration"
              onPress={(event) => {
                const minutes = minutesAt(event.nativeEvent.pageY);
                if (minutes !== null) onPickSlot(minutes, DEFAULT_DURATION_MINUTES);
              }}
              style={StyleSheet.absoluteFill}
            />
          </GestureDetector>

          {highlightedSlot ? (
            <View
              pointerEvents="none"
              style={[
                styles.selectedSlot,
                {
                  top: (highlightedSlot.minutes / 60) * HOUR_HEIGHT,
                  height: Math.max(30, (highlightedSlot.duration / 60) * HOUR_HEIGHT - 3),
                  backgroundColor: colors.accentSubtle,
                  borderColor: colors.accent,
                },
              ]}
            >
              <Text style={[typography.caption, styles.selectedSlotLabel, { color: colors.text }]}>
                {formatClock(highlightedSlot.minutes)} · {highlightedSlot.duration}m
              </Text>
            </View>
          ) : null}

          {timed.map((block) => (
            <TimeBlock
              key={block.task.id}
              block={block}
              onMove={onMoveTask}
              onResize={onResizeTask}
              onOpen={onOpenTask}
              onToggle={onToggleTask}
            />
          ))}
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

function TimeBlock({
  block,
  onMove,
  onResize,
  onOpen,
  onToggle,
}: {
  block: ScheduledBlock;
  onMove(taskId: string, minutes: number): void;
  onResize(taskId: string, duration: number): void;
  onOpen(taskId: string): void;
  onToggle(taskId: string): void;
}) {
  const { colors } = useTheme();
  const [preview, setPreview] = useState<{ minutes: number; duration: number } | null>(null);

  const minutes = preview?.minutes ?? block.minutes;
  const duration = Math.max(MIN_BLOCK_MINUTES, preview?.duration ?? block.duration);

  // Both gestures read the travelled distance rather than the finger's position
  // on screen, so the block keeps the grip the drag started with instead of
  // snapping its top edge under the fingertip.
  const move = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(180)
        .onUpdate((event) => {
          setPreview({
            minutes: snapMinutes(block.minutes + minutesFromOffset(event.translationY)),
            duration: block.duration,
          });
        })
        .onEnd((event) => {
          onMove(block.task.id, snapMinutes(block.minutes + minutesFromOffset(event.translationY)));
        })
        .onFinalize(() => setPreview(null))
        .runOnJS(true),
    [block.duration, block.minutes, block.task.id, onMove],
  );

  const resize = useMemo(
    () =>
      Gesture.Pan()
        // Claims the drag before the surrounding scroll view's own threshold,
        // which would otherwise scroll the day away under the handle.
        .activeOffsetY([-4, 4])
        .onUpdate((event) => {
          setPreview({
            minutes: block.minutes,
            duration: snapDuration(block.duration + minutesFromOffset(event.translationY)),
          });
        })
        .onEnd((event) => {
          onResize(
            block.task.id,
            snapDuration(block.duration + minutesFromOffset(event.translationY)),
          );
        })
        .onFinalize(() => setPreview(null))
        .runOnJS(true),
    [block.duration, block.minutes, block.task.id, onResize],
  );

  return (
    <GestureDetector gesture={move}>
      <View
        style={[
          styles.block,
          {
            top: (minutes / 60) * HOUR_HEIGHT,
            height: Math.max(30, (duration / 60) * HOUR_HEIGHT - 3),
            backgroundColor: colors.accentSubtle,
            borderColor: preview ? colors.accent : colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${block.task.completed ? "Reopen" : "Complete"} ${block.task.content}`}
          onPress={() => onToggle(block.task.id)}
          onLongPress={() => onOpen(block.task.id)}
          style={styles.blockBody}
        >
          <Text
            numberOfLines={1}
            style={[
              typography.caption,
              {
                color: block.task.completed ? colors.muted : colors.text,
                textDecorationLine: block.task.completed ? "line-through" : "none",
              },
            ]}
          >
            {block.task.content}
          </Text>
          {duration >= 45 ? (
            <Text style={[typography.caption, { color: colors.muted }]}>
              {formatClock(minutes)} · {duration}m
            </Text>
          ) : null}
        </Pressable>
        <GestureDetector gesture={resize}>
          <View style={styles.resizeHandle}>
            <View style={[styles.resizeBar, { backgroundColor: colors.borderStrong }]} />
          </View>
        </GestureDetector>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  allDay: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  allDayChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hourLabel: { position: "absolute", left: 0, top: -7, width: GUTTER_WIDTH - 8, textAlign: "right" },
  nowLine: { position: "absolute", left: GUTTER_WIDTH, right: 0, height: 2, borderRadius: 1 },
  selectedSlot: {
    position: "absolute",
    left: GUTTER_WIDTH,
    right: 4,
    paddingHorizontal: 8,
    paddingTop: 4,
    borderWidth: 1,
    borderRadius: radii.sm,
  },
  selectedSlotLabel: { fontVariant: ["tabular-nums"] },
  block: {
    position: "absolute",
    left: GUTTER_WIDTH,
    right: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  blockBody: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingTop: 1,
    paddingBottom: 14,
    gap: 1,
  },
  resizeHandle: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 18,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 3,
  },
  resizeBar: { width: 40, height: 4, borderRadius: 2 },
});
