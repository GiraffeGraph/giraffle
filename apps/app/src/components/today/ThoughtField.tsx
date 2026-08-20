import type { Page as PageModel } from "@giraffle/domain";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";

export type ThoughtDestination = "focus" | "later" | "keep" | "close";

interface ThoughtFieldProps {
  pages: PageModel[];
  onCapture(title: string): Promise<unknown>;
  onOpen(pageId: string): void;
  onRoute(page: PageModel, destination: ThoughtDestination): void;
}

interface Point {
  page: PageModel;
  x: number;
  y: number;
}

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const destinations: readonly {
  id: ThoughtDestination;
  label: string;
  icon: IconName;
}[] = [
  { id: "focus", label: "Focus", icon: "sunny-outline" },
  { id: "later", label: "Later", icon: "time-outline" },
  { id: "keep", label: "Keep", icon: "bookmark-outline" },
  { id: "close", label: "Close", icon: "close" },
];

const hash = (value: string): number => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

/**
 * Thoughts keep a stable home cell and only drift a few pixels around it. This
 * preserves spatial memory while retaining the quiet, organic MDR-like field.
 */
function placeThoughts(
  pages: PageModel[],
  width: number,
  height: number,
): { points: Point[]; hidden: number } {
  if (width <= 0 || height <= 0) return { points: [], hidden: pages.length };

  const horizontalPadding = 18;
  const topPadding = 18;
  const reservedBottom = 128;
  const usableWidth = Math.max(1, width - horizontalPadding * 2);
  const usableHeight = Math.max(1, height - topPadding - reservedBottom);
  const columns = Math.max(3, Math.floor(usableWidth / 76));
  const rows = Math.max(2, Math.floor(usableHeight / 64));
  const capacity = columns * rows;
  const cellWidth = usableWidth / columns;
  const cellHeight = usableHeight / rows;
  const occupied = new Set<number>();
  const visible = [...pages]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, capacity);

  const points = visible.map((page) => {
    const seed = hash(page.id);
    let slot = seed % capacity;
    while (occupied.has(slot)) slot = (slot + 1) % capacity;
    occupied.add(slot);

    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const jitterX = ((seed >>> 8) % 13) - 6;
    const jitterY = ((seed >>> 16) % 11) - 5;

    return {
      page,
      x: horizontalPadding + cellWidth * (column + 0.5) + jitterX,
      y: topPadding + cellHeight * (row + 0.5) + jitterY,
    };
  });

  return { points, hidden: Math.max(0, pages.length - visible.length) };
}

function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

function ThoughtDot({
  page,
  x,
  y,
  selected,
  reducedMotion,
  onSelect,
  onHover,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDrop,
}: {
  page: PageModel;
  x: number;
  y: number;
  selected: boolean;
  reducedMotion: boolean;
  onSelect(pageId: string): void;
  onHover(pageId: string | null): void;
  onDragStart(pageId: string): void;
  onDragMove(absoluteX: number, absoluteY: number): void;
  onDragEnd(): ThoughtDestination | null;
  onDrop(page: PageModel, destination: ThoughtDestination): void;
}) {
  const { colors } = useTheme();
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(1));
  const [arrival] = useState(() => new Animated.Value(0));
  const [driftX] = useState(() => new Animated.Value(0));
  const [driftY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(arrival, {
      toValue: 1,
      stiffness: 220,
      damping: 19,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [arrival]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const seed = hash(page.id);
    const distanceX = 1.5 + (seed % 3);
    const distanceY = 1 + ((seed >>> 4) % 3);
    let motion: ReturnType<typeof Animated.loop> | null = null;
    const timer = setTimeout(() => {
      motion = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(driftX, {
              toValue: distanceX,
              duration: 2400 + (seed % 900),
              useNativeDriver: true,
            }),
            Animated.timing(driftY, {
              toValue: -distanceY,
              duration: 2600 + (seed % 700),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(driftX, {
              toValue: -distanceX,
              duration: 2900 + (seed % 800),
              useNativeDriver: true,
            }),
            Animated.timing(driftY, {
              toValue: distanceY,
              duration: 2500 + (seed % 1000),
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      motion.start();
    }, seed % 700);

    return () => {
      clearTimeout(timer);
      motion?.stop();
    };
  }, [driftX, driftY, page.id, reducedMotion]);

  const settle = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        stiffness: 260,
        damping: 24,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 260,
        damping: 24,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.spring(lift, {
        toValue: 1,
        stiffness: 260,
        damping: 24,
        mass: 0.7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [lift, translateX, translateY]);

  const finish = useCallback(() => {
    const destination = onDragEnd();
    if (!destination) {
      settle();
      return;
    }
    Animated.parallel([
      Animated.timing(arrival, {
        toValue: 0,
        duration: reducedMotion ? 1 : 170,
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0.35,
        duration: reducedMotion ? 1 : 170,
        useNativeDriver: true,
      }),
    ]).start(() => onDrop(page, destination));
  }, [arrival, lift, onDragEnd, onDrop, page, reducedMotion, settle]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(5)
        .onStart(() => {
          translateX.setValue(0);
          translateY.setValue(0);
          Animated.spring(lift, {
            toValue: 1.3,
            stiffness: 300,
            damping: 20,
            mass: 0.6,
            useNativeDriver: true,
          }).start();
          onDragStart(page.id);
        })
        .onUpdate((event) => {
          translateX.setValue(event.translationX);
          translateY.setValue(event.translationY);
          onDragMove(event.absoluteX, event.absoluteY);
        })
        .onEnd(finish)
        .runOnJS(true),
    [
      finish,
      lift,
      onDragMove,
      onDragStart,
      page.id,
      translateX,
      translateY,
    ],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.dotHome,
          {
            left: x - 22,
            top: y - 22,
            opacity: arrival,
            transform: [{ translateX }, { translateY }, { scale: lift }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ translateX: driftX }, { translateY: driftY }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={page.title || "Untitled thought"}
            accessibilityState={{ selected }}
            hitSlop={5}
            onHoverIn={() => onHover(page.id)}
            onHoverOut={() => onHover(null)}
            onPress={() => onSelect(page.id)}
            style={styles.dotTouch}
          >
            <View
              style={[
                styles.dot,
                selected ? styles.dotSelected : null,
                {
                  backgroundColor: selected ? colors.accent : colors.secondary,
                  borderColor: colors.background,
                  shadowColor: colors.text,
                },
              ]}
            />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

export function ThoughtField({ pages, onCapture, onOpen, onRoute }: ThoughtFieldProps) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotion = useReduceMotion();
  const fieldHeight = windowWidth < WIDE_LAYOUT_MIN_WIDTH ? 330 : 390;
  const [draft, setDraft] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [fieldSize, setFieldSize] = useState({ width: 0, height: fieldHeight });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeDestination, setActiveDestination] = useState<ThoughtDestination | null>(null);
  const targetRefs = useRef(new Map<ThoughtDestination, View>());
  const targetRects = useRef(new Map<ThoughtDestination, TargetRect>());
  const destinationRef = useRef<ThoughtDestination | null>(null);

  const activeSelectedId =
    selectedId && pages.some((page) => page.id === selectedId) ? selectedId : null;
  const layout = useMemo(
    () => placeThoughts(pages, fieldSize.width, fieldSize.height),
    [fieldSize, pages],
  );
  const previewId = draggingId ?? activeSelectedId ?? hoveredId;
  const preview = pages.find((page) => page.id === previewId) ?? null;
  const targetsVisible = activeSelectedId !== null || draggingId !== null;

  const measureTargets = useCallback(() => {
    for (const [id, view] of targetRefs.current) {
      view.measureInWindow((x, y, width, height) => {
        targetRects.current.set(id, { x, y, width, height });
      });
    }
  }, []);

  const beginDrag = useCallback(
    (pageId: string) => {
      setSelectedId(pageId);
      setDraggingId(pageId);
      destinationRef.current = null;
      targetRects.current.clear();
      setActiveDestination(null);
      measureTargets();
    },
    [measureTargets],
  );

  const updateDrag = useCallback((absoluteX: number, absoluteY: number) => {
    let next: ThoughtDestination | null = null;
    for (const [id, rect] of targetRects.current) {
      if (
        absoluteX >= rect.x &&
        absoluteX <= rect.x + rect.width &&
        absoluteY >= rect.y &&
        absoluteY <= rect.y + rect.height
      ) {
        next = id;
        break;
      }
    }
    if (destinationRef.current !== next) {
      destinationRef.current = next;
      setActiveDestination(next);
    }
  }, []);

  const finishDrag = useCallback((): ThoughtDestination | null => {
    const destination = destinationRef.current;
    destinationRef.current = null;
    setDraggingId(null);
    setActiveDestination(null);
    if (destination) setSelectedId(null);
    return destination;
  }, []);

  const select = useCallback((pageId: string) => {
    setSelectedId((current) => (current === pageId ? null : pageId));
  }, []);

  const routeSelected = useCallback(
    (destination: ThoughtDestination) => {
      const page = pages.find((item) => item.id === activeSelectedId);
      if (!page) return;
      setSelectedId(null);
      onRoute(page, destination);
    },
    [activeSelectedId, onRoute, pages],
  );

  const submit = useCallback(async () => {
    const title = draft.trim();
    if (!title || capturing) return;
    setDraft("");
    setCapturing(true);
    try {
      await onCapture(title);
    } catch {
      setDraft(title);
    } finally {
      setCapturing(false);
    }
  }, [capturing, draft, onCapture]);

  const onFieldLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setFieldSize({ width, height });
      requestAnimationFrame(measureTargets);
    },
    [measureTargets],
  );

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: colors.surface, borderColor: colors.borderStrong },
      ]}
    >
      <View style={[styles.composer, { borderBottomColor: colors.border }]}>
        <TextInput
          accessibilityLabel="What's on your mind?"
          autoCapitalize="sentences"
          blurOnSubmit={false}
          editable={!capturing}
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.faint}
          returnKeyType="send"
          style={[styles.input, typography.body, { color: colors.text }]}
          value={draft}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Capture thought"
          accessibilityState={{ disabled: !draft.trim() || capturing }}
          disabled={!draft.trim() || capturing}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.send,
            {
              backgroundColor: draft.trim() ? colors.accent : colors.hover,
              opacity: capturing ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon
            name="arrow-up"
            size={18}
            color={draft.trim() ? colors.accentInk : colors.faint}
          />
        </Pressable>
      </View>

      <View style={[styles.field, { height: fieldHeight }]} onLayout={onFieldLayout}>
        {layout.points.map((point) => (
          <ThoughtDot
            key={point.page.id}
            page={point.page}
            x={point.x}
            y={point.y}
            selected={activeSelectedId === point.page.id}
            reducedMotion={reducedMotion}
            onSelect={select}
            onHover={setHoveredId}
            onDragStart={beginDrag}
            onDragMove={updateDrag}
            onDragEnd={finishDrag}
            onDrop={onRoute}
          />
        ))}

        {pages.length ? (
          <Text style={[styles.count, typography.caption, { color: colors.faint }]}>
            {pages.length}
          </Text>
        ) : null}
        {layout.hidden ? (
          <Text style={[styles.hiddenCount, typography.caption, { color: colors.muted }]}>
            +{layout.hidden}
          </Text>
        ) : null}

        {preview ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${preview.title}`}
            onPress={() => onOpen(preview.id)}
            style={[
              styles.preview,
              { backgroundColor: colors.surfaceStrong, borderColor: colors.border },
            ]}
          >
            <Text numberOfLines={2} style={[typography.body, { color: colors.text }]}>
              {preview.title || "Untitled"}
            </Text>
          </Pressable>
        ) : null}

        {targetsVisible ? (
          <View style={styles.targets}>
            {destinations.map((destination) => {
              const active = activeDestination === destination.id;
              const danger = destination.id === "close";
              return (
                <View
                  key={destination.id}
                  ref={(view) => {
                    if (view) targetRefs.current.set(destination.id, view);
                    else targetRefs.current.delete(destination.id);
                  }}
                  collapsable={false}
                  style={styles.targetMeasure}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${destination.label} selected thought`}
                    onLayout={measureTargets}
                    onPress={() => routeSelected(destination.id)}
                    style={({ pressed }) => [
                      styles.target,
                      {
                        backgroundColor: active ? colors.accentSubtle : colors.background,
                        borderColor: active
                          ? danger
                            ? colors.danger
                            : colors.accent
                          : colors.border,
                        opacity: pressed ? 0.65 : 1,
                        transform: [{ translateY: active ? -3 : 0 }],
                      },
                    ]}
                  >
                    <Icon
                      name={destination.icon}
                      size={17}
                      color={danger ? colors.danger : active ? colors.accent : colors.muted}
                    />
                    <Text
                      style={[
                        typography.caption,
                        { color: danger ? colors.danger : active ? colors.text : colors.muted },
                      ]}
                    >
                      {destination.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  composer: {
    minHeight: 58,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: spacing.sm,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    position: "relative",
    overflow: "hidden",
  },
  dotHome: {
    position: "absolute",
    width: 44,
    height: 44,
    zIndex: 1,
  },
  dotTouch: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: radii.full,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 2,
  },
  dotSelected: {
    width: 21,
    height: 21,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  count: {
    position: "absolute",
    right: spacing.md,
    top: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  hiddenCount: {
    position: "absolute",
    right: spacing.md,
    top: spacing.xxl,
    fontVariant: ["tabular-nums"],
  },
  preview: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: 73,
    minHeight: 42,
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  targets: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    height: 54,
    flexDirection: "row",
    gap: spacing.xs,
  },
  targetMeasure: {
    flex: 1,
    minWidth: 0,
  },
  target: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
});
